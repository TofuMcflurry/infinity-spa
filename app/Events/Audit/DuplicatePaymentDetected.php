<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class DuplicatePaymentDetected extends AuditEvent
{
    public function __construct(int $bookingId, array $details, ?Request $request = null, bool $systemOrigin = false)
    {
        parent::__construct('payment.anomaly_detected', 'Booking', $bookingId, $details, $request, $systemOrigin);
    }
}
