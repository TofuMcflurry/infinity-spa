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