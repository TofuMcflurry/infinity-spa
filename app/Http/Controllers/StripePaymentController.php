<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Notifications\BookingNotification;
use Illuminate\Http\Request;
use Stripe\Checkout\Session;
use Stripe\Stripe;
use Stripe\Webhook;
use Stripe\Exception\SignatureVerificationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class StripePaymentController extends Controller
{
    // ── Create a Stripe Checkout session for a booking ──────────────────────────
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
        // booking, must never be handed a fresh Stripe obligation — repeat
        // calls to this endpoint are otherwise unguarded (see Batch #31A.1
        // audit finding under "repeat checkout creation").
        if ($booking->payment_status === 'paid') {
            return response()->json(['message' => 'This booking has already been paid for.'], 422);
        }

        if (in_array($booking->status, ['cancelled', 'rejected', 'completed'], true)) {
            return response()->json(['message' => 'This booking is no longer eligible for payment.'], 422);
        }

        $paymentType = $request->payment_type;

        // The request's payment_type must match what this booking was
        // actually created with — downpayment_amount/remaining_amount were
        // split according to the ORIGINAL choice at booking creation
        // (BookingController::store()), so honoring a different value here
        // would charge the wrong persisted amount for what was agreed.
        if ($booking->payment_type !== null && $paymentType !== $booking->payment_type) {
            return response()->json(['message' => 'Payment type does not match this booking\'s original payment plan.'], 422);
        }

        // The amount due via this checkout is always the booking's own
        // persisted downpayment_amount — snapshotted once at creation and
        // already set to the FULL price there when payment_type is 'full'
        // (see BookingController::store()'s isFullPayment branch), so it is
        // already correct for both branches. Never re-derive from the live
        // serviceVariant price, which can drift after an Admin price edit.
        $amount = $booking->downpayment_amount;

        if ($amount === null) {
            return response()->json([
                'message' => 'This booking has no recorded payment amount and cannot be charged automatically. Please contact support.',
            ], 422);
        }

        if ((float) $amount <= 0) {
            return response()->json(['message' => 'There is nothing due for this booking.'], 422);
        }

        $productName = "{$booking->service->group_name} ({$booking->serviceVariant->duration_minutes} min) - " . ucfirst($paymentType);

        Stripe::setApiKey(config('services.stripe.secret'));

        $session = Session::create([
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
        ]);

        $booking->update([
            'payment_type'                => $paymentType,
            'stripe_checkout_session_id'  => $session->id,
        ]);

        return response()->json([
            'checkout_url' => $session->url,
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
            $session = $event->data->object;

            $bookingId   = $session->metadata->booking_id ?? null;
            $paymentType = $session->metadata->payment_type ?? null;

            // Row-locked so a retried/duplicate webhook delivery for the
            // same event can't both pass these guards before either commits
            // — the same existing payment_status/status checks are just
            // re-read post-lock instead of once up front, so a second,
            // near-simultaneous delivery sees the already-'paid' row and
            // returns null here, before ever reaching notify() below.
            $booking = DB::transaction(function () use ($bookingId, $session) {
                $locked = Booking::where('id', $bookingId)
                    ->where('stripe_checkout_session_id', $session->id)
                    ->lockForUpdate()
                    ->first();

                if (!$locked) {
                    return null;
                }

                if ($locked->payment_status === 'paid') {
                    return null;
                }

                // Race guard: the 20-minute sweep or the checkout.session.expired
                // handler may have already cancelled this booking moments before
                // a late 'completed' event arrives. Don't resurrect it as paid.
                if ($locked->status === 'cancelled') {
                    Log::warning('Stripe webhook: payment completed for already-cancelled booking — ignoring', [
                        'booking_id' => $locked->id,
                    ]);

                    return null;
                }

                // Payment confirmation is not therapist approval. Only advance
                // 'pending_payment' -> 'pending' (awaiting the therapist's
                // decision) — if the therapist already accepted/rejected this
                // booking while payment was still in flight, don't clobber that.
                $statusUpdate = $locked->status === 'pending_payment'
                    ? ['status' => 'pending']
                    : [];

                $locked->update(array_merge([
                    'payment_status'            => 'paid',
                    'paid_amount'               => $session->amount_total / 100,
                    'stripe_payment_intent_id'  => $session->payment_intent,
                ], $statusUpdate));

                return $locked;
            });

            if ($booking) {
                Log::info('Stripe webhook: payment confirmed', [
                    'booking_id'   => $booking->id,
                    'amount'       => $booking->paid_amount,
                    'payment_type' => $paymentType,
                ]);

                $booking->load('customer', 'service', 'serviceVariant', 'therapist.user');
                $booking->customer->notify(new BookingNotification($booking, 'payment_succeeded'));
            }

            return response()->json(['status' => 'ok']);
        }

        if ($event->type === 'checkout.session.expired') {
            $session = $event->data->object;

            $bookingId = $session->metadata->booking_id ?? null;

            // Same row-lock + re-check pattern as the completed handler
            // above — guards a retried/duplicate expiry event the same way.
            $booking = DB::transaction(function () use ($bookingId, $session) {
                $locked = Booking::where('id', $bookingId)
                    ->where('stripe_checkout_session_id', $session->id)
                    ->lockForUpdate()
                    ->first();

                if (!$locked) {
                    return null;
                }

                // Only a still-unpaid booking should be cancelled here. If it's
                // already 'cancelled' this is a no-op (idempotent), and if it's
                // already 'accepted' (the completed webhook won a race against
                // Stripe's expiry event) we must not clobber a paid booking —
                // just log and move on either way.
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

        return response()->json(['status' => 'ok']);
    }
}
