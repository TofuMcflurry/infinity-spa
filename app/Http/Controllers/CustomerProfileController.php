<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CustomerProfileController extends Controller
{
    // ── Get profile data ──────────────────────────────────────────────────────
    public function show()
    {
        $user = auth()->user()->load('addresses');

        return response()->json([
            'id'         => $user->id,
            'name'       => $user->name,
            'email'      => $user->email,
            'phone'      => $user->phone,
            'avatar'     => $user->avatar
                                ? asset('storage/' . $user->avatar)
                                : null,
            'member_since' => $user->created_at->format('F Y'),
            'addresses'  => $user->addresses,
        ]);
    }

    // ── Update name & phone ───────────────────────────────────────────────────
    public function update(Request $request)
    {
        $request->validate([
            'name'  => 'required|string|max:255',
            'phone' => 'nullable|string|max:20',
        ]);

        $user = auth()->user();
        $user->update([
            'name'  => $request->name,
            'phone' => $request->phone,
        ]);

        return response()->json([
            'message' => 'Profile updated!',
            'user'    => [
                'name'  => $user->name,
                'phone' => $user->phone,
            ],
        ]);
    }

    // ── Upload avatar ─────────────────────────────────────────────────────────
    public function uploadAvatar(Request $request)
    {
        $request->validate([
            'avatar' => 'required|image|mimes:jpg,jpeg,png,webp|max:2048',
        ]);

        $user = auth()->user();

        // Delete old avatar if exists
        if ($user->avatar) {
            Storage::disk('public')->delete($user->avatar);
        }

        // Store new avatar
        $path = $request->file('avatar')->store('avatars', 'public');

        $user->update(['avatar' => $path]);

        return response()->json([
            'message' => 'Avatar updated!',
            'avatar'  => asset('storage/' . $path),
        ]);
    }
}