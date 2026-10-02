<?php

namespace App\Console\Commands;

use App\Events\Audit\RescheduleProposalExpired;
use App\Models\Booking;
use App\Notifications\BookingNotification;
use App\Services\BookingCancellationService;
use App\Services\BookingRescheduleService;
use App\Models\RescheduleProposal;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Follows FlagStaleActiveSessions' atomic-claim pattern: the UPDATE that
 * flips a proposal to 'expired' re-applies the exact same WHERE criteria
 * used to select it, scoped to that one row, so only one process can ever
 * win the claim — safe against two overlapping cron runs, and against a
 * customer's accept()/counter()/cancel() landing on the same row at the
 * same moment (RescheduleProposalService::lockPending() independently
 * re-checks status + expiry under its own row lock either way).
 *
 * Per the approved design (docs/design/INFINITY-HOME-SPA-UI-HANDOFF.md
 * §8.10): the booking's schedule is NEVER touched by an expiry — it is
 * only ever cancelled, through the existing BookingCancellationService
 * refund/forfeit decision tree, never new refund logic.
 */
class ExpireRescheduleProposals extends Command
{
    protected $signature = 'bookings:expire-reschedule-proposals';
    protected $description = 'Cancel bookings whose reschedule proposal expired with no customer response';

    public function handle(): int
    {
        $candidates = RescheduleProposal::where('status', 'pending')
            ->where('expires_at', '<', now())
            ->get(['id', 'booking_id', 'proposed_start_at', 'expires_at']);

        $expiredCount   = 0;
        $cancelledCount = 0;

        foreach ($candidates as $proposal) {
            $claimed = RescheduleProposal::where('id', $proposal->id)
                ->where('status', 'pending')
                ->where('expires_at', '<', now())
                ->update(['status' => 'expired', 'responded_at' => now()]);

            if ($claimed !== 1) {
                continue; // already resolved by the customer, or claimed by another run
            }

            $expiredCount++;

            [$booking, $result] = DB::transaction(function () use ($proposal) {
                $booking = Booking::where('id', $proposal->booking_id)->lockForUpdate()->first();

                // The booking may have moved on independently since the
                // proposal was created (e.g. completed, or cancelled via a
                // different path) — the proposal is still correctly marked
                // 'expired' above either way, but there is nothing left to
                // cancel here.
                if (!$booking || !in_array($booking->status, BookingRescheduleService::RESCHEDULABLE_STATUSES, true)) {
                    return [$booking, null];
                }

                // 'expired' is the existing bookings_cancellation_type_check
                // value already used for every other system-driven,
                // time-based, no-human-response auto-cancellation in this
                // app (AutoCancelPastDueBookings, ExpireStalePendingPaymentBookings)
                // — the constraint has no 'expired_proposal' value.
                $result = BookingCancellationService::cancel(
                    $booking,
                    'Reschedule proposal expired without a customer response.',
                    'expired'
                );

                RescheduleProposalExpired::dispatch(
                    $proposal->id,
                    $booking->id,
                    $proposal->proposed_start_at->toDateTimeString(),
                    $proposal->expires_at->toDateTimeString(),
                    $result['cancellation_type'],
                );

                return [$booking, $result];
            });

            if ($result === null) {
                continue;
            }

            $cancelledCount++;

            $booking->loadMissing('customer', 'service', 'serviceVariant', 'therapist.user');
            if ($booking->customer) {
                $booking->customer->notify(new BookingNotification($booking, 'reschedule_proposal_expired'));
            }
        }

        $this->info("Expired {$expiredCount} reschedule proposal(s), cancelled {$cancelledCount} booking(s).");

        return self::SUCCESS;
    }
}
