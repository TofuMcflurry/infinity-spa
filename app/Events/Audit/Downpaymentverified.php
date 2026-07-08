<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class DownpaymentVerified extends AuditEvent
{
    public function __construct(int $bookingId, string $customerName, ?Request $request = null)
    {
        parent::__construct('booking.downpayment_verified', 'Booking', $bookingId, ['customer' => $customerName], $request);
    }
}