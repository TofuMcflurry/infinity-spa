<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class BookingFlaggedStale extends AuditEvent
{
    public function __construct(int $bookingId, string $previousStatus, string $reason, ?Request $request = null)
    {
        parent::__construct('booking.flagged_stale', 'Booking', $bookingId, [
            'previous_status' => $previousStatus,
            'reason'          => $reason,
            'timestamp'       => now()->toIso8601String(),
        ], $request);
    }
}
