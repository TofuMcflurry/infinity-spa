<?php

namespace App\Services;

use App\Events\Audit\BookingRescheduled;
use App\Events\Audit\RescheduleProposalResponded;
use App\Events\Audit\RescheduleProposed;
use App\Models\Booking;
use App\Models\RescheduleProposal;
use App\Models\RescheduleRequest;
use App\Models\User;
use App\Notifications\BookingNotification;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Reschedule Proposal — the admin-initiated counterpart to
 * RescheduleRequestService (customer/therapist-initiated). An admin offers
 * a candidate time; the booking's own scheduled_start/scheduled_end/
 * travel_start/buffer_end are never touched here — only
 * BookingRescheduleService::reschedule() ever writes those, and only once
 * the customer accepts (accept()) or, for a countered proposal, once the
 * admin later approves the resulting reschedule_requests row through the
 * existing AdminBookingController::approveRescheduleRequest() (unchanged).
 *
 * Every method here follows the same shape already established by
 * RescheduleRequestService::create() / AdminBookingController's reschedule
 * actions: DB::transaction() locks the proposal (and, when it mutates the
 * booking, the booking too), re-validates, writes, dispatches the audit
 * event inside the transaction — then, only after a successful commit,
 * sends the customer/admin notification.
 *
 * See docs/design/INFINITY-HOME-SPA-UI-HANDOFF.md §8 for the approved flow
 * this implements.
 */
class RescheduleProposalService
{
    // Mirrors BookingRescheduleService::RESCHEDULABLE_STATUSES — a proposal
    // only makes sense for a booking that could still legally be
    // rescheduled.
    public const ELIGIBLE_STATUSES = ['pending', 'accepted'];

    // [Not on boards] per the design handoff §8.5 — the exact expiry
    // window was left to the backend. 24 hours matches the magnitude of
    // every other customer-facing decision window already in this app
    // (BookingCancellationService's own 24-hour refund/forfeit grace line).
    public const PROPOSAL_EXPIRY_HOURS = 24;

    /**
     * A. Admin proposes a new schedule. Never mutates the booking.
     *
     * @throws \Symfony\Component\HttpKernel\Exception\HttpException 422 on an ineligible booking state, a past proposed time, or a failed scheduling-rule check; 409 on a duplicate active proposal
     */
    public static function create(
        Booking $booking,
        User    $admin,
        Carbon  $proposedStart,
        ?string $adminReason = null
    ): RescheduleProposal {
        $proposal = DB::transaction(function () use ($booking, $admin, $proposedStart, $adminReason) {
            // Row-locks the booking so two concurrent proposals against the
            // same booking serialize instead of both reading "no active
            // proposal yet" — the same lockForUpdate() pattern
            // RescheduleRequestService::create() already uses.
            $locked = Booking::where('id', $booking->id)->lockForUpdate()->firstOrFail();

            abort_if(
                !in_array($locked->status, self::ELIGIBLE_STATUSES, true),
                422,
                'This booking is not eligible for a reschedule proposal.'
            );

            // A guest booking (GuestBookingController::store()) has no
            // customer_id — no authenticated session will ever exist for
            // RescheduleProposalController::accept()/counter()/cancel() to
            // resolve a proposal against, since those all require
            // auth()->user()->id to match customer_id. Without this guard,
            // a proposal created here would sit 'pending' until
            // bookings:expire-reschedule-proposals auto-cancels the
            // booking — never resolvable by anyone (audit finding A3).
            abort_if(
                is_null($locked->customer_id),
                422,
                'This booking has no customer account to notify — it cannot be sent a reschedule proposal.'
            );

            $hasActive = RescheduleProposal::where('booking_id', $locked->id)
                ->where('status', 'pending')
                ->exists();

            abort_if($hasActive, 409, 'An active reschedule proposal already exists for this booking.');

            // Cross-flow guard: a customer/therapist-submitted Reschedule
            // Request (RescheduleRequestService) is the opposite-direction
            // counterpart to this proposal — only one active reschedule
            // item (request OR proposal) may be open per booking at a time.
            $hasPendingRequest = RescheduleRequest::where('booking_id', $locked->id)
                ->where('status', 'pending')
                ->exists();

            abort_if(
                $hasPendingRequest,
                409,
                'This booking has a pending reschedule request awaiting admin review.'
            );

            // Reuses the exact same scheduling rules reschedule() enforces
            // (status/future/day-off/shift/unavailable-slot/conflict)
            // without writing anything — see BookingRescheduleService's own
            // docblock on this method.
            BookingRescheduleService::validateCandidate($locked, $proposedStart);

            $proposal = RescheduleProposal::create([
                'booking_id'          => $locked->id,
                'proposed_by_user_id' => $admin->id,
                'proposed_start_at'   => $proposedStart,
                'status'              => 'pending',
                'admin_reason'        => $adminReason,
                'expires_at'          => now()->addHours(self::PROPOSAL_EXPIRY_HOURS),
            ]);

            RescheduleProposed::dispatch(
                $proposal->id,
                $locked->id,
                $proposedStart->toDateTimeString(),
                $adminReason,
                $proposal->expires_at->toDateTimeString(),
                request(),
            );

            return $proposal;
        });

        // ── Post-commit notification ──────────────────────────────────────
        $proposal->load('booking.customer', 'booking.service', 'booking.serviceVariant', 'booking.therapist.user');
        if ($proposal->booking->customer) {
            $proposal->booking->customer->notify(new BookingNotification(
                booking:                 $proposal->booking,
                type:                    'reschedule_proposed',
                candidateScheduledStart: $proposal->proposed_start_at,
            ));
        }

        return $proposal;
    }

    /**
     * B. Customer accepts the proposed schedule — the ONLY place (besides a
     * countered request's later approval) a proposal is allowed to actually
     * move the booking, and it does so through
     * BookingRescheduleService::reschedule(), never a second mutation path.
     */
    public static function accept(RescheduleProposal $proposal, User $customer): RescheduleProposal
    {
        [$updatedBooking, $previousStart] = DB::transaction(function () use ($proposal, $customer) {
            $lockedProposal = self::lockPending($proposal);

            $lockedBooking = Booking::where('id', $lockedProposal->booking_id)->lockForUpdate()->firstOrFail();

            abort_if($lockedBooking->customer_id !== $customer->id, 403);

            $previousStart = $lockedBooking->scheduled_start;
            $previousEnd   = $lockedBooking->scheduled_end;

            // Re-validates against the booking's CURRENT state — never
            // trusts whatever was true when the proposal was created.
            $updatedBooking = BookingRescheduleService::reschedule(
                $lockedBooking,
                $lockedProposal->proposed_start_at,
                $lockedProposal->admin_reason
            );

            $lockedProposal->update([
                'status'       => 'accepted',
                'responded_at' => now(),
            ]);

            RescheduleProposalResponded::dispatch(
                $lockedProposal->id,
                $updatedBooking->id,
                'accepted',
                [],
                request(),
            );

            // Same final-mutation audit event every other reschedule path
            // (direct admin reschedule, approved request) already dispatches
            // — an accepted proposal looks identical in the audit trail.
            BookingRescheduled::dispatch(
                $updatedBooking->id,
                $previousStart?->toDateTimeString(),
                $previousEnd?->toDateTimeString(),
                $updatedBooking->scheduled_start->toDateTimeString(),
                $updatedBooking->scheduled_end->toDateTimeString(),
                $lockedProposal->admin_reason,
                request(),
            );

            return [$updatedBooking, $previousStart];
        });

        // ── Post-commit notification ──────────────────────────────────────
        // The existing 'rescheduled' notification, unchanged — identical to
        // what a direct admin reschedule or an approved request already
        // sends, since the booking has now actually moved.
        $updatedBooking->load('customer', 'service', 'serviceVariant', 'therapist.user');
        if ($updatedBooking->customer) {
            $updatedBooking->customer->notify(new BookingNotification($updatedBooking, 'rescheduled', $previousStart));
        }
        $updatedBooking->therapist->user->notify(new BookingNotification($updatedBooking, 'rescheduled', $previousStart));

        return $proposal->fresh(['booking.service', 'booking.serviceVariant', 'booking.therapist.user', 'booking.customer']);
    }

    /**
     * C. Customer declines the proposed time and suggests another — hands
     * off entirely to the existing customer request flow
     * (RescheduleRequestService), never a second request mechanism.
     */
    public static function counter(
        RescheduleProposal $proposal,
        User                $customer,
        Carbon              $requestedStart,
        ?string             $note = null
    ): RescheduleRequest {
        $request = DB::transaction(function () use ($proposal, $customer, $requestedStart, $note) {
            $lockedProposal = self::lockPending($proposal);

            $lockedBooking = Booking::where('id', $lockedProposal->booking_id)->lockForUpdate()->firstOrFail();

            abort_if($lockedBooking->customer_id !== $customer->id, 403);

            // Resolved BEFORE creating the request below — otherwise
            // RescheduleRequestService::create()'s own "no pending
            // proposal" cross-flow guard would immediately block the very
            // request this counter-response is trying to create. If
            // create() throws, this update rolls back with everything
            // else in this transaction, leaving the proposal untouched.
            $lockedProposal->update([
                'status'                 => 'countered',
                'customer_response_note' => $note,
                'responded_at'           => now(),
            ]);

            // The existing customer request flow — same eligibility,
            // duplicate-request, and future-time rules it already enforces
            // for every other customer-submitted request.
            $request = RescheduleRequestService::create(
                $lockedBooking,
                $customer,
                RescheduleRequestService::ROLE_CUSTOMER,
                $requestedStart,
                $note
            );

            $lockedProposal->update(['countered_into_request_id' => $request->id]);

            RescheduleProposalResponded::dispatch(
                $lockedProposal->id,
                $lockedBooking->id,
                'countered',
                [
                    'countered_into_request_id' => $request->id,
                    'requested_start_at'        => $requestedStart->toDateTimeString(),
                ],
                request(),
            );

            return $request;
        });

        // ── Post-commit notification ──────────────────────────────────────
        // Admin-facing — tells every admin there's a counter-suggestion
        // waiting in the existing Reschedule Requests review queue
        // (AdminBookingController::rescheduleRequests()); no new review
        // surface is introduced.
        $request->load('booking.customer', 'booking.service', 'booking.serviceVariant', 'booking.therapist.user');
        \Illuminate\Support\Facades\Notification::send(
            User::where('role', 'admin')->get(),
            new BookingNotification($request->booking, 'reschedule_countered')
        );

        return $request;
    }

    /**
     * D. Customer cancels the booking instead of accepting/countering —
     * reuses the exact refund/forfeit decision tree every other
     * cancellation path already goes through.
     *
     * @return array{booking: Booking, result: array}
     */
    public static function cancel(RescheduleProposal $proposal, User $customer, string $reason): array
    {
        [$lockedBooking, $result] = DB::transaction(function () use ($proposal, $customer, $reason) {
            $lockedProposal = self::lockPending($proposal);

            $lockedBooking = Booking::with(['service', 'customer'])
                ->where('id', $lockedProposal->booking_id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_if($lockedBooking->customer_id !== $customer->id, 403);

            $result = BookingCancellationService::cancel($lockedBooking, $reason);

            $lockedProposal->update([
                'status'       => 'cancelled',
                'responded_at' => now(),
            ]);

            RescheduleProposalResponded::dispatch(
                $lockedProposal->id,
                $lockedBooking->id,
                'cancelled',
                ['cancellation_type' => $result['cancellation_type']],
                request(),
            );

            return [$lockedBooking, $result];
        });

        // ── Post-commit notification ──────────────────────────────────────
        // Identical to DownpaymentController::cancel()'s existing
        // customer-initiated cancellation notification — no new type, no
        // new behaviour.
        $lockedBooking->customer->notify(new BookingNotification($lockedBooking, 'customer_cancelled'));

        return ['booking' => $lockedBooking, 'result' => $result];
    }

    // Locks the proposal row and asserts it is still an open, unexpired
    // pending proposal — guards against a double-click, a second customer
    // response racing the first, and an action landing after expiry.
    private static function lockPending(RescheduleProposal $proposal): RescheduleProposal
    {
        $locked = RescheduleProposal::where('id', $proposal->id)->lockForUpdate()->firstOrFail();

        abort_if($locked->status !== 'pending', 409, 'This proposal has already been resolved.');
        abort_if($locked->expires_at->isPast(), 409, 'This proposal has expired.');

        return $locked;
    }
}
