<?php

namespace App\Http\Controllers;

use App\Models\RescheduleProposal;
use App\Services\RescheduleProposalService;
use Carbon\Carbon;
use Illuminate\Http\Request;

/**
 * The customer's three responses to an admin-sent Reschedule Proposal —
 * see docs/design/INFINITY-HOME-SPA-UI-HANDOFF.md §8.5. Ownership of the
 * proposal's booking is verified inside RescheduleProposalService itself
 * (it locks the booking row and checks customer_id), the same way
 * BookingController::rescheduleRequest() leaves requester identity
 * entirely to the authenticated session rather than the request body.
 */
class RescheduleProposalController extends Controller
{
    public function accept(Request $request, RescheduleProposal $reschedule_proposal)
    {
        $proposal = RescheduleProposalService::accept($reschedule_proposal, $request->user());

        return response()->json([
            'message'  => 'Schedule accepted. Your booking has been updated.',
            'proposal' => [
                'id'     => $proposal->id,
                'status' => $proposal->status,
            ],
            'booking' => [
                'id'              => $proposal->booking->id,
                'scheduled_start' => $proposal->booking->scheduled_start?->toIso8601String(),
                'scheduled_end'   => $proposal->booking->scheduled_end?->toIso8601String(),
                'status'          => $proposal->booking->status,
            ],
        ]);
    }

    public function counter(Request $request, RescheduleProposal $reschedule_proposal)
    {
        $request->validate([
            'requested_start_at' => 'required|date|after:now',
            'reason'             => 'nullable|string|max:500',
        ]);

        $newRequest = RescheduleProposalService::counter(
            $reschedule_proposal,
            $request->user(),
            Carbon::parse($request->requested_start_at),
            $request->reason
        );

        return response()->json([
            'message' => 'Alternative time requested. Awaiting admin review.',
            'request' => [
                'id'                 => $newRequest->id,
                'booking_id'         => $newRequest->booking_id,
                'requested_start_at' => $newRequest->requested_start_at->toIso8601String(),
                'status'             => $newRequest->status,
            ],
        ], 201);
    }

    public function cancel(Request $request, RescheduleProposal $reschedule_proposal)
    {
        $request->validate([
            'reason' => 'required|string|max:500',
        ]);

        $outcome = RescheduleProposalService::cancel($reschedule_proposal, $request->user(), $request->reason);

        return response()->json([
            'message'           => 'Booking cancelled.',
            'cancellation_type' => $outcome['result']['cancellation_type'],
        ]);
    }
}
