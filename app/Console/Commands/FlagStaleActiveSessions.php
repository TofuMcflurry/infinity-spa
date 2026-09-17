<?php

namespace App\Console\Commands;

use App\Events\Audit\BookingFlaggedStale;
use App\Models\Booking;
use App\Models\User;
use App\Notifications\InAppNotification;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Notification;

class FlagStaleActiveSessions extends Command
{
    protected $signature = 'bookings:flag-stale-active-sessions';
    protected $description = 'Flag en_route/arrived bookings stuck past their expected window for admin review';

    private const EN_ROUTE_STALE_AFTER_MINUTES = 60;
    private const ARRIVED_STALE_AFTER_HOURS    = 2;

    public function handle(): int
    {
        $candidates = $this->staleQuery(Booking::query())->get(['id', 'status']);

        $flagged = 0;
        $admins  = null; // lazy-loaded only if we actually flag something

        foreach ($candidates as $booking) {
            $reason = $booking->status === 'en_route' ? 'stale_en_route' : 'stale_arrived';

            // Atomic claim: re-applies the exact same status+threshold criteria
            // (not just "flagged_at IS NULL") scoped to this one row, so the
            // update only succeeds if the booking is STILL stale at the moment
            // of the write. This guards against two things at once:
            //   1. two overlapping cron runs both selecting this row — only one
            //      UPDATE can win, the other affects 0 rows and is skipped below.
            //   2. the booking having moved on (completed/cancelled) between our
            //      SELECT above and this UPDATE — it no longer matches and is
            //      correctly left alone rather than being force-flagged stale.
            $claimed = $this->staleQuery(Booking::where('id', $booking->id))
                ->update([
                    'flagged_at'  => now(),
                    'flag_reason' => $reason,
                ]);

            if ($claimed !== 1) {
                continue;
            }

            BookingFlaggedStale::dispatch($booking->id, $booking->status, $reason);

            $admins ??= User::where('role', 'admin')->get();
            if ($admins->isNotEmpty()) {
                Notification::send($admins, new InAppNotification(
                    title:   '⚠️ Stale Active Session',
                    message: "Booking #{$booking->id} has been stuck in \"{$booking->status}\" and needs review.",
                    icon:    'alert-triangle',
                    color:   'red',
                    url:     '/admin/bookings',
                ));
            }

            $flagged++;
        }

        $this->info("Flagged {$flagged} stale active session booking(s).");

        return self::SUCCESS;
    }

    /**
     * Shared stale-detection criteria, applied both to the initial candidate
     * scan and (scoped to a single id) to the atomic per-row claim update —
     * keeping both in one place guarantees they can never drift apart.
     */
    private function staleQuery($query)
    {
        return $query
            ->whereNull('flagged_at')
            ->where(function ($q) {
                $q->where(function ($q2) {
                    $q2->where('status', 'en_route')
                       ->where('scheduled_start', '<', now()->subMinutes(self::EN_ROUTE_STALE_AFTER_MINUTES));
                })->orWhere(function ($q2) {
                    $q2->where('status', 'arrived')
                       ->where('scheduled_end', '<', now()->subHours(self::ARRIVED_STALE_AFTER_HOURS));
                });
            });
    }
}
