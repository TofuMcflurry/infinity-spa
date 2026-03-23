<?php

namespace App\Http\Controllers;

use App\Models\CustomerAddress;
use Illuminate\Http\Request;

class AddressController extends Controller
{
    // Get all addresses ng current customer
    public function index()
    {
        $addresses = CustomerAddress::where('user_id', auth()->id())
            ->orderBy('is_default', 'desc')
            ->orderBy('created_at', 'asc')
            ->get();

        return response()->json($addresses);
    }

    // Add new address
    public function store(Request $request)
    {
        $allowedZones = [
            'JAFZA', 'DAFZ', 'DMCC / JLT',
            'Dubai South', 'Dubai Silicon Oasis',
            'Dubai Internet City', 'Dubai Design District', 'DIFC',
        ];

        $request->validate([
            'label'      => 'required|string|max:100',
            'address'    => 'required|string|max:255',
            'zone_name'  => 'required|string|in:' . implode(',', $allowedZones),
        ]);

        $customer = auth()->user();

        if ($customer->addresses()->count() >= 3) {
            return response()->json([
                'message' => 'Maximum of 3 addresses allowed.'
            ], 422);
        }

        $isDefault = $customer->addresses()->count() === 0;

        $address = $customer->addresses()->create([
            'label'      => $request->label,
            'address'    => $request->address,
            'zone_name'  => $request->zone_name,
            'is_default' => $isDefault,
        ]);

        return response()->json(['address' => $address], 201);
    }

    // Update address
    public function update(Request $request, CustomerAddress $address)
    {
        // Make sure owned by current user
        abort_if($address->user_id !== auth()->id(), 403);

        $request->validate([
            'label'      => 'sometimes|string|max:50',
            'address'    => 'sometimes|string|max:255',
            'zone_name'  => 'sometimes|string|max:100',
            'is_default' => 'sometimes|boolean',
        ]);

        // Kung is_default = true, i-remove muna sa iba
        if ($request->is_default) {
            CustomerAddress::where('user_id', auth()->id())
                ->where('id', '!=', $address->id)
                ->update(['is_default' => false]);
        }

        $address->update($request->only([
            'label', 'address', 'zone_name', 'is_default'
        ]));

        return response()->json([
            'message' => 'Address updated!',
            'address' => $address->fresh(),
        ]);
    }

    // Delete address
    public function destroy(CustomerAddress $address)
    {
        abort_if($address->user_id !== auth()->id(), 403);

        $wasDefault = $address->is_default;
        $address->delete();

        // Kung na-delete ang default — i-set ang pinakabago as default
        if ($wasDefault) {
            $next = CustomerAddress::where('user_id', auth()->id())
                ->orderBy('created_at', 'asc')
                ->first();

            if ($next) {
                $next->update(['is_default' => true]);
            }
        }

        return response()->json([
            'message' => 'Address deleted!',
        ]);
    }

    // Set as default
    public function setDefault(CustomerAddress $address)
    {
        abort_if($address->user_id !== auth()->id(), 403);

        // Remove default sa lahat
        CustomerAddress::where('user_id', auth()->id())
            ->update(['is_default' => false]);

        // Set new default
        $address->update(['is_default' => true]);

        return response()->json([
            'message' => 'Default address updated!',
            'address' => $address->fresh(),
        ]);
    }
}