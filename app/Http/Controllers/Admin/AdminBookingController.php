<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Inertia\Inertia;

// Audit Events
use App\Events\Audit\BookingAccepted;
use App\Events\Audit\BookingRejected;
use App\Events\Audit\BookingCancelled;
use App\Events\Audit\DownpaymentVerified;
use App\Events\Audit\RefundSent;

class AdminBookingController extends Controller
{
    public function index()
    {
        return Inertia::render('Admin/BookingsManager');
    }

    public function allBookings()
    {
        $bookings = Booking::with(['service', 'therapist.user', 'customer'])
            ->orderByDesc('created_at')
            ->get()
            ->map(fn($b) => $this->formatBooking($b));

        return response()->json($bookings);
    }

    public function pendingVerification()
    {
        $bookings = Booking::with(['service', 'therapist.user', 'customer'])
            ->where('downpayment_status', 'submitted')
            ->orderByDesc('downpayment_submitted_at')
            ->get()
            ->map(fn($b) => $this->formatBooking($b));

        return response()->json($bookings);
    }

    public function verifyDownpayment(Request $request)
    {
        $request->validate([
            'booking_id' => 'required|exists:bookings,id',
        ]);

        $booking = Booking::with(['service', 'therapist.user', 'customer'])
            ->findOrFail($request->booking_id);

        abort_if($booking->downpayment_status !== 'submitted', 422, 'No proof submitted to verify.');

        $booking->update([
            'downpayment_status'      => 'verified',
            'downpayment_verified_at' => now(),
            'status'                  => 'pending',
        ]);

        // ── Audit ──────────────────────────────────────────────────────────────
        DownpaymentVerified::dispatch(
            $booking->id,
            $booking->customer?->name ?? $booking->guest_name ?? 'Guest',
            $request,
        );

        return response()->json([
            'message' => 'Downpayment verified!',
            'booking' => $this->formatBooking($booking->fresh(['service', 'therapist.user', 'customer'])),
        ]);
    }

    public function pendingRefunds()
    {
        $bookings = Booking::with(['service', 'therapist.user', 'customer'])
            ->where('status', 'cancelled')
            ->where('cancellation_type', 'refunded')
            ->where('downpayment_status', 'refunded')
            ->orderByDesc('cancelled_at')
            ->get()
            ->map(fn($b) => $this->formatBooking($b));

        return response()->json($bookings);
    }

    public function markRefundSent(Request $request)
    {
        $request->validate([
            'booking_id'     => 'required|exists:bookings,id',
            'bank_reference' => 'required|string|max:100',
        ]);

        $booking = Booking::with(['customer', 'service'])
            ->findOrFail($request->booking_id);

        abort_if(
            $booking->cancellation_type !== 'refunded' || $booking->downpayment_status !== 'refunded',
            422,
            'This booking is not eligible for refund processing.'
        );

        $booking->update([
            'downpayment_status' => 'refund_sent',
            'refund_reference'   => $request->bank_reference,
            'refund_sent_at'     => now(),
        ]);

        // ── Audit ──────────────────────────────────────────────────────────────
        RefundSent::dispatch(
            $booking->id,
            $request->bank_reference,
            $request,
        );

        return response()->json([
            'message' => 'Refund marked as sent.',
            'booking' => $this->formatBooking($booking->fresh(['service', 'therapist.user', 'customer'])),
        ]);
    }

    public function cancelledHistory()
    {
        $bookings = Booking::with(['service', 'therapist.user', 'customer'])
            ->where('status', 'cancelled')
            ->whereNotNull('cancellation_type')
            ->orderByDesc('cancelled_at')
            ->get()
            ->map(fn($b) => $this->formatBooking($b));

        return response()->json($bookings);
    }

    public function stats()
    {
        $today = Carbon::today('Asia/Dubai');

        return response()->json([
            'total_bookings'       => Booking::count(),
            'pending_verification' => Booking::where('downpayment_status', 'submitted')->count(),
            'pending_refunds'      => Booking::where('status', 'cancelled')
                                             ->where('cancellation_type', 'refunded')
                                             ->where('downpayment_status', 'refunded')
                                             ->count(),
            'active_today'         => Booking::whereIn('status', ['accepted', 'en_route', 'arrived'])
                                             ->whereDate('scheduled_start', $today)
                                             ->count(),
            'completed_today'      => Booking::where('status', 'completed')
                                             ->whereDate('scheduled_start', $today)
                                             ->count(),
            'revenue_today'        => Booking::where('status', 'completed')
                                             ->whereDate('scheduled_start', $today)
                                             ->join('services', 'bookings.service_id', '=', 'services.id')
                                             ->sum('services.price'),
        ]);
    }

    private function formatBooking(Booking $b): array
    {
        return [
            'id'                       => $b->id,
            'ref'                      => 'IHS-' . str_pad($b->id, 5, '0', STR_PAD_LEFT),
            'customer_name'            => $b->customer?->name,
            'customer_email'           => $b->customer?->email,
            'customer_phone'           => $b->customer?->phone,
            'therapist_name'           => $b->therapist?->user?->name,
            'service_name'             => $b->service?->name,
            'service_price'            => $b->service?->price,
            'status'                   => $b->status,
            'payment_method'           => $b->payment_method,
            'location'                 => $b->location,
            'zone_name'                => $b->zone_name,
            'scheduled_start'          => $b->scheduled_start,
            'scheduled_start_fmt'      => $b->scheduled_start
                ? Carbon::parse($b->scheduled_start)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                : null,
            'downpayment_amount'       => $b->downpayment_amount,
            'remaining_amount'         => $b->remaining_amount,
            'downpayment_status'       => $b->downpayment_status,
            'downpayment_proof'        => $b->downpayment_proof,
            'downpayment_submitted_at' => $b->downpayment_submitted_at
                ? Carbon::parse($b->downpayment_submitted_at)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                : null,
            'downpayment_verified_at'  => $b->downpayment_verified_at
                ? Carbon::parse($b->downpayment_verified_at)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                : null,
            'cancellation_type'        => $b->cancellation_type,
            'cancellation_reason'      => $b->cancellation_reason,
            'cancelled_at'             => $b->cancelled_at
                ? Carbon::parse($b->cancelled_at)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                : null,
            'refund_reference'         => $b->refund_reference,
            'refund_sent_at'           => $b->refund_sent_at
                ? Carbon::parse($b->refund_sent_at)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                : null,
            'created_at'               => Carbon::parse($b->created_at)->timezone('Asia/Dubai')->format('M d, Y g:i A'),
        ];
    }
}