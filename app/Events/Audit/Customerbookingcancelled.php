<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class CustomerBookingCancelled extends AuditEvent
{
    public function __construct(int $bookingId, ?string $reason, ?Request $request = null)
    {
        parent::__construct('customer.booking_cancelled', 'Booking', $bookingId, ['reason' => $reason], $request);
    }
}