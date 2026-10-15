<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\RescheduleProposal;
use App\Models\RescheduleRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Creates a reschedule *request* — a customer's or therapist's preference
 * for a new time, captured for later admin review. This never touches the
 * booking's own schedule, status, or notifications: the only thing that is
 * ever allowed to actually move a booking is
 * BookingRescheduleService::reschedule(), called later by the admin
 * approval step (not built in this step). Shared by both the customer and
 * legacy therapist creation paths so the eligibility, duplicate-request,
 * and future-time rules exist in exactly one place.
 */
class RescheduleRequestService
{
    public const ROLE_CUSTOMER  = 'customer';
    public const ROLE_THERAPIST = 'therapist';

    // Mirrors BookingRescheduleService::RESCHEDULABLE_STATUSES — a request
    // for a time change only makes sense for a booking that could still
    // legally be rescheduled. pending_payment is excluded for the same
    // reason it's excluded there: nothing is confirmed yet to reschedule.
    public const ELIGIBLE_STATUSES = ['pending', 'accepted'];

    /**
     * @throws \Symfony\Component\HttpKernel\Exception\HttpException 422 on an ineligible booking state or a past requested time, 409 on a duplicate pending request
     */
    public static function create(
        Booking $booking,
        User    $requester,
        string  $role,
        Carbon  $requestedStartAt,
        ?string $reason = null
    ): RescheduleRequest {
        abort_if($requestedStartAt->lte(now()), 422, 'The requested time must be in the future.');

        // Row-locks the booking so two concurrent submissions against the
        // same booking serialize through this check instead of both
        // reading "no pending request yet" and both inserting one — the
        // same lockForUpdate() pattern AdminBookingController/
        // BookingRescheduleService already use for the real reschedule.
        return DB::transaction(function () use ($booking, $requester, $role, $requestedStartAt, $reason) {
            $locked = Booking::where('id', $booking->id)->lockForUpdate()->firstOrFail();

            abort_if(
                !in_array($locked->status, self::ELIGIBLE_STATUSES, true),
                422,
                'This booking is not eligible for a reschedule request.'
            );

            $hasPending = RescheduleRequest::where('booking_id', $locked->id)
                ->where('status', 'pending')
                ->exists();

            abort_if($hasPending, 409, 'A pending reschedule request already exists for this booking.');

            // Cross-flow guard: an admin-sent Reschedule Proposal
            // (RescheduleProposalService) is the opposite-direction
            // counterpart to this request — only one active reschedule
            // item (request OR proposal) may be open per booking at a
            // time. RescheduleProposalService::counter() — the one caller
            // that creates a request FROM a pending proposal — marks that
            // proposal 'countered' before calling here, so it never trips
            // this guard on its own proposal.
            $hasPendingProposal = RescheduleProposal::where('booking_id', $locked->id)
                ->where('status', 'pending')
                ->exists();

            abort_if(
                $hasPendingProposal,
                409,
                "This booking has a pending reschedule proposal awaiting the customer's response."
            );

            return RescheduleRequest::create([
                'booking_id'           => $locked->id,
                'requested_by_user_id' => $requester->id,
                'requested_by_role'    => $role,
                'requested_start_at'   => $requestedStartAt,
                'reason'               => $reason,
                'status'               => 'pending',
            ]);
        });
    }
}
