<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Models\ServiceVariant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

// Audit Events
use App\Events\Audit\ServiceCreated;
use App\Events\Audit\ServiceUpdated;
use App\Events\Audit\ServiceArchived;
use App\Events\Audit\ServiceRestored;
use App\Events\Audit\ServiceToggled;

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
            'variants.*.duration_minutes' => 'required|integer|min:1|distinct',
            'variants.*.price'            => 'required|numeric|min:0',
        ], [
            'variants.*.duration_minutes.distinct' => 'Duration options must be unique — remove the duplicate.',
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

            // ── Audit ──────────────────────────────────────────────────────────
            ServiceCreated::dispatch($service->id, $service->name, $request);

            return response()->json($this->transform($service->load('variants')), 201);
        } catch (\Illuminate\Database\QueryException $e) {
            DB::rollBack();
            if (in_array($e->getCode(), ['23505', '23000'])) {
                return response()->json([
                    'errors' => ['variants' => ['Duration options for this service must be unique.']],
                ], 422);
            }
            return response()->json(['message' => 'Unable to save service.'], 500);
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
            'variants.*.id'               => [
                'nullable',
                'integer',
                Rule::exists('service_variants', 'id')->where(fn($q) => $q->where('service_id', $service->id)),
            ],
            'variants.*.duration_minutes' => 'required|integer|min:1|distinct',
            'variants.*.price'            => 'required|numeric|min:0',
            'variants.*.is_active'        => 'nullable|boolean',
        ], [
            'variants.*.id.exists'                 => 'One of the submitted duration options does not belong to this service.',
            'variants.*.duration_minutes.distinct' => 'Duration options must be unique — remove the duplicate.',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data          = $validator->validated();
        $variantsInput = $data['variants'];
        unset($data['variants'], $data['remove_image']);

        // Variants still referenced by bookings must never be hard-deleted — omitting
        // one from the payload retains it instead, so booking history stays intact.
        // Admins disable a duration via its is_active toggle, not by removing it.
        $existing    = $service->variants;
        $incomingIds = collect($variantsInput)->pluck('id')->filter()->values()->all();
        $toRemove    = $existing->whereNotIn('id', $incomingIds);
        $retained    = $toRemove->filter(fn($variant) => $variant->bookings()->exists());
        $toDelete    = $toRemove->reject(fn($variant) => $retained->contains('id', $variant->id));

        if ($retained->isNotEmpty()) {
            $submittedDurations = collect($variantsInput)->pluck('duration_minutes');
            $collision = $retained->first(fn($variant) => $submittedDurations->contains($variant->duration_minutes));
            if ($collision) {
                return response()->json([
                    'errors' => ['variants' => ["Duration {$collision->duration_minutes} min is already used by a duration option with booking history and can't be removed."]],
                ], 422);
            }
        }

        DB::beginTransaction();
        try {
            if ($request->hasFile('image')) {
                if ($service->image) Storage::disk('public')->delete($service->image);
                $data['image'] = $request->file('image')->store('services', 'public');
            } elseif ($request->boolean('remove_image') && $service->image) {
                Storage::disk('public')->delete($service->image);
                $data['image'] = null;
            }

            $service->update($data);

            foreach ($toDelete as $variant) {
                $variant->delete();
            }

            foreach ($variantsInput as $v) {
                if (!empty($v['id'])) {
                    $service->variants()->where('id', $v['id'])->update([
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

            // ── Audit ──────────────────────────────────────────────────────────
            ServiceUpdated::dispatch($service->id, $service->name, [], $request);

            return response()->json($this->transform($service->load('variants')));
        } catch (\Illuminate\Database\QueryException $e) {
            DB::rollBack();
            if (in_array($e->getCode(), ['23505', '23000'])) {
                return response()->json([
                    'errors' => ['variants' => ['Duration options for this service must be unique.']],
                ], 422);
            }
            return response()->json(['message' => 'Unable to save service changes.'], 500);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    public function toggleActive(Request $request, Service $service)
    {
        $service->update(['is_active' => !$service->is_active]);

        // ── Audit ──────────────────────────────────────────────────────────────
        ServiceToggled::dispatch($service->id, $service->name, $service->is_active, $request);

        return response()->json($this->transform($service->load('variants')));
    }

    public function archive(Request $request, Service $service)
    {
        // archived_at alone is the authoritative "hidden from customers"
        // signal everywhere it's checked (getServices(), getAvailableSlots(),
        // store(), guest services()) — is_active is deliberately left
        // untouched here so restore() can later give it back exactly as it
        // was, instead of forcing every archived service through "active."
        $service->update(['archived_at' => now()]);

        // ── Audit ──────────────────────────────────────────────────────────────
        ServiceArchived::dispatch($service->id, $service->name, $request);

        return response()->json(['message' => 'Service archived.']);
    }

    public function restore(Request $request, Service $service)
    {
        // Only clears archived_at — is_active is never touched here, so a
        // service that was inactive before archiving comes back inactive,
        // and one that was active comes back active. A record archived
        // before this fix (is_active already forced false at archive time)
        // restores to inactive, matching its last known true state; nothing
        // here guesses or backfills what it "should" have been.
        $service->update(['archived_at' => null]);

        // ── Audit ──────────────────────────────────────────────────────────────
        ServiceRestored::dispatch($service->id, $service->name, $request);

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