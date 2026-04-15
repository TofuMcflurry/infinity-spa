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
        // Only cancel bookings that are PAST DUE (scheduled_start < now)
        $count = Booking::whereIn('status', ['pending', 'accepted'])
            ->where('scheduled_start', '<', now())
            ->update([
                'status' => 'cancelled',
                'cancellation_type' => 'auto_expired'
            ]);

        $this->info("Cancelled {$count} past due bookings.");
        return 0;
    }
}