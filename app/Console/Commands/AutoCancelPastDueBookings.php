<?php

namespace App\Console\Commands;

use App\Models\Booking;
use Illuminate\Console\Command;

class AutoCancelPastDueBookings extends Command
{
    protected $signature = 'bookings:auto-cancel-past-due';
    protected $description = 'Auto-cancel pending/accepted bookings that are past due';

    public function handle()
    {
        // Only cancel bookings that are PAST DUE (scheduled_start < now).
        // 'auto_expired' was never a valid bookings_cancellation_type_check
        // value (only refunded/forfeited/no_show/expired are) — this used to
        // fail with a constraint violation whenever a row actually matched.
        // Consolidated onto 'expired', the same value used for abandoned
        // Stripe checkouts, since both are system-driven, non-refund,
        // non-forfeit auto-cancellations.
        $count = Booking::whereIn('status', ['pending', 'accepted'])
            ->where('scheduled_start', '<', now())
            ->update([
                'status' => 'cancelled',
                'cancellation_type' => 'expired',
                'cancelled_at' => now(),
            ]);

        $this->info("Cancelled {$count} past due bookings.");
        return self::SUCCESS;
    }
}