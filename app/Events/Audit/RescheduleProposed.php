<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class RescheduleProposed extends AuditEvent
{
    public function __construct(
        int      $proposalId,
        int      $bookingId,
        string   $proposedStartAt,
        ?string  $adminReason,
        string   $expiresAt,
        ?Request $request = null
    ) {
        parent::__construct('reschedule_proposal.created', 'Booking', $bookingId, [
            'proposal_id'       => $proposalId,
            'proposed_start_at' => $proposedStartAt,
            'admin_reason'      => $adminReason,
            'expires_at'        => $expiresAt,
        ], $request);
    }
}
