<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class StaleBookingResolved extends AuditEvent
{
    public function __construct(int $bookingId, string $resolutionAction, string $previousStatus, int $adminId, ?Request $request = null)
    {
        parent::__construct('booking.stale_resolved', 'Booking', $bookingId, [
            'resolution_action' => $resolutionAction,
            'previous_status'   => $previousStatus,
            'admin_id'          => $adminId,
            'timestamp'         => now()->toIso8601String(),
        ], $request);
    }
}
