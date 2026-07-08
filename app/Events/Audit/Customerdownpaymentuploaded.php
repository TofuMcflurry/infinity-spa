<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class CustomerDownpaymentUploaded extends AuditEvent
{
    public function __construct(int $bookingId, ?Request $request = null)
    {
        parent::__construct('customer.downpayment_uploaded', 'Booking', $bookingId, [], $request);
    }
}