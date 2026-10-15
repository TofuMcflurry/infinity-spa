<?php

namespace App\Http\Controllers;

use App\Models\Service;
use App\Models\Wishlist;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;

class WishlistController extends Controller
{
    // Get all wishlist entries ng current customer
    public function index()
    {
        $wishlist = Wishlist::where('user_id', auth()->id())
            ->with(['service.variants'])
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($wishlist);
    }

    // Add service to wishlist
    public function store(Request $request)
    {
        $request->validate([
            'service_id' => 'required|integer|exists:services,id',
        ]);

        $service = Service::findOrFail($request->service_id);

        if (!$service->is_active || $service->isArchived()) {
            return response()->json([
                'message' => 'This service is not available to add to your wishlist.'
            ], 422);
        }

        $exists = Wishlist::where('user_id', auth()->id())
            ->where('service_id', $service->id)
            ->exists();

        if ($exists) {
            return response()->json([
                'message' => 'This service is already in your wishlist.'
            ], 422);
        }

        try {
            $wishlist = Wishlist::create([
                'user_id'    => auth()->id(),
                'service_id' => $service->id,
            ]);
        } catch (QueryException $e) {
            // Race condition guard — DB-level unique(user_id, service_id) tripped
            return response()->json([
                'message' => 'This service is already in your wishlist.'
            ], 422);
        }

        return response()->json([
            'wishlist' => $wishlist->load('service.variants'),
        ], 201);
    }

    // Remove service from wishlist
    public function destroy(Wishlist $wishlist)
    {
        abort_if($wishlist->user_id !== auth()->id(), 403);

        $wishlist->delete();

        return response()->json([
            'message' => 'Removed from wishlist!',
        ]);
    }
}
