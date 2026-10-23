<?php

namespace App\Events\Audit;

class PaymentConfirmed extends AuditEvent
{
    public function __construct(int $bookingId, string $eventId, string $sessionId, string $paymentIntentId, int $amountTotal, string $currency, ?string $paymentType)
    {
        parent::__construct('payment.confirmed', 'Booking', $bookingId, [
            'stripe_event_id' => $eventId,
            'session_id' => $sessionId,
            'payment_intent_id' => $paymentIntentId,
            'amount_total' => $amountTotal,
            'currency' => $currency,
            'payment_type' => $paymentType,
        ], systemOrigin: true);
    }
}
