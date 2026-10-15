<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class BookingRescheduled extends AuditEvent
{
    public function __construct(
        int     $bookingId,
        ?string $previousScheduledStart,
        ?string $previousScheduledEnd,
        string  $newScheduledStart,
        string  $newScheduledEnd,
        ?string $reason = null,
        ?Request $request = null
    ) {
        parent::__construct('booking.rescheduled', 'Booking', $bookingId, [
            'previous_scheduled_start' => $previousScheduledStart,
            'previous_scheduled_end'   => $previousScheduledEnd,
            'new_scheduled_start'      => $newScheduledStart,
            'new_scheduled_end'        => $newScheduledEnd,
            'reason'                   => $reason,
        ], $request);
    }
}
