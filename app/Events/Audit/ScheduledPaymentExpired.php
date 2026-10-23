<?php

namespace App\Events\Audit;

class ScheduledPaymentExpired extends AuditEvent
{
    public function __construct(int $bookingId, int $staleAfterMinutes)
    {
        parent::__construct('booking.payment_expired', 'Booking', $bookingId, [
            'source' => 'scheduler', 'stale_after_minutes' => $staleAfterMinutes,
        ], systemOrigin: true);
    }
}
