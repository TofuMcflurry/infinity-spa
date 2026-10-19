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
        ?Request $request = null,
        // Refund/voucher-forfeiture determination (see
        // BookingRescheduleService::reschedule(), the only place
        // refund_forfeited_at is ever set) — recorded here, on the
        // existing reschedule audit event every reschedule path already
        // dispatches, rather than a second audit mechanism.
        bool    $forfeitureNewlyTriggered = false,
        ?string $refundForfeitedAt = null
    ) {
        parent::__construct('booking.rescheduled', 'Booking', $bookingId, [
            'previous_scheduled_start'   => $previousScheduledStart,
            'previous_scheduled_end'     => $previousScheduledEnd,
            'new_scheduled_start'        => $newScheduledStart,
            'new_scheduled_end'          => $newScheduledEnd,
            'reason'                     => $reason,
            'forfeiture_newly_triggered' => $forfeitureNewlyTriggered,
            'refund_forfeited_at'        => $refundForfeitedAt,
        ], $request);
    }
}
