<?php

namespace App\Console\Commands;

use App\Models\Booking;
use Illuminate\Console\Command;

class ExpireStalePendingPaymentBookings extends Command
{
    protected $signature = 'bookings:expire-stale-pending-payment';
    protected $description = 'Cancel pending_payment bookings whose Stripe checkout was abandoned, freeing the slot';

    // Safety net for when the checkout.session.expired webhook never fires
    // (webhook downtime, missed event, or a checkout session that was never
    // even opened). Threshold is shorter than Stripe's own session expiry
    // (see StripePaymentController::createCheckoutSession) so this rarely
    // has to do the webhook's job, but still catches it within 20-30 min.
    private const STALE_AFTER_MINUTES = 20;

    public function handle(): int
    {
        $count = Booking::where('status', 'pending_payment')
            ->where('created_at', '<', now()->subMinutes(self::STALE_AFTER_MINUTES))
            ->update([
                'status'            => 'cancelled',
                'cancellation_type' => 'expired',
                'cancelled_at'      => now(),
            ]);

        $this->info("Expired {$count} stale pending_payment booking(s).");

        return self::SUCCESS;
    }
}
