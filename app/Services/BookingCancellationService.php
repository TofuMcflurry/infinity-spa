<?php

namespace App\Services;

use App\Models\Booking;
use Carbon\Carbon;

class BookingCancellationService
{
    /**
     * Batch #28.1 — the single source of truth for "was a real, positive
     * amount of money actually collected for this booking," across BOTH
     * payment systems this app has ever used. Added after a diagnostic
     * audit confirmed downpayment_status='pending' (every booking's
     * creation-time default, Stripe-paid or not — see BookingController::
     * store()) was being misread as "nothing collected, so refund it",
     * which is true by coincidence for an unpaid booking but wrong for a
     * booking whose Stripe payment simply hadn't posted its downpayment_
     * status update at all (that field is never synced from the webhook).
     *
     * Two independent sources of evidence, both required to be an actual
     * CONFIRMATION, never a mere claim:
     *
     *   - Stripe (current flow): payment_status==='paid' with a non-null,
     *     >0 paid_amount, set only by StripePaymentController::
     *     handleWebhook(). payment_status==='paid' with paid_amount=NULL is
     *     deliberately NOT treated as evidence (CTO Batch #28.1: ambiguous,
     *     not verified collection) — booking #147 in dev data is exactly
     *     this shape and must stay excluded.
     *
     *   - Legacy manual bank-transfer (the deleted DownpaymentController::
     *     verify()/AdminBookingController::verifyDownpayment(), removed in
     *     commit 18713fb): downpayment_verified_at being non-null, NOT
     *     downpayment_status==='verified'. The status value is overwritten
     *     to 'refunded'/'forfeited'/'refund_sent' the moment this exact
     *     cancel() runs, which would erase the evidence for every legacy
     *     booking this check exists to protect — downpayment_verified_at
     *     is a separate column that no cancellation/refund path, current
     *     or historical, has ever cleared (confirmed: it is written only
     *     by the now-deleted verify() flow, and only ever read elsewhere —
     *     grep across app/ and resources/js/ turns up zero writers besides
     *     that dead controller method). 'submitted' (proof uploaded, never
     *     admin-confirmed) and 'pending' are deliberately NOT sufficient
     *     evidence under either source.
     */
    public static function hasConfirmedCollection(Booking $booking): bool
    {
        return self::hasVerifiedAmount($booking) || $booking->downpayment_verified_at !== null;
    }

    /**
     * Batch #28 (final) — stricter than hasConfirmedCollection() above:
     * true only when a real, Stripe-confirmed NUMERIC amount is on record.
     * A booking can be refund-eligible (hasConfirmedCollection()===true)
     * via the legacy bank-transfer path WITHOUT this being true — that
     * path's downpayment_verified_at proves an admin confirmed SOME
     * payment happened, never how much. downpayment_amount is only ever
     * the amount that was originally requested, recorded at booking
     * creation before any payment occurred — it is never independently
     * re-confirmed against what was actually received, so it must never
     * be substituted here (CTO: "do not represent the expected amount as
     * an independently proven refund amount").
     *
     * This is the gate markRefundSent() uses to decide whether a payout
     * can actually be marked sent — a legacy-verified booking stays
     * visible for admin review (hasConfirmedCollection() keeps it in
     * pendingRefunds()) but can never pass this check until a safe,
     * auditable way to establish its exact amount exists, which this
     * codebase does not yet have.
     */
    public static function hasVerifiedAmount(Booking $booking): bool
    {
        return $booking->payment_status === 'paid'
            && $booking->paid_amount !== null
            && (float) $booking->paid_amount > 0;
    }

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
     * @return array{cancellation_type: ?string, hours_until: int, voucher_restored?: bool, downpayment_status?: ?string}
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

        // Batch #28.1 fix: no confirmed collection (via either evidence
        // source above) means there is nothing to refund AND nothing to
        // forfeit — downpayment_status is left exactly as it was (still
        // 'pending' for a normal unpaid booking) instead of the previous
        // unconditional 'refunded'. cancellation_type is only set when the
        // caller passed an explicit $forcedType (e.g. admin no-show
        // resolution) — none of the existing enum values ('refunded',
        // 'forfeited', 'no_show', 'expired', 'therapist') truthfully mean
        // "cancelled, no money was ever involved", and inventing a new one
        // requires separate approval, so a plain cancel on unpaid money
        // leaves cancellation_type null rather than mislabeling it.
        if (!self::hasConfirmedCollection($booking)) {
            $booking->update(array_merge([
                'status'              => 'cancelled',
                'cancelled_at'        => now(),
                'cancellation_reason' => $reason,
            ], $forcedType !== null ? ['cancellation_type' => $forcedType] : []));

            return [
                'cancellation_type'  => $forcedType,
                'hours_until'        => $hoursUntil,
                'downpayment_status' => $booking->downpayment_status,
            ];
        }

        if ($forfeitedByReschedule) {
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

    /**
     * Therapist-caused cancellation (the spa/therapist cannot fulfill the
     * booking) — a deliberately separate operation from cancel() above,
     * not a $forcedType label on it, because the financial outcome here is
     * never subject to the customer's 24-hour grace/forfeiture rule
     * ($withinGrace, $forfeitedByReschedule) at all: the customer did
     * nothing wrong, so any money actually collected is always refund-due
     * and any used voucher is always restored, regardless of how close to
     * the session this happens or whether refund_forfeited_at was already
     * set by an earlier reschedule. refund_forfeited_at itself is never
     * read or written here — it stays exactly as it was.
     *
     * "Actually collected" is determined by hasConfirmedCollection() above
     * (Batch #28.1) — covers both Stripe-confirmed and legacy admin-
     * verified bank-transfer payments, never the raw/mutable
     * downpayment_status value. A booking cancelled while still
     * 'pending_payment' (no Stripe payment captured yet, and never
     * manually verified) correctly produces no monetary refund.
     *
     * Idempotency: this method performs no idempotency check of its own —
     * it relies entirely on the caller row-locking the booking and
     * re-verifying its status is still cancellable before calling this, the
     * same way TherapistBookingController::cancel() does. That guard alone
     * prevents this from ever running twice for the same booking, which in
     * turn makes the LoyaltyService::restoreVoucher() call below safe to
     * call unconditionally (it is independently idempotent regardless).
     *
     * @return array{cancellation_type: 'therapist', refund_due: bool, refund_amount: ?float, voucher_restored: bool}
     */
    public static function cancelByTherapist(Booking $booking, string $reason): array
    {
        if ($booking->is_voucher_covered) {
            $restoreResult = LoyaltyService::restoreVoucher($booking->id, $booking->customer_id, 'therapist');

            $booking->update([
                'status'              => 'cancelled',
                'cancelled_at'        => now(),
                'cancellation_type'   => 'therapist',
                'cancellation_reason' => $reason,
            ]);

            return [
                'cancellation_type' => 'therapist',
                'refund_due'        => false,
                'refund_amount'     => null,
                'voucher_restored'  => $restoreResult['success'],
            ];
        }

        $paymentCollected = self::hasConfirmedCollection($booking);

        // refund_amount is only ever the Stripe-confirmed paid_amount — a
        // legacy-verified bank-transfer booking has no amount recorded in
        // any current field (CTO Batch #28.1: never invent a payment
        // amount where none exists), so refund_due is still true but
        // refund_amount stays null; the admin already knows the original
        // downpayment_amount from the booking itself when processing it.
        $stripeAmount = $booking->payment_status === 'paid'
            && $booking->paid_amount !== null
            && (float) $booking->paid_amount > 0
                ? (float) $booking->paid_amount
                : null;

        $booking->update(array_merge([
            'status'              => 'cancelled',
            'cancelled_at'        => now(),
            'cancellation_type'   => 'therapist',
            'cancellation_reason' => $reason,
        ], $paymentCollected ? ['downpayment_status' => 'refunded'] : []));

        return [
            'cancellation_type' => 'therapist',
            'refund_due'        => $paymentCollected,
            'refund_amount'     => $paymentCollected ? $stripeAmount : null,
            'voucher_restored'  => false,
        ];
    }
}
