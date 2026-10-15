<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;

/**
 * One event for all three customer responses (accepted/countered/
 * cancelled) — the $response field plus $details carries what's specific
 * to each, instead of three near-identical event classes.
 */
class RescheduleProposalResponded extends AuditEvent
{
    public function __construct(
        int      $proposalId,
        int      $bookingId,
        string   $response, // accepted|countered|cancelled
        array    $details = [],
        ?Request $request = null
    ) {
        parent::__construct('reschedule_proposal.responded', 'Booking', $bookingId, array_merge([
            'proposal_id' => $proposalId,
            'response'    => $response,
        ], $details), $request);
    }
}
