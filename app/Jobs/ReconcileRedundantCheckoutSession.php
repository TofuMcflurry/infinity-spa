<?php

namespace App\Jobs;

use App\Models\Booking;
use App\Services\PaymentAnomalyService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Stripe\Checkout\Session;
use Stripe\Exception\ApiErrorException;
use Stripe\Stripe;

/**
 * Batch #31A.2B — best-effort cleanup for a Checkout Session that stopped
 * being "current" on a booking the instant a DIFFERENT session's payment
 * was recorded (StripePaymentController::handleWebhook()'s paid branch).
 * Runs queued, never inline in the webhook response, so this job's Stripe
 * calls never happen under any database lock.
 *
 * Idempotent across retries: every branch either performs a no-op-safe
 * Stripe read first, or re-checks before writing anything durable, so a
 * redelivered/retried run of this exact job can never double-flag the same
 * incident (recordAnomaly() itself dedupes by payment identity under a
 * short booking-row lock — see StripePaymentController).
 */
class ReconcileRedundantCheckoutSession implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public int $bookingId,
        public string $redundantSessionId,
        public string $paidSessionId,
    ) {}

    public function handle(): void
    {
        if ($this->redundantSessionId === $this->paidSessionId) {
            return; // nothing to reconcile — defensive, should never be dispatched this way
        }

        $booking = Booking::find($this->bookingId);
        if (!$booking) {
            return;
        }

        Stripe::setApiKey(config('services.stripe.secret'));

        try {
            $redundant = Session::retrieve($this->redundantSessionId);
        } catch (ApiErrorException $e) {
            // Could be "no such session" (fine — nothing to clean up) or a
            // transient network/API error (we genuinely don't know its
            // state). Either way: never guess. Log and stop; the session's
            // own 30-minute expires_at is the real backstop if it's still
            // somehow live, and the queue's own retry policy will re-run
            // this job on a transient failure.
            Log::warning('ReconcileRedundantCheckoutSession: could not retrieve redundant session', [
                'booking_id' => $this->bookingId,
                'session_id' => $this->redundantSessionId,
                'error'      => $e->getMessage(),
            ]);
            return;
        }

        if ($redundant->status === 'open') {
            try {
                $redundant->expire();
                Log::info('ReconcileRedundantCheckoutSession: expired redundant open session', [
                    'booking_id' => $this->bookingId,
                    'session_id' => $this->redundantSessionId,
                ]);
            } catch (ApiErrorException $e) {
                // Could not confirm the redundant session is non-payable.
                // Do not claim it's safe — flag it durably rather than
                // silently trusting that Stripe's own expiry will catch it
                // before anyone could complete it.
                Log::warning('ReconcileRedundantCheckoutSession: failed to expire redundant open session — flagging for review', [
                    'booking_id' => $this->bookingId,
                    'session_id' => $this->redundantSessionId,
                    'error'      => $e->getMessage(),
                ]);
                $this->flagAnomaly($booking, 'unconfirmed_expiry', $this->redundantSessionId, [
                    'redundant_session_id' => $this->redundantSessionId,
                    'paid_session_id'      => $this->paidSessionId,
                    'reason'               => 'Session::expire() failed; non-payability not confirmed',
                ]);
            }

            return;
        }

        if ($redundant->status === 'complete') {
            // A genuinely different successful payment, discovered via
            // cleanup rather than its own webhook delivery.
            $this->flagAnomaly($booking, 'second_successful_payment', $redundant->payment_intent ?? $this->redundantSessionId, [
                'redundant_session_id'         => $this->redundantSessionId,
                'redundant_payment_intent_id'  => $redundant->payment_intent,
                'redundant_amount_total'       => $redundant->amount_total,
                'redundant_currency'           => $redundant->currency,
                'paid_session_id'              => $this->paidSessionId,
            ]);

            return;
        }

        // status === 'expired' — already harmless, nothing to do.
    }

    /**
     * Acquires the short booking-row lock PaymentAnomalyService::record()
     * requires, then delegates to it — the same shared, dedupe-safe
     * implementation StripePaymentController's webhook handler uses, so the
     * two call sites can never drift out of sync on what "already flagged"
     * means. Nothing here calls Stripe — only local DB work.
     */
    private function flagAnomaly(Booking $booking, string $kind, string $identity, array $details): void
    {
        DB::transaction(function () use ($booking, $kind, $identity, $details) {
            $locked = Booking::where('id', $booking->id)->lockForUpdate()->first();
            if (!$locked) {
                return;
            }

            PaymentAnomalyService::record($locked, $kind, $identity, $details);
        });
    }
}
