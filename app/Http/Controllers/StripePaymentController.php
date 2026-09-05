<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use Illuminate\Http\Request;
use Stripe\Checkout\Session;
use Stripe\Stripe;
use Stripe\Webhook;
use Stripe\Exception\SignatureVerificationException;
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

        $paymentType = $request->payment_type;
        $amount      = $paymentType === 'downpayment'
            ? $booking->downpayment_amount
            : $booking->serviceVariant->price;

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

            $booking = Booking::where('id', $bookingId)
                ->where('stripe_checkout_session_id', $session->id)
                ->first();

            if (!$booking) {
                return response()->json(['status' => 'ok']);
            }

            if ($booking->payment_status === 'paid') {
                return response()->json(['status' => 'ok']);
            }

            $booking->update([
                'payment_status'            => 'paid',
                'paid_amount'               => $session->amount_total / 100,
                'stripe_payment_intent_id'  => $session->payment_intent,
                'status'                    => 'accepted',
            ]);

            Log::info('Stripe webhook: payment confirmed', [
                'booking_id'   => $booking->id,
                'amount'       => $booking->paid_amount,
                'payment_type' => $paymentType,
            ]);

            return response()->json(['status' => 'ok']);
        }

        return response()->json(['status' => 'ok']);
    }
}
