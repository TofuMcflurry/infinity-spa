// Authoritative payment-display contract — see the payment audit (findings
// A1, A2, A5) and docs/design/INFINITY-HOME-SPA-UI-HANDOFF.md. One shared
// source of truth, reused by Admin, Therapist, and Customer, so the three
// roles can no longer drift out of sync on what a booking's payment fields
// actually mean.
//
// Source-of-truth rules:
// - `paid_amount` is the ONLY field that means "amount actually confirmed
//   collected" — set exclusively by the Stripe webhook
//   (StripePaymentController::handleWebhook()), or implicitly 0 for a
//   voucher-covered booking. Never substitute `downpayment_amount` for it
//   — that field is a legacy name repurposed at creation time to also mean
//   "amount due now" for a full-payment booking, and nothing resyncs it if
//   the booking's payment state changes afterward.
// - `downpayment_amount` / `remaining_amount` describe the PLANNED 20/80
//   cash split at booking time — informational about the plan, never a
//   stand-in for "amount actually paid."
// - `payment_status` is the single authority for "has this been paid."
//   `payment_method` ('cash'/'cashless') only describes how the REMAINING
//   balance will be settled for a downpayment-type booking — a 'cash'
//   method is NOT a contradiction with a Stripe-confirmed deposit: the
//   deposit itself is always charged through Stripe regardless of
//   payment_method (see StripePaymentController::createCheckoutSession(),
//   which charges `downpayment_amount` via Stripe even when payment_method
//   is 'cash'). The UI must never imply "cash" means "nothing went through
//   Stripe" — that's why the status label distinguishes a full payment from
//   a deposit-only payment, rather than collapsing both into one generic
//   "Paid via Stripe" that overclaims full settlement.
// - The legacy manual-proof fields (`downpayment_status` submitted/verified,
//   `downpayment_proof`) have no live write path anywhere in the current
//   backend — nothing ever sets them past 'pending' — so they're only ever
//   used here as a fallback for the not-yet-paid case, never presented as
//   current truth once `payment_status === 'paid'`.
// `totalAmountOverride` lets a caller supply the service price explicitly
// when a page's booking shape doesn't expose a flat `price`/`service_price`
// field (e.g. Therapist's raw, unformatted Eloquent JSON nests it under
// `service_variant.price`/`service.price` instead) — the rest of the
// contract (paid/remaining/statusKey) is identical either way.
export function computePaymentSummary(booking, totalAmountOverride = null) {
    const isVoucher = !!booking.is_voucher_covered;
    const isFull    = booking.payment_type === 'full';
    const isPaid    = booking.payment_status === 'paid';

    const totalAmount = Number(totalAmountOverride ?? booking.price ?? booking.service_price ?? 0);
    // The one authoritative "how much has actually been collected" figure.
    const paidAmount = booking.paid_amount != null ? Number(booking.paid_amount) : null;

    let statusKey;
    if (isVoucher) statusKey = 'voucher';
    else if (isPaid) statusKey = isFull ? 'paid_full' : 'deposit_paid';
    else if (booking.status === 'pending_payment') statusKey = 'awaiting_payment';
    else if (booking.downpayment_status === 'verified') statusKey = 'verified';
    else if (booking.downpayment_proof) statusKey = 'submitted';
    else statusKey = 'no_proof';

    const totalPaid = isVoucher
        ? 0
        : !isPaid
            ? null // nothing confirmed yet — never render a currency figure for this
            : isFull
                ? (paidAmount ?? totalAmount)
                : (paidAmount ?? Number(booking.downpayment_amount ?? 0));

    const remaining = isVoucher || (isPaid && isFull)
        ? 0
        : !isPaid
            ? totalAmount
            : Number(booking.remaining_amount ?? Math.max(totalAmount - (totalPaid ?? 0), 0));

    return {
        statusKey,
        isVoucher,
        isFull,
        isPaid,
        totalAmount,
        totalPaid,               // null => not yet paid; render that, not a currency figure
        remaining,
        // A downpayment-specific breakdown (20% paid / 80% remaining) is
        // only ever meaningful for a non-voucher, non-full booking.
        showDownpaymentSection: !isVoucher && !isFull,
    };
}

// Shared label text for computePaymentSummary()'s statusKey. Each role's
// own existing colour/style map stays in place — only the key→label
// mapping (and which key gets chosen) is unified here.
export const PAYMENT_STATUS_LABELS = {
    voucher:          'Free (Voucher)',
    paid_full:        'Paid via Stripe',
    deposit_paid:     'Deposit Paid via Stripe',
    awaiting_payment: 'Awaiting Payment',
    verified:         'Verified',
    submitted:        'Submitted',
    no_proof:         'No Proof',
};

export function formatAed(amount) {
    return amount == null ? null : `AED ${Number(amount).toFixed(2)}`;
}
