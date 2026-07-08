<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class CustomerBookingCreated extends AuditEvent
{
    public function __construct(int $bookingId, string $serviceName, int $duration, ?Request $request = null)
    {
        parent::__construct('customer.booking_created', 'Booking', $bookingId, ['service' => $serviceName, 'duration_minutes' => $duration], $request);
    }
}