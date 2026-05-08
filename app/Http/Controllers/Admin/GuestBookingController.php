<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\SendGuestConversionEmail;
use App\Mail\GuestBookingApproved;
use App\Mail\GuestBookingRejected;
use App\Mail\GuestConversionPromo;
use App\Models\Booking;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Inertia\Inertia;

class GuestBookingController extends Controller
{
    public function index()
    {
        $pendingBookings = Booking::with(['service'])
            ->whereNull('customer_id')
            ->whereIn('status', ['pending', 'accepted'])
            ->orderBy('created_at', 'asc')
            ->get();

        $completedBookings = Booking::with(['service'])
            ->whereNull('customer_id')
            ->where('status', 'completed')
            ->orderBy('updated_at', 'desc')
            ->get();

        $rejectedBookings = Booking::with(['service'])
            ->whereNull('customer_id')
            ->where('status', 'rejected')
            ->orderBy('updated_at', 'desc')
            ->get();

        $stats = [
            'pending_count' => Booking::whereNull('customer_id')->where('status', 'pending')->count(),
            'accepted_count' => Booking::whereNull('customer_id')->where('status', 'accepted')->count(),
            'completed_count' => Booking::whereNull('customer_id')->where('status', 'completed')->count(),
            'rejected_count' => Booking::whereNull('customer_id')->where('status', 'rejected')->count(),
        ];

        return Inertia::render('Admin/GuestBookings', [
            'pending_bookings' => $pendingBookings,
            'completed_bookings' => $completedBookings,
            'rejected_bookings' => $rejectedBookings,
            'stats' => $stats,
        ]);
    }

    public function approve(Booking $booking)
    {
        abort_unless(is_null($booking->customer_id), 403);
        abort_unless($booking->status === 'pending', 403);

        $booking->update(['status' => 'accepted']);

        $booking->load('service');
        Mail::to($booking->guest_email)->send(new GuestBookingApproved($booking));

        return redirect()->back()->with('success', "Booking #{$booking->id} approved.");
    }

    public function reject(Request $request, Booking $booking)
    {
        abort_unless(is_null($booking->customer_id), 403);
        abort_unless($booking->status === 'pending' || $booking->status === 'accepted', 403);

        $request->validate([
            'rejection_reason' => 'required|string|max:500',
        ]);

        $booking->update([
            'status' => 'rejected',
            'rejection_reason' => $request->rejection_reason,
            'rejected_at' => now(),
        ]);

        $booking->load('service');
        Mail::to($booking->guest_email)->send(new GuestBookingRejected($booking, $request->rejection_reason));

        return redirect()->back()->with('success', "Booking #{$booking->id} rejected.");
    }

    public function complete(Booking $booking)
    {
        abort_unless(is_null($booking->customer_id), 403);
        abort_unless($booking->status === 'accepted', 403);

        $booking->update(['status' => 'completed']);  // ← tanggalin ang completed_at

        SendGuestConversionEmail::dispatch($booking)->delay(now()->addDay());

        return redirect()->back()->with('success', "Booking #{$booking->id} marked completed.");
    }

    public function sendPromo(Booking $booking)
    {
        abort_unless(is_null($booking->customer_id), 403);
        abort_unless($booking->status === 'completed', 403);

        $booking->load('service');
        Mail::to($booking->guest_email)->send(new GuestConversionPromo($booking));

        // Optional: pwede mong i-mark as sent para hindi na ulit mag-send
        // $booking->update(['promo_sent_at' => now()]);

        return redirect()->back()->with('success', "Promo email sent to {$booking->guest_email}.");
    }
}