<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use Illuminate\Http\Request;

class DownpaymentController extends Controller
{
    // ── Cancel booking ────────────────────────────────────────────────────────
    public function cancel(Request $request)
    {
        $request->validate([
            'booking_id'          => 'required|exists:bookings,id',
            'cancellation_reason' => 'required|string|max:500',
        ]);

        $customerId = auth()->id();
        $booking    = Booking::with('service')
            ->where('id', $request->booking_id)
            ->where('customer_id', $customerId)
            ->whereIn('status', ['pending_payment', 'pending', 'accepted'])
            ->firstOrFail();

        $result = \App\Services\BookingCancellationService::cancel($booking, $request->cancellation_reason);

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
