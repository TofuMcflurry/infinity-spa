<?php

namespace App\Events\Audit;

use Illuminate\Http\Request;

class BookingEnRoute extends AuditEvent
{
    public function __construct(int $bookingId, ?Request $request = null)
    {
        parent::__construct('booking.en_route', 'Booking', $bookingId, [
            'previous_status' => 'accepted',
            'new_status' => 'en_route',
        ], $request);
    }
}
