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

            // Keep free-text reasons out of audit metadata; persist atomically.
            \App\Events\Audit\CustomerBookingCancelled::dispatch($booking->id, null, $request);

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

        // Batch #28.1: cancellation_type is null when
        // BookingCancellationService::cancel() found no confirmed
        // collection at all (nothing paid, nothing to refund or forfeit) —
        // the previous two-way ternary here would have told the customer
        // their downpayment was "forfeited" even though nothing was ever
        // collected, since a plain unpaid cancel's cancellation_type used
        // to always come back 'refunded' and never anything else.
        $downpaymentMessage = match ($result['cancellation_type']) {
            'refunded'  => 'Your downpayment will be refunded within 3-5 business days.',
            'forfeited' => 'Your downpayment has been forfeited as per our cancellation policy.',
            default     => 'No payment was collected for this booking, so there is nothing to refund or forfeit.',
        };

        return response()->json([
            'message'           => 'Booking cancelled.',
            'cancellation_type' => $result['cancellation_type'],
            'hours_until'       => $result['hours_until'],
            'downpayment'       => $downpaymentMessage,
        ]);
    }
}
