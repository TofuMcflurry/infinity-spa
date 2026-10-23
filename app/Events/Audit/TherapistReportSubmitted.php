<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class TherapistReportSubmitted extends AuditEvent
{
    public function __construct(int $reportId, int $bookingId, int $reportedUserId, string $reason, ?Request $request = null)
    {
        parent::__construct('therapist.report_submitted', 'Booking', $bookingId, [
            'report_id'        => $reportId,
            'reported_user_id' => $reportedUserId,
            'reason'           => $reason,
        ], $request);
    }
}
