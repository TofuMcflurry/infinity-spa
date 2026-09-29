<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Notifications\BookingNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DownpaymentController extends Controller
{
    // ── Cancel booking ────────────────────────────────────────────────────────
    // This is the single customer-initiated cancellation entry point (admin's
    // stale-session resolution and the therapist's own cancel() call the same
    // BookingCancellationService independently — neither is touched here).
    // Row-locked and status re-checked inside the transaction so a retried or
    // double-submitted cancel request can't run the refund/forfeit logic (or
    // send the notification) twice for the same booking.
    public function cancel(Request $request)
    {
        $request->validate([
            'booking_id'          => 'required|exists:bookings,id',
            'cancellation_reason' => 'required|string|max:500',
        ]);

        $customerId = auth()->id();

        [$booking, $result] = DB::transaction(function () use ($request, $customerId) {
            $booking = Booking::with(['service', 'customer'])
                ->where('id', $request->booking_id)
                ->where('customer_id', $customerId)
                ->lockForUpdate()
                ->firstOrFail();

            abort_if(
                !in_array($booking->status, ['pending_payment', 'pending', 'accepted']),
                422,
                'This booking can no longer be cancelled.'
            );

            $result = \App\Services\BookingCancellationService::cancel($booking, $request->cancellation_reason);

            return [$booking, $result];
        });

        $booking->customer->notify(new BookingNotification($booking, 'customer_cancelled'));

        if ($booking->is_voucher_covered) {
            return response()->json([
                'message'           => 'Booking cancelled.',
                'cancellation_type' => $result['cancellation_type'],
                'hours_until'       => $result['hours_until'],
                'voucher_restored'  => $result['voucher_restored'],
                'downpayment'       => $result['voucher_restored']
                    ? "Your voucher {$booking->voucher_code} has been restored and can be used on a future booking."
                    : 'Your voucher has been forfeited as per our cancellation policy (cancelled within 24hrs of the session).',
            ]);
        }

        return response()->json([
            'message'           => 'Booking cancelled.',
            'cancellation_type' => $result['cancellation_type'],
            'hours_until'       => $result['hours_until'],
            'downpayment'       => $result['cancellation_type'] === 'refunded'
                ? 'Your downpayment will be refunded within 3-5 business days.'
                : 'Your downpayment has been forfeited as per our cancellation policy.',
        ]);
    }
}
