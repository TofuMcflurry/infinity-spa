<?php

namespace App\Events\Audit;

class CheckoutExpired extends AuditEvent
{
    public function __construct(int $bookingId, string $eventId, string $sessionId)
    {
        parent::__construct('payment.checkout_expired', 'Booking', $bookingId, [
            'stripe_event_id' => $eventId,
            'session_id' => $sessionId,
        ], systemOrigin: true);
    }
}
