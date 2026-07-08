<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class BookingAccepted extends AuditEvent
{
    public function __construct(int $bookingId, string $customerName, ?Request $request = null)
    {
        parent::__construct('booking.accepted', 'Booking', $bookingId, ['customer' => $customerName], $request);
    }
}