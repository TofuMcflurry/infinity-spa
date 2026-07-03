<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Models\ServiceVariant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Inertia\Inertia;

class AdminServiceController extends Controller
{
    public function index()
    {
        return Inertia::render('Admin/Services');
    }

    public function list(Request $request)
    {
        $showArchived = $request->boolean('archived', false);

        $services = Service::with('variants')
            ->when($showArchived, fn($q) => $q->whereNotNull('archived_at'))
            ->when(!$showArchived, fn($q) => $q->whereNull('archived_at'))
            ->orderBy('name')
            ->get()
            ->map(fn($s) => $this->transform($s));

        return response()->json($services);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name'                        => 'required|string|max:255',
            'name_ar'                     => 'nullable|string|max:255',
            'description'                 => 'nullable|string',
            'category'                    => 'nullable|string|max:255',
            'group_name'                  => 'nullable|string|max:255',
            'group_name_ar'               => 'nullable|string|max:255',
            'is_active'                   => 'boolean',
            'image'                       => 'nullable|image|max:4096',
            'variants'                    => 'required|array|min:1',
            'variants.*.duration_minutes' => 'required|integer|min:1',
            'variants.*.price'            => 'required|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $data = $validator->validated();
            unset($data['variants']);

            if ($request->hasFile('image')) {
                $data['image'] = $request->file('image')->store('services', 'public');
            }

            $service = Service::create($data);

            foreach ($request->input('variants') as $v) {
                ServiceVariant::create([
                    'service_id'       => $service->id,
                    'duration_minutes' => $v['duration_minutes'],
                    'price'            => $v['price'],
                    'is_active'        => true,
                ]);
            }

            DB::commit();
            return response()->json($this->transform($service->load('variants')), 201);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    public function update(Request $request, Service $service)
    {
        $validator = Validator::make($request->all(), [
            'name'                        => 'required|string|max:255',
            'name_ar'                     => 'nullable|string|max:255',
            'description'                 => 'nullable|string',
            'category'                    => 'nullable|string|max:255',
            'group_name'                  => 'nullable|string|max:255',
            'group_name_ar'               => 'nullable|string|max:255',
            'is_active'                   => 'boolean',
            'image'                       => 'nullable|image|max:4096',
            'remove_image'                => 'nullable|boolean',
            'variants'                    => 'required|array|min:1',
            'variants.*.id'               => 'nullable|integer',
            'variants.*.duration_minutes' => 'required|integer|min:1',
            'variants.*.price'            => 'required|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $data = $validator->validated();
            $variantsInput = $data['variants'];
            unset($data['variants'], $data['remove_image']);

            if ($request->hasFile('image')) {
                if ($service->image) Storage::disk('public')->delete($service->image);
                $data['image'] = $request->file('image')->store('services', 'public');
            } elseif ($request->boolean('remove_image') && $service->image) {
                Storage::disk('public')->delete($service->image);
                $data['image'] = null;
            }

            $service->update($data);

            $incomingIds = collect($variantsInput)->pluck('id')->filter()->all();
            $service->variants()->whereNotIn('id', $incomingIds)->delete();

            foreach ($variantsInput as $v) {
                if (!empty($v['id'])) {
                    ServiceVariant::where('id', $v['id'])->update([
                        'duration_minutes' => $v['duration_minutes'],
                        'price'            => $v['price'],
                        'is_active'        => filter_var($v['is_active'] ?? true, FILTER_VALIDATE_BOOLEAN),
                    ]);
                } else {
                    ServiceVariant::create([
                        'service_id'       => $service->id,
                        'duration_minutes' => $v['duration_minutes'],
                        'price'            => $v['price'],
                        'is_active'        => true,
                    ]);
                }
            }

            DB::commit();
            return response()->json($this->transform($service->load('variants')));
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    public function toggleActive(Service $service)
    {
        $service->update(['is_active' => !$service->is_active]);
        return response()->json($this->transform($service->load('variants')));
    }

    public function archive(Service $service)
    {
        $service->update(['archived_at' => now(), 'is_active' => false]);
        return response()->json(['message' => 'Service archived.']);
    }

    public function restore(Service $service)
    {
        $service->update(['archived_at' => null, 'is_active' => true]);
        return response()->json($this->transform($service->load('variants')));
    }

    private function transform(Service $service): array
    {
        return [
            'id'            => $service->id,
            'name'          => $service->name,
            'name_ar'       => $service->name_ar,
            'description'   => $service->description,
            'category'      => $service->category,
            'group_name'    => $service->group_name,
            'group_name_ar' => $service->group_name_ar,
            'is_active'     => (bool) $service->is_active,
            'rating'        => $service->rating !== null ? (float) $service->rating : null,
            'image'         => $service->image,
            'image_url'     => $service->image ? Storage::disk('public')->url($service->image) : null,
            'archived_at'   => $service->archived_at,
            'variants'      => $service->variants->map(fn($v) => [
                'id'               => $v->id,
                'duration_minutes' => $v->duration_minutes,
                'price'            => (float) $v->price,
                'is_active'        => (bool) $v->is_active,
            ])->values()->all(),
        ];
    }
}