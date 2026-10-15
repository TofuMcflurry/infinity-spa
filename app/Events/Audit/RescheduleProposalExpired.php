<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class RescheduleProposalExpired extends AuditEvent
{
    public function __construct(
        int      $proposalId,
        int      $bookingId,
        string   $proposedStartAt,
        string   $expiresAt,
        ?string  $cancellationType,
        ?Request $request = null
    ) {
        parent::__construct('reschedule_proposal.expired', 'Booking', $bookingId, [
            'proposal_id'       => $proposalId,
            'proposed_start_at' => $proposedStartAt,
            'expires_at'        => $expiresAt,
            'cancellation_type' => $cancellationType,
        ], $request);
    }
}
