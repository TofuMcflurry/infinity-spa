<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use Carbon\Carbon;
use Illuminate\Http\Request;

class AdminBookingController extends Controller
{
    // ── Get all bookings eligible for refund ──────────────────────────────────
    public function pendingRefunds()
    {
        $bookings = Booking::with(['service', 'therapist.user', 'customer'])
            ->where('status', 'cancelled')
            ->where('cancellation_type', 'refunded')
            ->where('downpayment_status', 'refunded')
            ->orderByDesc('cancelled_at')
            ->get()
            ->map(fn($b) => [
                'id'                  => $b->id,
                'ref'                 => 'IHS-' . str_pad($b->id, 5, '0', STR_PAD_LEFT),
                'customer'            => $b->customer->name,
                'customer_email'      => $b->customer->email,
                'service'             => $b->service->name,
                'downpayment_amount'  => $b->downpayment_amount,
                'cancellation_reason' => $b->cancellation_reason,
                'cancelled_at'        => Carbon::parse($b->cancelled_at)
                                            ->timezone('Asia/Dubai')
                                            ->format('M d, Y g:i A'),
            ]);

        return response()->json($bookings);
    }

    // ── Mark refund as sent ───────────────────────────────────────────────────
    public function markRefundSent(Request $request)
    {
        $request->validate([
            'booking_id'     => 'required|exists:bookings,id',
            'bank_reference' => 'required|string|max:100',
        ]);

        $booking = Booking::with(['customer', 'service'])
            ->findOrFail($request->booking_id);

        // Make sure it's actually a refundable booking
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

        // Uncomment when you create RefundSentNotification:
        // $booking->customer->notify(new \App\Notifications\RefundSentNotification($booking));

        return response()->json([
            'message' => 'Refund marked as sent.',
            'ref'     => 'IHS-' . str_pad($booking->id, 5, '0', STR_PAD_LEFT),
        ]);
    }

    // ── Get all cancelled bookings (forfeited + refund_sent history) ──────────
    public function cancelledHistory()
    {
        $bookings = Booking::with(['service', 'therapist.user', 'customer'])
            ->where('status', 'cancelled')
            ->whereNotNull('cancellation_type')
            ->orderByDesc('cancelled_at')
            ->get()
            ->map(fn($b) => [
                'id'                  => $b->id,
                'ref'                 => 'IHS-' . str_pad($b->id, 5, '0', STR_PAD_LEFT),
                'customer'            => $b->customer->name,
                'customer_email'      => $b->customer->email,
                'service'             => $b->service->name,
                'downpayment_amount'  => $b->downpayment_amount,
                'cancellation_type'   => $b->cancellation_type,
                'cancellation_reason' => $b->cancellation_reason,
                'downpayment_status'  => $b->downpayment_status,
                'refund_reference'    => $b->refund_reference,
                'refund_sent_at'      => $b->refund_sent_at
                    ? Carbon::parse($b->refund_sent_at)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                    : null,
                'cancelled_at'        => $b->cancelled_at
                    ? Carbon::parse($b->cancelled_at)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                    : null,
            ]);

        return response()->json($bookings);
    }
}