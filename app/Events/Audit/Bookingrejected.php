<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class BookingRejected extends AuditEvent
{
    public function __construct(int $bookingId, string $customerName, ?string $reason, ?Request $request = null)
    {
        parent::__construct('booking.rejected', 'Booking', $bookingId, ['customer' => $customerName, 'reason' => $reason], $request);
    }
}