<?php

namespace App\Services;

use App\Models\Booking;
use Carbon\Carbon;

class BookingCancellationService
{
    /**
     * The exact refund/forfeit decision tree already used by the customer-facing
     * cancellation flow (previously inlined in DownpaymentController::cancel()):
     * more than 24hrs before the scheduled session = refund, otherwise = forfeit,
     * with voucher-covered bookings restoring/forfeiting the voucher instead of
     * the downpayment. Extracted so admin-triggered resolutions (stale-session
     * "Cancel" / "Mark No-show") apply the identical rule instead of a new one.
     *
     * $forcedType lets a caller record a more specific outcome label (e.g.
     * 'no_show') while still running the same underlying forfeiture/refund
     * computation — it does not change what gets forfeited or refunded, only
     * how the outcome is labeled on the booking.
     *
     * @return array{cancellation_type: string, hours_until: int, voucher_restored?: bool, downpayment_status?: string}
     */
    public static function cancel(Booking $booking, string $reason, ?string $forcedType = null): array
    {
        $hoursUntil = now('Asia/Dubai')
            ->diffInHours(Carbon::parse($booking->scheduled_start)->timezone('Asia/Dubai'), false);
        $withinGrace = $hoursUntil > 24; // true = more than 24hrs away = refund

        // Durable forfeiture lock (see refund_forfeited_at's migration
        // docblock and BookingRescheduleService::reschedule(), the only
        // place this is ever set) — once a reschedule has moved this
        // booking away from an appointment that was already inside the
        // 24-hour window, cancellation must honor that forfeiture
        // regardless of how far away the CURRENT scheduled_start looks.
        // $forcedType (admin/spa-initiated exception labeling, e.g.
        // no-show) is untouched by this — it only ever relabels
        // cancellation_type, never the underlying downpayment_status/
        // voucher computation this lock protects.
        $forfeitedByReschedule = $booking->refund_forfeited_at !== null;

        if ($booking->is_voucher_covered) {
            $voucherRestored = false;

            if ($withinGrace && !$forfeitedByReschedule) {
                $restoreResult   = LoyaltyService::restoreVoucher($booking->id, $booking->customer_id);
                $voucherRestored = $restoreResult['success'];
            }

            $cancellationType = $forcedType ?? ($voucherRestored ? 'refunded' : 'forfeited');

            $booking->update([
                'status'              => 'cancelled',
                'cancelled_at'        => now(),
                'cancellation_type'   => $cancellationType,
                'cancellation_reason' => $reason,
            ]);

            return [
                'cancellation_type' => $cancellationType,
                'hours_until'       => $hoursUntil,
                'voucher_restored'  => $voucherRestored,
            ];
        }

        if ($booking->downpayment_status === 'pending') {
            $downpaymentStatus = 'refunded';
        } elseif ($forfeitedByReschedule) {
            $downpaymentStatus = 'forfeited';
        } elseif ($withinGrace) {
            $downpaymentStatus = 'refunded';
        } else {
            $downpaymentStatus = 'forfeited';
        }

        $cancellationType = $forcedType ?? $downpaymentStatus;

        $booking->update([
            'status'               => 'cancelled',
            'cancelled_at'         => now(),
            'cancellation_type'    => $cancellationType,
            'cancellation_reason'  => $reason,
            'downpayment_status'   => $downpaymentStatus,
        ]);

        return [
            'cancellation_type'   => $cancellationType,
            'hours_until'         => $hoursUntil,
            'downpayment_status'  => $downpaymentStatus,
        ];
    }
}
