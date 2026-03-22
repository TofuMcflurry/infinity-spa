<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use Illuminate\Http\Request;
use Inertia\Inertia;

class TherapistBookingController extends Controller
{
    // List all bookings for this therapist
    public function index()
    {
        $therapist = auth()->user()->therapist;

        $bookings = Booking::with(['customer', 'service'])
            ->where('therapist_id', $therapist->id)
            ->orderBy('scheduled_date', 'asc')
            ->orderBy('scheduled_start', 'asc')
            ->get()
            ->groupBy('status');

        return response()->json($bookings);
    }

    // Accept a booking
    public function accept(Booking $booking)
    {
        $this->authorizeTherapist($booking);

        $booking->update(['status' => 'accepted']);

        // TODO: Notify customer (email/push notification)

        return response()->json([
            'message' => 'Booking accepted!',
            'booking' => $booking->load('customer', 'service'),
        ]);
    }

    // Reject a booking
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

        // TODO: Notify customer (email/push notification)

        return response()->json([
            'message' => 'Booking rejected.',
            'booking' => $booking->load('customer', 'service'),
        ]);
    }

    // Complete a booking
    public function complete(Booking $booking)
    {
        $this->authorizeTherapist($booking);

        $booking->update(['status' => 'completed']);

        return response()->json([
            'message' => 'Booking marked as completed!',
            'booking' => $booking->load('customer', 'service'),
        ]);
    }

    // Ensure therapist owns this booking
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