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
use Illuminate\Support\Facades\Log;

/**
 * Locks proposal then booking, matching customer response paths. Expiry,
 * cancellation and synchronous audit persistence commit together; failed
 * work remains pending for the next run. Notifications follow the commit.
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
        $failureCount   = 0;

        foreach ($candidates as $proposal) {
            try {
                $outcome = DB::transaction(function () use ($proposal) {
                    $locked = RescheduleProposal::where('id', $proposal->id)->lockForUpdate()->first();
                    if (!$locked || $locked->status !== 'pending' || !$locked->expires_at->lt(now())) {
                        return null;
                    }

                    $booking = Booking::where('id', $locked->booking_id)->lockForUpdate()->first();
                    $result = null;
                    if ($booking && in_array($booking->status, BookingRescheduleService::RESCHEDULABLE_STATUSES, true)) {
                        $result = BookingCancellationService::cancel(
                            $booking,
                            'Reschedule proposal expired without a customer response.',
                            'expired'
                        );
                    }

                    $locked->update(['status' => 'expired', 'responded_at' => now()]);
                    RescheduleProposalExpired::dispatch(
                        $locked->id,
                        $locked->booking_id,
                        $locked->proposed_start_at->toDateTimeString(),
                        $locked->expires_at->toDateTimeString(),
                        $result['cancellation_type'] ?? null,
                    );

                    return [$booking, $result];
                }, 3);
            } catch (\Throwable $e) {
                $failureCount++;
                Log::error('Reschedule proposal expiry transaction failed.', [
                    'proposal_id' => $proposal->id, 'exception_type' => $e::class,
                ]);
                $this->error("Failed to expire proposal {$proposal->id}; transaction rolled back.");
                continue;
            }

            if ($outcome === null) {
                continue;
            }
            $expiredCount++;
            [$booking, $result] = $outcome;

            if ($result === null) {
                continue;
            }

            $cancelledCount++;

            try {
                $booking->loadMissing('customer', 'service', 'serviceVariant', 'therapist.user');
                if ($booking->customer) {
                    $booking->customer->notify(new BookingNotification($booking, 'reschedule_proposal_expired'));
                }
            } catch (\Throwable $e) {
                $failureCount++;
                Log::error('Reschedule proposal expiry notification failed after commit.', [
                    'proposal_id' => $proposal->id, 'exception_type' => $e::class,
                ]);
                $this->error("Proposal {$proposal->id} expired; notification failed after commit.");
            }
        }

        $this->info("Expired {$expiredCount} reschedule proposal(s), cancelled {$cancelledCount} booking(s).");

        return $failureCount > 0 ? self::FAILURE : self::SUCCESS;
    }
}
