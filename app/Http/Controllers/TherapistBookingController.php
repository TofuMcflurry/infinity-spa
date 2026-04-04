<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use Illuminate\Http\Request;
use App\Notifications\BookingNotification;

class TherapistBookingController extends Controller
{
    // ── List all bookings for this therapist ──────────────────────────────────
    public function index()
    {
        $therapist = auth()->user()->therapist;

        $bookings = Booking::with(['customer', 'service'])
            ->where('therapist_id', $therapist->id)
            ->orderBy('scheduled_start', 'asc')
            ->get()
            ->groupBy('status');

        return response()->json($bookings);
    }

    // ── Accept a booking ──────────────────────────────────────────────────────
    public function accept(Booking $booking)
    {
        $this->authorizeTherapist($booking);

        $booking->update(['status' => 'accepted']);

        // Notify customer
        $booking->load('customer', 'service', 'therapist.user');
        $booking->customer->notify(new BookingNotification($booking, 'accepted'));

        return response()->json([
            'message' => 'Booking accepted!',
            'booking' => $booking,
        ]);
    }

    // ── Reject a booking ──────────────────────────────────────────────────────
    public function reject(Request $request, Booking $booking)
    {
        $this->authorizeTherapist($booking);

        $request->validate([
            'reason' => 'nullable|string|max:255',
        ]);

        $booking->update([
            'status'           => 'rejected',
            'rejection_reason' => $request->reason,
        ]);

        // Notify customer
        $booking->load('customer', 'service', 'therapist.user');
        $booking->customer->notify(new BookingNotification($booking, 'rejected'));

        return response()->json([
            'message' => 'Booking rejected.',
            'booking' => $booking,
        ]);
    }

    // ── Mark as en route ──────────────────────────────────────────────────────
    public function enRoute(Booking $booking)
    {
        $this->authorizeTherapist($booking);

        $booking->update(['status' => 'en_route']);

        // Notify customer
        $booking->load('customer', 'service', 'therapist.user');
        $booking->customer->notify(new BookingNotification($booking, 'en_route'));

        return response()->json([
            'message' => 'Status updated to en route!',
            'booking' => $booking,
        ]);
    }

    // ── Mark as arrived ───────────────────────────────────────────────────────
    public function arrived(Booking $booking)
    {
        $this->authorizeTherapist($booking);

        $booking->update(['status' => 'arrived']);

        // Notify customer
        $booking->load('customer', 'service', 'therapist.user');
        $booking->customer->notify(new BookingNotification($booking, 'arrived'));

        return response()->json([
            'message' => 'Status updated to arrived!',
            'booking' => $booking,
        ]);
    }

    // ── Complete a booking ────────────────────────────────────────────────────
    public function complete(Booking $booking)
    {
        $this->authorizeTherapist($booking);

        $booking->update(['status' => 'completed']);

        // Notify customer
        $booking->load('customer', 'service', 'therapist.user');
        $booking->customer->notify(new BookingNotification($booking, 'completed'));

        return response()->json([
            'message' => 'Booking marked as completed!',
            'booking' => $booking,
        ]);
    }

    // ── Get therapist profile ─────────────────────────────────────────────────
    public function profile()
    {
        $therapist = auth()->user()->therapist;
        $therapist->load('user', 'zones');

        return response()->json([
            'name'             => $therapist->user->name,
            'email'            => $therapist->user->email,
            'phone'            => $therapist->user->phone,
            'avatar'           => $therapist->user->avatar,
            'bio'              => $therapist->bio,
            'specialty'        => $therapist->specialty,
            'experience_years' => $therapist->experience_years,
            'gender'           => $therapist->gender,
            'base_location'    => $therapist->base_location,
            'rating'           => $therapist->rating,
            'is_active'        => $therapist->is_active,
            'day_off'          => $therapist->day_off,
            'shift_start'      => $therapist->shift_start,
            'shift_end'        => $therapist->shift_end,
            'crosses_midnight' => $therapist->crosses_midnight,
            'zones'            => $therapist->zones,
        ]);
    }

    // ── Update therapist profile ──────────────────────────────────────────────
    public function updateProfile(Request $request)
    {
        $request->validate([
            'bio'   => 'nullable|string|max:1000',
            'phone' => 'nullable|string|max:20',
        ]);

        $user      = auth()->user();
        $therapist = $user->therapist;

        if ($request->has('bio')) {
            $therapist->update(['bio' => $request->bio]);
        }

        if ($request->has('phone')) {
            $user->update(['phone' => $request->phone]);
        }

        return response()->json(['message' => 'Profile updated successfully.']);
    }

    // ── Upload avatar ─────────────────────────────────────────────────────────
    public function updateAvatar(Request $request)
    {
        $request->validate([
            'avatar' => 'required|image|mimes:jpeg,png,jpg,webp|max:2048',
        ]);

        $user = auth()->user();

        $path = $request->file('avatar')->store('avatars', 'public');
        $url  = asset('storage/' . $path);

        $user->update(['avatar' => $url]);

        return response()->json([
            'message' => 'Avatar updated successfully.',
            'avatar'  => $url,
        ]);
    }

    // ── Authorize therapist ───────────────────────────────────────────────────
    private function authorizeTherapist(Booking $booking): void
    {
        $therapist = auth()->user()->therapist;

        abort_if(
            $booking->therapist_id !== $therapist->id,
            403,
            'Unauthorized.'
        );
    }
}