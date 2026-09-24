<?php

namespace App\Console\Commands;

use App\Models\Booking;
use Illuminate\Console\Command;

class AutoCancelPastDueBookings extends Command
{
    protected $signature = 'bookings:auto-cancel-past-due';
    protected $description = 'Auto-cancel pending bookings that went unactioned past their scheduled time';

    public function handle()
    {
        // PENDING only. A pending booking never got a therapist decision, so
        // once its scheduled_start has passed it can never be honored — safe
        // to auto-cancel outright.
        //
        // ACCEPTED bookings are deliberately excluded: the therapist already
        // confirmed it, so "past due and never started" is not the same
        // failure as "never responded" and must not be silently cancelled
        // the same way. That case is instead surfaced for admin review by
        // bookings:flag-stale-active-sessions (flag_reason 'stale_accepted'),
        // the same review queue already used for bookings stuck en_route/arrived.
        //
        // 'auto_expired' was never a valid bookings_cancellation_type_check
        // value (only refunded/forfeited/no_show/expired are) — this used to
        // fail with a constraint violation whenever a row actually matched.
        // Consolidated onto 'expired', the same value used for abandoned
        // Stripe checkouts, since both are system-driven, non-refund,
        // non-forfeit auto-cancellations.
        $count = Booking::where('status', 'pending')
            ->where('scheduled_start', '<', now())
            ->update([
                'status' => 'cancelled',
                'cancellation_type' => 'expired',
                'cancelled_at' => now(),
            ]);

        $this->info("Cancelled {$count} past due pending bookings.");
        return self::SUCCESS;
    }
}