<?php

namespace App\Console\Commands;

use App\Models\Booking;
use App\Events\Audit\ScheduledPaymentExpired;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

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
    private const MAX_BOOKINGS_PER_RUN = 100;

    public function handle(): int
    {
        $cutoff = now()->subMinutes(self::STALE_AFTER_MINUTES);
        $ids = Booking::where('status', 'pending_payment')
            ->where('payment_status', 'pending')
            ->where('created_at', '<', $cutoff)
            ->orderBy('id')->limit(self::MAX_BOOKINGS_PER_RUN)->pluck('id');
        $count = 0;
        foreach ($ids as $id) {
            $count += DB::transaction(function () use ($id, $cutoff) {
                $booking = Booking::whereKey($id)->lockForUpdate()->first();
                // Candidate selection is only a hint. A payment or another
                // worker may have resolved the booking before this lock.
                if (!$booking || $booking->status !== 'pending_payment'
                    || $booking->payment_status !== 'pending'
                    || !$booking->created_at || $booking->created_at->gte($cutoff)) {
                    return 0;
                }
                if (!$booking->update([
                    'status' => 'cancelled', 'cancellation_type' => 'expired', 'cancelled_at' => now(),
                ])) {
                    throw new \RuntimeException('Scheduled payment expiration could not be saved.');
                }
                ScheduledPaymentExpired::dispatch($booking->id, self::STALE_AFTER_MINUTES);
                return 1;
            });
        }

        $this->info("Expired {$count} stale pending_payment booking(s).");

        return self::SUCCESS;
    }
}
