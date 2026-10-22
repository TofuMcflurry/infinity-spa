<?php

namespace App\Events\Audit;

use Illuminate\Http\Request;

class RescheduleRequestRejected extends AuditEvent
{
    public function __construct(int $requestId, int $bookingId, ?Request $request = null)
    {
        parent::__construct('reschedule_request.rejected', 'Booking', $bookingId, [
            'request_id' => $requestId,
            'booking_id' => $bookingId,
        ], $request);
    }
}
