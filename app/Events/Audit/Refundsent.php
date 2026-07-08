<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class RefundSent extends AuditEvent
{
    public function __construct(int $bookingId, string $refundReference, ?Request $request = null)
    {
        parent::__construct('booking.refund_sent', 'Booking', $bookingId, ['refund_reference' => $refundReference], $request);
    }
}