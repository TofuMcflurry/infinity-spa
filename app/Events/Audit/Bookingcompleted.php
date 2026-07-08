<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class BookingCompleted extends AuditEvent
{
    public function __construct(int $bookingId, string $customerName, ?Request $request = null)
    {
        parent::__construct('booking.completed', 'Booking', $bookingId, ['customer' => $customerName], $request);
    }
}