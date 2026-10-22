<?php

namespace App\Events\Audit;

use Illuminate\Http\Request;

class BookingArrived extends AuditEvent
{
    public function __construct(int $bookingId, ?Request $request = null)
    {
        parent::__construct('booking.arrived', 'Booking', $bookingId, [
            'previous_status' => 'en_route',
            'new_status' => 'arrived',
        ], $request);
    }
}
