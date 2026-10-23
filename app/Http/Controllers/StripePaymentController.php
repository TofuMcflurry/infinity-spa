<?php

namespace App\Http\Controllers;

use App\Jobs\ReconcileRedundantCheckoutSession;
use App\Models\Booking;
use App\Notifications\BookingNotification;
use App\Services\PaymentAnomalyService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Stripe\Checkout\Session;
use Stripe\Exception\ApiConnectionException;
use Stripe\Exception\ApiErrorException;
use Stripe\Stripe;
use Stripe\Webhook;
use Stripe\Exception\SignatureVerificationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class StripePaymentController extends Controller
{
    private const TERMINAL_STATUSES = ['cancelled', 'rejected', 'completed'];

    // ── Create a Stripe Checkout session for a booking ──────────────────────────
    //
    // Batch #31A.2B — every path that can reach Session::create() first
    // acquires a persisted, exclusive checkout_reservation_token under a
    // short row lock (claimOrInspect() below). The lock is NEVER held across
    // a Stripe HTTP call — it protects only the local read-decide-write step
    // that decides "who gets to create a session," and is released before
    // any network call. An existing, still-open session is reused outright
    // (no reservation, no new session). An existing but Stripe-confirmed
    // EXPIRED session is reclaimed via the same atomic mechanism, which is
    // what prevents two simultaneous retries against that same expired
    // session from independently creating two replacements.
    public function createCheckoutSession(Request $request)
    {
        $request->validate([
            'booking_id'   => 'required|exists:bookings,id',
            'payment_type' => 'required|in:downpayment,full',
        ]);

        $booking = Booking::with(['service', 'serviceVariant'])->findOrFail($request->booking_id);

        if (auth()->id() !== $booking->customer_id) {
            abort(403);
        }

        // A booking that's already fully paid, or is no longer a live
        // booking, must never be handed a fresh Stripe obligation.
        if ($booking->payment_status === 'paid') {
            return response()->json(['message' => 'This booking has already been paid for.'], 422);
        }

        if (in_array($booking->status, self::TERMINAL_STATUSES, true)) {
            return response()->json(['message' => 'This booking is no longer eligible for payment.'], 422);
        }

        $paymentType = $request->payment_type;

        // payment_type and downpayment_amount are written exactly once, at
        // booking creation, and never mutated afterward anywhere in this
        // codebase — safe to validate once here rather than re-reading them
        // fresh under every lock acquisition below.
        if ($booking->payment_type !== null && $paymentType !== $booking->payment_type) {
            return response()->json(['message' => 'Payment type does not match this booking\'s original payment plan.'], 422);
        }

        $amount = $booking->downpayment_amount;

        if ($amount === null) {
            return response()->json([
                'message' => 'This booking has no recorded payment amount and cannot be charged automatically. Please contact support.',
            ], 422);
        }

        if ((float) $amount <= 0) {
            return response()->json(['message' => 'There is nothing due for this booking.'], 422);
        }

        Stripe::setApiKey(config('services.stripe.secret'));

        $expectedExpiredId = null;

        // Bounded, not open-ended: pass 1 discovers current state; pass 2 is
        // only needed to reclaim a session pass 1 found Stripe-confirmed
        // expired; pass 3 exists purely to resolve the rare 'retry' outcome
        // (another request changed the row between our read and our
        // attempted write) by re-evaluating from scratch. No scenario needs
        // a fourth pass — anything still unresolved at that point fails safe.
        for ($attempt = 0; $attempt < 3; $attempt++) {
            $claim = $this->claimOrInspect($booking, $expectedExpiredId);

            if ($claim['outcome'] === 'retry') {
                $expectedExpiredId = null;
                continue;
            }

            if ($claim['outcome'] === 'held_by_other') {
                return response()->json([
                    'message' => 'A checkout is already being started for this booking — please retry in a few seconds.',
                ], 409);
            }

            if ($claim['outcome'] === 'ineligible') {
                return response()->json(['message' => $claim['message']], 422);
            }

            if ($claim['outcome'] === 'has_session') {
                try {
                    $existing = Session::retrieve($claim['session_id']);
                } catch (ApiErrorException $e) {
                    // Never treat a retrieve exception — network blip or
                    // otherwise — as proof the session expired. We genuinely
                    // don't know its state; don't risk creating a duplicate
                    // alongside a possibly-still-open one.
                    Log::warning('Stripe checkout: could not retrieve existing session', [
                        'booking_id' => $booking->id,
                        'session_id' => $claim['session_id'],
                        'error'      => $e->getMessage(),
                    ]);

                    return response()->json([
                        'message' => 'Unable to verify an existing payment session right now. Please try again shortly.',
                    ], 503);
                }

                if ($existing->status === 'open') {
                    return response()->json(['checkout_url' => $existing->url]);
                }

                if ($existing->status === 'complete') {
                    return response()->json([
                        'message' => 'A payment for this booking is already being processed — please wait a moment and refresh.',
                    ], 422);
                }

                // status === 'expired' — only an explicit, Stripe-confirmed
                // expiry reaches here. Atomically reclaim this exact slot.
                $expectedExpiredId = $claim['session_id'];
                continue;
            }

            // $claim['outcome'] === 'claimed' — we exclusively hold a fresh
            // reservation; everything below runs unlocked except the two
            // short finalize/cleanup transactions.
            return $this->createSessionForReservation($booking, $paymentType, (float) $amount, $claim['token']);
        }

        return response()->json(['message' => 'Unable to start payment right now. Please try again.'], 409);
    }

    /**
     * Single atomic claim/inspect step. Acquires a short row lock, reads the
     * booking's CURRENT checkout state, and — only when nothing else is
     * live — writes a fresh reservation in the SAME lock hold, before
     * release. Never calls Stripe. The WHERE-guarded write below is
     * defense-in-depth on top of the lock itself (which already guarantees
     * no other transaction can touch this row between our read and write);
     * it protects against a future change that weakens isolation, not
     * something the lock alone leaves unsafe today.
     *
     * $expectedExpiredId, when passed, scopes the claim to "only take this
     * slot if the session I just confirmed Stripe-side expired is still the
     * one on this row." Two simultaneous retries against the same expired
     * session serialize on this same row lock — only the first to commit
     * sees its claim succeed; the second's own fresh read, after acquiring
     * the lock, finds that reservation already active and returns
     * held_by_other instead of also creating a session.
     */
    private function claimOrInspect(Booking $booking, ?string $expectedExpiredId = null): array
    {
        return DB::transaction(function () use ($booking, $expectedExpiredId) {
            $locked = Booking::where('id', $booking->id)->lockForUpdate()->first();

            if (!$locked) {
                return ['outcome' => 'ineligible', 'message' => 'Booking not found.'];
            }

            if ($locked->payment_status === 'paid') {
                return ['outcome' => 'ineligible', 'message' => 'This booking has already been paid for.'];
            }

            if (in_array($locked->status, self::TERMINAL_STATUSES, true)) {
                return ['outcome' => 'ineligible', 'message' => 'This booking is no longer eligible for payment.'];
            }

            $hasSession = $locked->stripe_checkout_session_id !== null;
            $sessionMatchesExpectation = $expectedExpiredId === null
                || $locked->stripe_checkout_session_id === $expectedExpiredId;

            if ($hasSession && !$sessionMatchesExpectation) {
                // Someone else already superseded the session we were
                // trying to reclaim (or claimed/finished first) — the
                // caller re-evaluates from scratch rather than acting on
                // a now-stale expectation.
                return ['outcome' => 'retry'];
            }

            if ($hasSession && $expectedExpiredId === null) {
                return ['outcome' => 'has_session', 'session_id' => $locked->stripe_checkout_session_id];
            }

            $reservationActive = $locked->checkout_reservation_token !== null
                && $locked->checkout_reservation_expires_at !== null
                && $locked->checkout_reservation_expires_at->isFuture();

            if ($reservationActive) {
                return ['outcome' => 'held_by_other'];
            }

            $token = (string) Str::uuid();
            $ttl   = (int) config('services.stripe.checkout_reservation_ttl', 60);

            $updated = Booking::where('id', $locked->id)
                ->where(function ($q) {
                    $q->whereNull('checkout_reservation_token')
                      ->orWhere('checkout_reservation_expires_at', '<=', now());
                })
                ->where(function ($q) use ($expectedExpiredId) {
                    if ($expectedExpiredId === null) {
                        $q->whereNull('stripe_checkout_session_id');
                    } else {
                        $q->where('stripe_checkout_session_id', $expectedExpiredId);
                    }
                })
                ->update([
                    'checkout_reservation_token'      => $token,
                    'checkout_reservation_expires_at' => now()->addSeconds($ttl),
                    'stripe_checkout_session_id'      => null, // clears a confirmed-expired session, if any
                ]);

            if ($updated !== 1) {
                return ['outcome' => 'retry'];
            }

            return ['outcome' => 'claimed', 'token' => $token];
        });
    }

    /**
     * Runs entirely unlocked except the two short finalize/cleanup
     * transactions at the end. $token is the reservation this request
     * exclusively holds going in.
     */
    private function createSessionForReservation(Booking $booking, string $paymentType, float $amount, string $token)
    {
        $productName = "{$booking->service->group_name} ({$booking->serviceVariant->duration_minutes} min) - " . ucfirst($paymentType);

        $params = [
            'mode'       => 'payment',
            'line_items' => [[
                'price_data' => [
                    'currency'     => 'aed',
                    'unit_amount'  => (int) round($amount * 100),
                    'product_data' => [
                        'name' => $productName,
                    ],
                ],
                'quantity' => 1,
            ]],
            // Stripe replaces the literal "{CHECKOUT_SESSION_ID}" placeholder itself —
            // route() would urlencode the braces, so it's appended manually instead.
            'success_url' => route('payment.success', ['booking_id' => $booking->id])
                . '&session_id={CHECKOUT_SESSION_ID}',
            'cancel_url' => route('bookings'),
            'metadata'   => [
                'booking_id'   => $booking->id,
                'payment_type' => $paymentType,
            ],
            // Stripe's minimum allowed expiry window is 30 minutes — shorter
            // than the 24h default so an abandoned checkout frees the slot
            // quickly instead of leaving the booking pending_payment all day.
            'expires_at' => now()->addMinutes(30)->timestamp,
        ];

        // Scoped to THIS exact attempt (booking + reservation token) — a new
        // token is minted every time a genuinely fresh attempt is claimed,
        // so this never collides with, or masks, a separate legitimate later
        // attempt within Stripe's 24h idempotency window. Deliberately
        // reused verbatim for the single same-key retry below — that's what
        // makes the retry safe rather than a guess.
        $idempotencyKey = "checkout:{$booking->id}:{$token}";

        try {
            $session = Session::create($params, ['idempotency_key' => $idempotencyKey]);
        } catch (ApiConnectionException $e) {
            // Ambiguous: we never received a response from Stripe, so we
            // genuinely don't know whether the session was created. Retry
            // ONCE, synchronously, with the IDENTICAL idempotency key —
            // Stripe's own guarantee means this either safely returns the
            // SAME session if the first attempt actually went through, or
            // safely creates it fresh if it never arrived. This resolves
            // the ambiguity instead of guessing at it, and is why an
            // immediate retry here can never produce a second session: both
            // attempts share one key.
            try {
                $session = Session::create($params, ['idempotency_key' => $idempotencyKey]);
            } catch (ApiConnectionException $e2) {
                // Still unreachable. We cannot establish whether a session
                // now exists under this key — never silently assume either
                // way. Leave the reservation exactly as it is: any other
                // request for this booking still correctly sees it as held
                // (claimOrInspect() returns held_by_other), so nothing can
                // mint an unrelated idempotency key while this one remains
                // unresolved. Durably flag the incident — retaining the
                // token for the remainder of its TTL does not, by itself,
                // prove no session exists; this flag is the record that
                // the question was never answered, for manual follow-up.
                DB::transaction(function () use ($booking, $token, $idempotencyKey) {
                    $locked = Booking::where('id', $booking->id)->lockForUpdate()->first();
                    if ($locked) {
                        PaymentAnomalyService::record($locked, 'unconfirmed_session_creation', $idempotencyKey, [
                            'reservation_token' => $token,
                            'idempotency_key'   => $idempotencyKey,
                            'diagnostic_code'   => 'checkout_creation_unconfirmed_after_retry',
                        ]);
                    }
                });

                Log::error('Stripe checkout: Session::create ambiguous after retry — flagged for review', [
                    'booking_id' => $booking->id,
                    'error'      => $e2->getMessage(),
                ]);

                return response()->json([
                    'message' => 'We could not confirm whether your payment session started. Please wait a moment and try again.',
                ], 503);
            } catch (ApiErrorException $e2) {
                // The retry got a DEFINITIVE rejection under the SAME key —
                // if the original attempt had actually succeeded, Stripe
                // would have replayed that cached success instead of
                // independently rejecting it, so it's safe to conclude
                // nothing was ever created under this key.
                $this->clearReservationAndFail($booking, $token, $e2);
                return response()->json(['message' => 'Unable to start payment right now. Please try again.'], 502);
            }
        } catch (ApiErrorException $e) {
            // Definitive rejection on the first attempt (bad parameters,
            // auth failure, etc.) — nothing was created, safe to clear
            // immediately so the customer can retry right away rather than
            // wait out a TTL meant for genuine ambiguity.
            $this->clearReservationAndFail($booking, $token, $e);
            return response()->json(['message' => 'Unable to start payment right now. Please try again.'], 502);
        }

        $finalized = DB::transaction(function () use ($booking, $token, $session) {
            $locked = Booking::where('id', $booking->id)
                ->where('checkout_reservation_token', $token)
                ->lockForUpdate()
                ->first();

            if (!$locked) {
                return false;
            }

            $locked->update([
                'stripe_checkout_session_id'      => $session->id,
                'checkout_reservation_token'       => null,
                'checkout_reservation_expires_at'  => null,
            ]);

            return true;
        });

        if ($finalized) {
            return response()->json(['checkout_url' => $session->url]);
        }

        // Lost the reservation race after Stripe already succeeded (the
        // reservation expired while Session::create() was still in
        // flight, and a later request reclaimed the slot first — bounded
        // by the TTL, rare). We now hold a real, live Stripe session
        // nobody will ever be handed the URL for. Best-effort neutralize
        // it; if that itself fails, we cannot prove it's non-payable —
        // never claim safety we don't have, flag it durably instead.
        try {
            $session->expire();
        } catch (ApiErrorException $e) {
            Log::warning('Stripe checkout: orphaned session expiry failed', [
                'booking_id' => $booking->id, 'session_id' => $session->id, 'error' => $e->getMessage(),
            ]);
            DB::transaction(function () use ($booking, $session) {
                $locked = Booking::where('id', $booking->id)->lockForUpdate()->first();
                if ($locked) {
                    PaymentAnomalyService::record($locked, 'unconfirmed_expiry', $session->id, [
                        'orphaned_session_id' => $session->id,
                        'diagnostic_code'     => 'orphaned_checkout_expiry_unconfirmed',
                    ]);
                }
            });
        }

        return response()->json([
            'message' => 'A checkout is already being started for this booking — please retry in a few seconds.',
        ], 409);
    }

    /**
     * Only ever called for a DEFINITIVE Stripe rejection — nothing was
     * created, so it's safe to release the reservation immediately rather
     * than make the customer wait out the TTL meant for genuine ambiguity.
     */
    private function clearReservationAndFail(Booking $booking, string $token, \Throwable $e): void
    {
        Booking::where('id', $booking->id)
            ->where('checkout_reservation_token', $token)
            ->update([
                'checkout_reservation_token'      => null,
                'checkout_reservation_expires_at' => null,
            ]);

        Log::error('Stripe checkout: Session::create failed', [
            'booking_id' => $booking->id,
            'error'      => $e->getMessage(),
        ]);
    }

    // ── Handle Stripe webhook events ─────────────────────────────────────────────
    public function handleWebhook(Request $request)
    {
        $payload   = $request->getContent();
        $sigHeader = $request->header('Stripe-Signature');

        try {
            $event = Webhook::constructEvent(
                $payload,
                $sigHeader,
                config('services.stripe.webhook_secret')
            );
        } catch (SignatureVerificationException $e) {
            return response('Invalid signature', 400);
        } catch (\UnexpectedValueException $e) {
            return response('Invalid payload', 400);
        }

        if ($event->type === 'checkout.session.completed') {
            return $this->handleCheckoutCompleted($event);
        }

        if ($event->type === 'checkout.session.expired') {
            return $this->handleCheckoutExpired($event);
        }

        return response()->json(['status' => 'ok']);
    }

    /**
     * Batch #31A.2B — rewritten reconciliation. The booking is looked up by
     * id alone (not by an exact stripe_checkout_session_id match), because
     * that pointer only ever reflects the most recently CREATED session,
     * not necessarily the one that actually got paid — a legitimate older
     * session can validly complete after a newer one became "current."
     * Everything below validates fully before trusting the event, and uses
     * stripe_payment_intent_id — not session id, not the current pointer —
     * as the one stable, recorded identity for "have we already processed
     * this exact payment."
     */
    private function handleCheckoutCompleted($event)
    {
        $session = $event->data->object;

        $bookingId       = $session->metadata->booking_id ?? null;
        $paymentIntentId = $session->payment_intent ?? null;

        if (!$bookingId) {
            Log::warning('Stripe webhook: completed event missing booking_id metadata', [
                'session_id' => $session->id ?? null,
            ]);
            return response()->json(['status' => 'ok']);
        }

        // Without a PaymentIntent we have no trustworthy, stable identity
        // to record or dedupe against — never guess one.
        if (!$paymentIntentId) {
            Log::error('Stripe webhook: completed event missing payment_intent', [
                'booking_id' => $bookingId,
                'session_id' => $session->id ?? null,
            ]);
            return response()->json(['status' => 'ok']);
        }

        // The event TYPE firing isn't proof of payment on its own — Stripe's
        // own guidance is to check the session's payment_status explicitly.
        if (($session->payment_status ?? null) !== 'paid') {
            Log::info('Stripe webhook: completed event without a confirmed paid status — ignoring', [
                'booking_id'     => $bookingId,
                'session_id'     => $session->id,
                'payment_status' => $session->payment_status ?? null,
            ]);
            return response()->json(['status' => 'ok']);
        }

        $booking = Booking::find($bookingId);
        if (!$booking) {
            Log::warning('Stripe webhook: completed event for unknown booking', ['booking_id' => $bookingId]);
            return response()->json(['status' => 'ok']);
        }

        $expectedAmountFils = $booking->downpayment_amount !== null
            ? (int) round(((float) $booking->downpayment_amount) * 100)
            : null;

        $amountOrCurrencyMismatch = $expectedAmountFils === null
            || ($session->currency ?? null) !== 'aed'
            || (int) ($session->amount_total ?? -1) !== $expectedAmountFils;

        $outcome = DB::transaction(function () use ($booking, $session, $event, $paymentIntentId, $amountOrCurrencyMismatch, $expectedAmountFils) {
            $locked = Booking::where('id', $booking->id)->lockForUpdate()->first();
            if (!$locked) {
                return ['action' => 'none'];
            }

            // Money collected for a booking we've since cancelled must
            // never be silently dropped, and must never resurrect it.
            if ($locked->status === 'cancelled') {
                PaymentAnomalyService::record($locked, 'payment_for_cancelled_booking', $paymentIntentId, [
                    'session_id'        => $session->id,
                    'payment_intent_id' => $paymentIntentId,
                    'amount_total'      => $session->amount_total ?? null,
                    'currency'          => $session->currency ?? null,
                ], systemOrigin: true);
                return ['action' => 'flagged'];
            }

            if ($amountOrCurrencyMismatch) {
                // Never auto-confirm a financially inconsistent payment.
                PaymentAnomalyService::record($locked, 'amount_or_currency_mismatch', $session->id, [
                    'session_id'           => $session->id,
                    'payment_intent_id'    => $paymentIntentId,
                    'amount_total'         => $session->amount_total ?? null,
                    'currency'             => $session->currency ?? null,
                    'expected_amount_fils' => $expectedAmountFils,
                ], systemOrigin: true);
                return ['action' => 'flagged'];
            }

            if ($locked->payment_status === 'paid') {
                if ($locked->stripe_payment_intent_id === $paymentIntentId) {
                    // Ordinary redelivery of the SAME already-recorded
                    // payment — no write, no flag, no audit event.
                    return ['action' => 'duplicate_delivery'];
                }

                // A genuinely DIFFERENT successful payment. Never overwrite
                // the original paid_amount/payment_intent — flag for
                // investigation instead.
                PaymentAnomalyService::record($locked, 'second_successful_payment', $paymentIntentId, [
                    'new_session_id'              => $session->id,
                    'new_payment_intent_id'       => $paymentIntentId,
                    'new_amount_total'            => $session->amount_total ?? null,
                    'original_payment_intent_id'  => $locked->stripe_payment_intent_id,
                    'original_paid_amount'        => (string) $locked->paid_amount,
                ], systemOrigin: true);
                return ['action' => 'flagged'];
            }

            // First legitimate successful payment for this booking —
            // possibly via an older session than whatever is currently
            // referenced (the crash/timeout recovery case).
            $previousPointer = $locked->stripe_checkout_session_id;

            $statusUpdate = $locked->status === 'pending_payment' ? ['status' => 'pending'] : [];

            $locked->update(array_merge([
                'payment_status'                  => 'paid',
                'paid_amount'                      => $session->amount_total / 100,
                'stripe_payment_intent_id'         => $paymentIntentId,
                'stripe_checkout_session_id'       => $session->id,
                'checkout_reservation_token'       => null,
                'checkout_reservation_expires_at'  => null,
            ], $statusUpdate));

            \App\Events\Audit\PaymentConfirmed::dispatch(
                $locked->id, $event->id, $session->id, $paymentIntentId,
                (int) $session->amount_total, $session->currency, $locked->payment_type,
            );

            return [
                'action'               => 'recorded',
                'previous_session_id'  => $previousPointer,
                'new_session_id'       => $session->id,
            ];
        });

        if ($outcome['action'] === 'recorded') {
            Log::info('Stripe webhook: payment confirmed', [
                'booking_id'        => $booking->id,
                'payment_intent_id' => $paymentIntentId,
            ]);

            $booking->refresh()->load('customer', 'service', 'serviceVariant', 'therapist.user');
            $booking->customer->notify(new BookingNotification($booking, 'payment_succeeded'));

            if (!empty($outcome['previous_session_id']) && $outcome['previous_session_id'] !== $outcome['new_session_id']) {
                // Best-effort cleanup of the now-redundant session, queued
                // so this Stripe work never runs under the lock above.
                ReconcileRedundantCheckoutSession::dispatch(
                    $booking->id,
                    $outcome['previous_session_id'],
                    $outcome['new_session_id'],
                );
            }
        }

        return response()->json(['status' => 'ok']);
    }

    /**
     * Deliberately UNCHANGED exact-session-id matching — a late expiry
     * event for an abandoned old session must never cancel a booking that
     * has since paid or moved on via a newer session.
     */
    private function handleCheckoutExpired($event)
    {
        $session = $event->data->object;

        $bookingId = $session->metadata->booking_id ?? null;

        $booking = DB::transaction(function () use ($bookingId, $session, $event) {
            $locked = Booking::where('id', $bookingId)
                ->where('stripe_checkout_session_id', $session->id)
                ->lockForUpdate()
                ->first();

            if (!$locked) {
                return null;
            }

            if ($locked->status !== 'pending_payment') {
                Log::info('Stripe webhook: checkout session expired, booking already resolved — no action taken', [
                    'booking_id' => $locked->id,
                    'status'     => $locked->status,
                ]);

                return null;
            }

            $locked->update([
                'status'            => 'cancelled',
                'cancellation_type' => 'expired',
                'cancelled_at'      => now(),
            ]);

            \App\Events\Audit\CheckoutExpired::dispatch($locked->id, $event->id, $session->id);

            return $locked;
        });

        if ($booking) {
            Log::info('Stripe webhook: checkout session expired, pending_payment booking cancelled', [
                'booking_id' => $booking->id,
            ]);

            $booking->load('customer', 'service', 'serviceVariant', 'therapist.user');
            $booking->customer->notify(new BookingNotification($booking, 'payment_failed'));
        }

        return response()->json(['status' => 'ok']);
    }
}
