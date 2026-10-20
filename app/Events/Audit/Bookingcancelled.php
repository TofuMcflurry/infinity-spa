<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class BookingCancelled extends AuditEvent
{
    // $outcome carries BookingCancellationService::cancelByTherapist()'s
    // return value (refund_due/refund_amount/voucher_restored) — null for
    // any cancellation path other than therapist-caused (this event was
    // previously imported but never actually dispatched anywhere).
    public function __construct(int $bookingId, string $customerName, ?string $reason, ?array $outcome = null, ?Request $request = null)
    {
        parent::__construct('booking.cancelled', 'Booking', $bookingId, [
            'customer' => $customerName,
            'reason'   => $reason,
            'outcome'  => $outcome,
        ], $request);
    }
}