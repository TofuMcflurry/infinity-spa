# Architecture Notes

Technical deep-dive on the payment system and a couple of other engineering
decisions that are easier to explain with room to breathe than as README
bullets. See [README.md](./README.md) for the feature overview and setup
instructions.

---

## Payment Flow Overview

Payments go through **Stripe Checkout** (redirect-based) rather than a
custom card form, so card data never touches the app's server. The flow:

1. **Customer selects a payment type** (20% downpayment or full amount) on
   Step 5 of the booking wizard.
2. **Server creates a Checkout Session** (`StripePaymentController::createCheckoutSession`),
   pricing it from `ServiceVariant->price` — never a client-supplied amount —
   and stamping the `booking_id` and `payment_type` into the session's
   `metadata`. The session is set to expire after 30 minutes (Stripe's
   minimum allowed window).
3. **Customer is redirected to Stripe** to enter card details and pay.
4. **Stripe redirects back** to `PaymentSuccess.jsx`, which polls booking
   status — but the redirect is *not* what confirms the booking. A closed
   tab or a flaky connection on the way back must not leave a paid booking
   stuck as unpaid.
5. **Stripe sends a `checkout.session.completed` webhook** to
   `/webhooks/stripe`, server-to-server, once payment actually clears. This
   is the only trigger that marks the booking `paid` and advances its
   status to `accepted`.
6. **The polling page picks up the status change** and shows the
   confirmation screen.

Confirmation is deliberately decoupled from the browser redirect — see
[Webhook Security](#webhook-security) below.

---

## Webhook Security

The webhook endpoint is public (Stripe has to be able to reach it without a
session cookie), which means anyone could in principle POST a fake
`checkout.session.completed` payload claiming a booking was paid. This is
prevented with **HMAC signature verification**:

```php
$event = Webhook::constructEvent(
    $payload,
    $sigHeader,          // the "Stripe-Signature" header
    config('services.stripe.webhook_secret')
);
```

Stripe signs every webhook payload with a secret shared only between Stripe
and this app (`STRIPE_WEBHOOK_SECRET`, obtained via `stripe listen` locally
or the Stripe Dashboard in production). `Webhook::constructEvent` recomputes
the HMAC over the raw request body and compares it against the signature
header; if they don't match — or the payload was tampered with, replayed
with a stale timestamp, or simply forged — it throws
`SignatureVerificationException` and the handler returns `400` without
touching the database.

In plain terms: **the signature proves the request actually came from
Stripe and wasn't modified in transit**, which is what makes it safe to
trust a webhook to unilaterally mark a booking as paid.

---

## Idempotency and Race Condition Handling

Webhooks are "at-least-once" by design — Stripe retries delivery if it
doesn't get a fast `2xx`, so the same event can arrive more than once. Two
guards make the handler idempotent:

```php
if ($booking->payment_status === 'paid') {
    return response()->json(['status' => 'ok']); // already processed
}
```

A duplicate `checkout.session.completed` for a booking that's already
`paid` is a no-op, not a double-charge or a double-advance of booking
status.

**The trickier case is a race between two independent expiry mechanisms and
a late payment confirmation.** A checkout session can be cancelled two
different ways (see [Abandoned Checkout Cleanup](#abandoned-checkout-cleanup)
below) while the *completed* event for that same session is still in
flight. Without a guard, a `completed` webhook arriving after the booking
was already cancelled would silently resurrect a cancelled booking as
`accepted`:

```php
// Race guard: the 20-minute sweep or the checkout.session.expired
// handler may have already cancelled this booking moments before
// a late 'completed' event arrives. Don't resurrect it as paid.
if ($booking->status === 'cancelled') {
    Log::warning('Stripe webhook: payment completed for already-cancelled booking — ignoring', [
        'booking_id' => $booking->id,
    ]);
    return response()->json(['status' => 'ok']);
}
```

The `checkout.session.expired` handler has the mirror-image guard: it only
cancels a booking that's still `pending_payment`, so it can never clobber a
booking the `completed` event already marked `accepted`.

---

## Abandoned Checkout Cleanup

If a customer opens Stripe Checkout and just closes the tab, the booking
would otherwise sit in `pending_payment` forever, holding the therapist's
slot. Two independent mechanisms clean this up — deliberately redundant,
not duplicated by accident:

**1. Stripe-side session expiry (fast path).** The Checkout Session itself
is created with a 30-minute expiry — Stripe's shortest allowed window:

```php
// Stripe's minimum allowed expiry window is 30 minutes — shorter
// than the 24h default so an abandoned checkout frees the slot
// quickly instead of leaving the booking pending_payment all day.
'expires_at' => now()->addMinutes(30)->timestamp,
```

When the session expires, Stripe fires a `checkout.session.expired`
webhook, and the handler cancels the booking (if it's still
`pending_payment`) and frees the slot — normally within 30 minutes of
abandonment.

**2. Scheduled sweep, 20 minutes (safety net).** Webhooks can fail to
arrive — an outage, a dropped event, a checkout session the customer never
even opened. `bookings:expire-stale-pending-payment` runs on the scheduler
and force-cancels any `pending_payment` booking older than 20 minutes:

```php
// Safety net for when the checkout.session.expired webhook never fires
// (webhook downtime, missed event, or a checkout session that was never
// even opened). Threshold is shorter than Stripe's own session expiry
// so this rarely has to do the webhook's job, but still catches it
// within 20-30 min.
private const STALE_AFTER_MINUTES = 20;
```

The sweep's threshold (20 min) is intentionally *shorter* than Stripe's
session expiry (30 min), so in the common case the sweep is the one that
actually fires, and the webhook path is what rarely gets to do the work —
whichever one wins, the other is a no-op thanks to the idempotency guards
above.

---

## Loyalty Voucher Cancellation Policy

Vouchers (`IHS-FREE-XXXX`, earned every 10 completed bookings) skip
payment entirely, so there's no refund to process on cancellation — but the
same fairness logic as a paid downpayment still applies, keyed off a 24
hour cutoff before the scheduled session:

- **Cancelled more than 24 hours before the session** → the voucher is
  restored to the customer's account and can be redeemed on a future
  booking.
- **Cancelled within 24 hours, or a no-show** → the voucher is forfeited
  permanently.

```php
$withinGrace = $hoursUntil > 24; // true = more than 24hrs away = restore

if ($booking->is_voucher_covered) {
    $voucherRestored = false;

    if ($withinGrace) {
        $restoreResult   = LoyaltyService::restoreVoucher($booking->id, $customerId);
        $voucherRestored = $restoreResult['success'];
    }

    $cancellationType = $voucherRestored ? 'refunded' : 'forfeited';
    // ...
}
```

This mirrors the paid-booking policy (20% downpayment forfeited within the
same 24-hour window) so customers face one consistent cancellation rule
regardless of how they paid.

---

## Booking Conflict Resolution

Double-booking prevention has to answer two *different* questions that are
easy to conflate:

- **Can the therapist do this?** — needs a travel-time buffer before the
  appointment and a rest buffer after, since the therapist is physically
  moving between locations.
- **Can the customer do this?** — only needs to avoid a genuine time
  overlap with the customer's *own* other bookings. The customer has no
  travel time to account for; they're just picking two sessions.

**The bug:** the original conflict check applied the therapist's
travel/rest buffer to the customer-side check too. That meant if a
*different* therapist had a rest buffer overlapping a time slot, a
customer's own next booking at that slot could be incorrectly blocked —
even though the customer wasn't double-booking anything and no travel was
involved on their side at all.

**The fix:** the customer-side conflict check now compares only against
the actual session window (`scheduled_start` / `scheduled_end`), ignoring
buffers entirely:

```php
// Customer-side conflict: compare only the actual session
// window (scheduled_start/scheduled_end) — no therapist
// travel/rest buffer applies to the customer's own schedule.
$customerConflict = Booking::where('customer_id', auth()->id())
    ->whereIn('status', ['pending_payment', 'pending', 'accepted'])
    ->where('scheduled_start', '<', $timeBlocks['scheduled_end'])
    ->where('scheduled_end',   '>', $slotDatetime)
    ->exists();
```

The therapist-side check (`hasConflict`) is untouched and still uses the
full travel-start-to-buffer-end window. The two checks now run
independently, so a customer can book back-to-back sessions the moment
their prior session ends, while therapist travel/rest constraints stay
fully enforced.
