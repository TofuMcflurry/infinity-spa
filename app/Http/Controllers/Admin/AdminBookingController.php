<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\RescheduleRequest;
use App\Models\RescheduleProposal;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

// Audit Events
use App\Events\Audit\BookingAccepted;
use App\Events\Audit\BookingRejected;
use App\Events\Audit\BookingCancelled;
use App\Events\Audit\BookingRescheduled;
use App\Events\Audit\RefundSent;
use App\Events\Audit\StaleBookingResolved;

// Services — same code paths the therapist/customer flows already use
use App\Services\BookingCompletionService;
use App\Services\BookingCancellationService;
use App\Services\BookingRescheduleService;
use App\Services\RescheduleProposalService;
use App\Notifications\BookingNotification;

class AdminBookingController extends Controller
{
    public function index()
    {
        return Inertia::render('Admin/BookingsManager');
    }

    public function allBookings()
    {
        $bookings = Booking::with(['service', 'serviceVariant', 'therapist.user', 'customer', 'resolvedBy'])
            ->orderByDesc('created_at')
            ->get()
            ->map(fn($b) => $this->formatBooking($b));

        return response()->json($bookings);
    }

    public function pendingRefunds()
    {
        $bookings = Booking::with(['service', 'serviceVariant', 'therapist.user', 'customer', 'resolvedBy'])
            ->where('status', 'cancelled')
            ->where('cancellation_type', 'refunded')
            ->where('downpayment_status', 'refunded')
            ->orderByDesc('cancelled_at')
            ->get()
            ->map(fn($b) => $this->formatBooking($b));

        return response()->json($bookings);
    }

    public function markRefundSent(Request $request)
    {
        $request->validate([
            'booking_id'     => 'required|exists:bookings,id',
            'bank_reference' => 'required|string|max:100',
        ]);

        $booking = Booking::with(['customer', 'service'])
            ->findOrFail($request->booking_id);

        abort_if(
            $booking->cancellation_type !== 'refunded' || $booking->downpayment_status !== 'refunded',
            422,
            'This booking is not eligible for refund processing.'
        );

        $booking->update([
            'downpayment_status' => 'refund_sent',
            'refund_reference'   => $request->bank_reference,
            'refund_sent_at'     => now(),
        ]);

        // ── Audit ──────────────────────────────────────────────────────────────
        RefundSent::dispatch(
            $booking->id,
            $request->bank_reference,
            $request,
        );

        return response()->json([
            'message' => 'Refund marked as sent.',
            'booking' => $this->formatBooking($booking->fresh(['service', 'serviceVariant', 'therapist.user', 'customer'])),
        ]);
    }

    // ── Admin Reschedule ───────────────────────────────────────────────────
    // Client may only send the new start time and an optional reason —
    // therapist_id/service_id/duration/travel time are never accepted from
    // the client; they're derived server-side from the booking's own
    // existing relations via BookingRescheduleService.
    public function reschedule(Request $request, Booking $booking)
    {
        $request->validate([
            'scheduled_start' => 'required|date|after:now',
            'reason'          => 'nullable|string|max:500',
        ]);

        $newStart = Carbon::parse($request->scheduled_start);

        // DB::transaction() only returns when the closure completes without
        // throwing — i.e. only after a successful commit. Any validation or
        // conflict failure inside BookingRescheduleService::reschedule()
        // throws, the transaction rolls back, and the exception propagates
        // straight out of this statement — so nothing below it (including
        // the notify() calls) ever runs for a failed reschedule.
        [$updated, $previousStart] = DB::transaction(function () use ($request, $booking, $newStart) {
            $locked = Booking::where('id', $booking->id)->lockForUpdate()->firstOrFail();

            // A pending Reschedule Proposal (admin → customer, awaiting their
            // response) must never be bypassed by a direct reschedule — the
            // customer is the only one who may resolve it (accept/counter/
            // cancel), via RescheduleProposalService. Two competing
            // rescheduling paths for the same booking is exactly what the
            // "one active reschedule item at a time" rule
            // (handoff §8.11 rule 12) exists to prevent.
            abort_if(
                RescheduleProposal::where('booking_id', $locked->id)->where('status', 'pending')->exists(),
                409,
                'Booking is awaiting customer response to a reschedule proposal.'
            );

            $previousStart = $locked->scheduled_start;
            $previousEnd   = $locked->scheduled_end;

            $updated = BookingRescheduleService::reschedule($locked, $newStart, $request->reason);

            $this->recordRescheduleAudit($updated, $previousStart, $previousEnd, $request->reason, $request);

            return [$updated, $previousStart];
        });

        // ── Post-commit notifications ────────────────────────────────────────
        $this->notifyRescheduled($updated, $previousStart);

        return response()->json([
            'message' => 'Booking rescheduled.',
            'booking' => $this->formatBooking(
                $updated->fresh(['service', 'serviceVariant', 'therapist.user', 'customer', 'resolvedBy'])
            ),
        ]);
    }

    // ── Admin Reschedule Proposal (admin → customer) ──────────────────────
    // Creates a PROPOSAL only — never mutates the booking. See
    // RescheduleProposalService for the full lifecycle; the booking only
    // ever actually moves once the customer accepts (or, for a countered
    // proposal, once the resulting request is approved through the
    // existing approveRescheduleRequest() below, unchanged).
    public function proposeReschedule(Request $request, Booking $booking)
    {
        $request->validate([
            'proposed_start_at' => 'required|date|after:now',
            'admin_reason'      => 'nullable|string|max:500',
        ]);

        $proposal = RescheduleProposalService::create(
            $booking,
            $request->user(),
            Carbon::parse($request->proposed_start_at),
            $request->admin_reason
        );

        return response()->json([
            'message'  => 'Reschedule proposal sent to the customer.',
            'proposal' => [
                'id'                => $proposal->id,
                'booking_id'        => $proposal->booking_id,
                'proposed_start_at' => $proposal->proposed_start_at->toIso8601String(),
                'status'            => $proposal->status,
                'admin_reason'      => $proposal->admin_reason,
                'expires_at'        => $proposal->expires_at->toIso8601String(),
            ],
        ], 201);
    }

    // ── Admin Reschedule Proposal queue (read-only) ───────────────────────
    // Lists proposals for the "Awaiting Customer" view — never mutates
    // anything; accept/counter/cancel are customer-only actions
    // (RescheduleProposalController), and there is deliberately no
    // admin-side "withdraw" action (handoff §8.4: "[Not on boards]").
    // Default status=pending so the queue only shows what's still awaiting
    // a response; ?status=accepted|countered|cancelled|expired|all for history.
    public function rescheduleProposals(Request $request)
    {
        $request->validate(['status' => 'nullable|in:pending,accepted,countered,cancelled,expired,all']);
        $status = $request->get('status', 'pending');

        $query = RescheduleProposal::with([
            'booking.service', 'booking.serviceVariant', 'booking.therapist.user',
            'booking.customer', 'booking.resolvedBy', 'proposedBy', 'counteredIntoRequest',
        ])->orderByDesc('created_at');

        if ($status !== 'all') {
            $query->where('status', $status);
        }

        return response()->json($query->get()->map(fn ($p) => $this->formatRescheduleProposal($p)));
    }

    private function formatRescheduleProposal(RescheduleProposal $p): array
    {
        return [
            'id'                         => $p->id,
            'status'                     => $p->status,
            'proposed_start_at'          => $p->proposed_start_at,
            'proposed_start_at_fmt'      => $p->proposed_start_at
                ?->timezone('Asia/Dubai')->format('M d, Y g:i A'),
            'admin_reason'               => $p->admin_reason,
            'customer_response_note'     => $p->customer_response_note,
            'expires_at'                 => $p->expires_at,
            'expires_at_fmt'             => $p->expires_at
                ?->timezone('Asia/Dubai')->format('M d, Y g:i A'),
            'responded_at'               => $p->responded_at,
            'proposed_by_name'           => $p->proposedBy?->name,
            'countered_into_request_id'  => $p->countered_into_request_id,
            'created_at'                 => $p->created_at,
            'created_at_fmt'             => $p->created_at->timezone('Asia/Dubai')->format('M d, Y g:i A'),
            'booking'                    => $p->booking ? $this->formatBooking($p->booking) : null,
        ];
    }

    // ── Admin Reschedule Request Review ───────────────────────────────────
    // Reviews a customer/therapist-submitted reschedule *preference* (see
    // RescheduleRequestService) — distinct from reschedule() above, which
    // the admin uses to move a booking directly with no prior request.
    // Both ultimately move the booking the same way, through
    // BookingRescheduleService::reschedule(), and both share the same
    // audit/notification helpers below.

    // Default status=pending so the admin's review queue only shows what
    // still needs a decision; ?status=approved|rejected|all for history.
    public function rescheduleRequests(Request $request)
    {
        $request->validate(['status' => 'nullable|in:pending,approved,rejected,all']);
        $status = $request->get('status', 'pending');

        $query = RescheduleRequest::with([
            'booking.service', 'booking.serviceVariant', 'booking.therapist.user',
            'booking.customer', 'booking.resolvedBy', 'requestedBy', 'reviewedBy',
            'counteredFromProposal',
        ])->orderByDesc('created_at');

        if ($status !== 'all') {
            $query->where('status', $status);
        }

        return response()->json($query->get()->map(fn ($r) => $this->formatRescheduleRequest($r)));
    }

    // The admin is choosing the FINAL schedule — it may equal the
    // requester's requested_start_at or be a different valid time
    // (requested_start_at is preserved unchanged either way). Client may
    // only send the final time and admin notes; booking_id, requester
    // identity, status, therapist_id, duration, and the other derived
    // schedule fields are never accepted from the client — they come from
    // the request's own booking relation and BookingRescheduleService.
    public function approveRescheduleRequest(Request $request, RescheduleRequest $reschedule_request)
    {
        $request->validate([
            'final_scheduled_start' => 'required|date|after:now',
            'admin_notes'           => 'nullable|string|max:500',
        ]);

        $finalStart = Carbon::parse($request->final_scheduled_start);

        [$updated, $previousStart] = DB::transaction(function () use ($request, $reschedule_request, $finalStart) {
            // Locking the request row first means a second concurrent
            // approve/reject on the SAME request blocks here, then — once
            // the first commits — finds status no longer 'pending' and
            // aborts, so exactly one terminal decision can ever win.
            $lockedRequest = RescheduleRequest::where('id', $reschedule_request->id)->lockForUpdate()->firstOrFail();

            abort_if($lockedRequest->status !== 'pending', 409, 'This request has already been resolved.');

            $lockedBooking = Booking::where('id', $lockedRequest->booking_id)->lockForUpdate()->firstOrFail();

            $previousStart = $lockedBooking->scheduled_start;
            $previousEnd   = $lockedBooking->scheduled_end;

            // Re-validates against the booking's CURRENT state — day-off,
            // shift, unavailable slots, conflicts (self-excluded) — never
            // trusting whatever was true when the request was submitted.
            $updated = BookingRescheduleService::reschedule($lockedBooking, $finalStart, $request->admin_notes);

            $this->recordRescheduleAudit($updated, $previousStart, $previousEnd, $request->admin_notes, $request);

            $lockedRequest->update([
                'status'              => 'approved',
                'resolved_start_at'   => $finalStart,
                'reviewed_at'         => now(),
                'reviewed_by_user_id' => $request->user()->id,
                'admin_notes'         => $request->admin_notes,
            ]);

            return [$updated, $previousStart];
        });

        // ── Post-commit notifications ────────────────────────────────────────
        $this->notifyRescheduled($updated, $previousStart);

        return response()->json([
            'message' => 'Reschedule request approved.',
            'request' => $this->formatRescheduleRequest($this->freshRescheduleRequest($reschedule_request)),
        ]);
    }

    // Rejecting a request never touches the booking — no schedule change,
    // no BookingRescheduled audit event, no 'rescheduled' notification.
    public function rejectRescheduleRequest(Request $request, RescheduleRequest $reschedule_request)
    {
        $request->validate(['admin_notes' => 'nullable|string|max:500']);

        $locked = DB::transaction(function () use ($request, $reschedule_request) {
            $lockedRequest = RescheduleRequest::where('id', $reschedule_request->id)->lockForUpdate()->firstOrFail();

            abort_if($lockedRequest->status !== 'pending', 409, 'This request has already been resolved.');

            $lockedRequest->update([
                'status'              => 'rejected',
                'reviewed_at'         => now(),
                'reviewed_by_user_id' => $request->user()->id,
                'admin_notes'         => $request->admin_notes,
            ]);

            return $lockedRequest;
        });

        return response()->json([
            'message' => 'Reschedule request rejected.',
            'request' => $this->formatRescheduleRequest($this->freshRescheduleRequest($locked)),
        ]);
    }

    private function freshRescheduleRequest(RescheduleRequest $r): RescheduleRequest
    {
        return $r->fresh([
            'booking.service', 'booking.serviceVariant', 'booking.therapist.user',
            'booking.customer', 'booking.resolvedBy', 'requestedBy', 'reviewedBy',
            'counteredFromProposal',
        ]);
    }

    // Records the BookingRescheduled audit event — shared by a direct
    // admin reschedule() and an approved reschedule request, so the audit
    // trail looks identical either way.
    private function recordRescheduleAudit(
        Booking  $updated,
        ?Carbon  $previousStart,
        ?Carbon  $previousEnd,
        ?string  $reason,
        Request  $request
    ): void {
        BookingRescheduled::dispatch(
            $updated->id,
            $previousStart?->toDateTimeString(),
            $previousEnd?->toDateTimeString(),
            $updated->scheduled_start->toDateTimeString(),
            $updated->scheduled_end->toDateTimeString(),
            $reason,
            $request,
        );
    }

    // Post-commit only — never call this before the transaction that moved
    // the booking has committed. Exactly one notify() per recipient, each
    // fanning out to both the database and mail channels via
    // BookingNotification's own via().
    private function notifyRescheduled(Booking $updated, ?Carbon $previousStart): void
    {
        $updated->load('customer', 'service', 'serviceVariant', 'therapist.user');

        if ($updated->customer) {
            $updated->customer->notify(new BookingNotification($updated, 'rescheduled', $previousStart));
        }
        $updated->therapist->user->notify(new BookingNotification($updated, 'rescheduled', $previousStart));
    }

    private function formatRescheduleRequest(RescheduleRequest $r): array
    {
        return [
            'id'                     => $r->id,
            'status'                 => $r->status,
            'requested_by_role'      => $r->requested_by_role,
            'requested_by_name'      => $r->requestedBy?->name,
            'requested_start_at'     => $r->requested_start_at,
            'requested_start_at_fmt' => $r->requested_start_at
                ? Carbon::parse($r->requested_start_at)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                : null,
            'reason'                 => $r->reason,
            'admin_notes'            => $r->admin_notes,
            'resolved_start_at'      => $r->resolved_start_at,
            'resolved_start_at_fmt'  => $r->resolved_start_at
                ? Carbon::parse($r->resolved_start_at)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                : null,
            'reviewed_at'            => $r->reviewed_at,
            'reviewed_by_name'       => $r->reviewedBy?->name,
            'created_at'             => $r->created_at,
            'created_at_fmt'         => $r->created_at->timezone('Asia/Dubai')->format('M d, Y g:i A'),
            'booking'                => $r->booking ? $this->formatBooking($r->booking) : null,
            // Set only when this request exists because a customer
            // countered a Reschedule Proposal — drives the "Countered
            // Proposal" tag (handoff §8.8). No second review surface: the
            // request itself is still reviewed exactly as any other.
            'countered_from_proposal' => $r->counteredFromProposal ? [
                'id'                    => $r->counteredFromProposal->id,
                'proposed_start_at_fmt' => $r->counteredFromProposal->proposed_start_at
                    ?->timezone('Asia/Dubai')->format('M d, Y g:i A'),
            ] : null,
        ];
    }

    // Read-only — drives the reschedule UI's date/time pickers. Never
    // mutates, never locks, never dispatches audit/notification events.
    // Reuses BookingRescheduleService::previewAvailability() so the UI
    // can only ever offer a time the POST /reschedule endpoint above
    // would actually accept.
    public function rescheduleAvailability(Request $request, Booking $booking)
    {
        $request->validate(['date' => 'nullable|date']);

        return response()->json(
            BookingRescheduleService::previewAvailability($booking, $request->date)
        );
    }

    // ── Stale Active Session review ──────────────────────────────────────────
    public function staleBookings()
    {
        $bookings = Booking::with(['service', 'serviceVariant', 'therapist.user', 'customer', 'resolvedBy'])
            ->whereNotNull('flagged_at')
            ->whereNull('resolved_at')
            ->orderBy('flagged_at')
            ->get()
            ->map(fn($b) => $this->formatBooking($b));

        return response()->json($bookings);
    }

    public function resolveStaleComplete(Request $request, Booking $booking)
    {
        return DB::transaction(function () use ($request, $booking) {
            $locked = $this->lockStaleBooking($booking->id);

            $previousStatus = $locked->status;

            BookingCompletionService::complete($locked);
            $this->markResolved($locked, $request);

            StaleBookingResolved::dispatch($locked->id, 'completed', $previousStatus, auth()->id(), $request);

            return response()->json([
                'message' => 'Booking marked completed and resolved.',
                'booking' => $this->formatBooking($locked->fresh(['service', 'serviceVariant', 'therapist.user', 'customer', 'resolvedBy'])),
            ]);
        });
    }

    public function resolveStaleNoShow(Request $request, Booking $booking)
    {
        return DB::transaction(function () use ($request, $booking) {
            $locked = $this->lockStaleBooking($booking->id);

            $previousStatus = $locked->status;

            BookingCancellationService::cancel(
                $locked,
                "No-show — session was stuck in \"{$previousStatus}\" and resolved by admin.",
                'no_show'
            );
            $this->markResolved($locked, $request);

            StaleBookingResolved::dispatch($locked->id, 'no_show', $previousStatus, auth()->id(), $request);

            return response()->json([
                'message' => 'Booking marked as no-show and resolved.',
                'booking' => $this->formatBooking($locked->fresh(['service', 'serviceVariant', 'therapist.user', 'customer', 'resolvedBy'])),
            ]);
        });
    }

    public function resolveStaleCancel(Request $request, Booking $booking)
    {
        $request->validate(['reason' => 'required|string|max:500']);

        return DB::transaction(function () use ($request, $booking) {
            $locked = $this->lockStaleBooking($booking->id);

            $previousStatus = $locked->status;

            BookingCancellationService::cancel($locked, $request->reason);
            $this->markResolved($locked, $request);

            StaleBookingResolved::dispatch($locked->id, 'cancelled', $previousStatus, auth()->id(), $request);

            return response()->json([
                'message' => 'Booking cancelled and resolved.',
                'booking' => $this->formatBooking($locked->fresh(['service', 'serviceVariant', 'therapist.user', 'customer', 'resolvedBy'])),
            ]);
        });
    }

    // Row-locks the booking and asserts it's still an open, active stale flag —
    // guards against a double-click or two admins resolving the same booking
    // at once (the second request blocks on the lock, then finds resolved_at
    // already set and aborts) and against the booking having moved on since
    // it was flagged (e.g. the therapist completed it independently).
    private function lockStaleBooking(int $bookingId): Booking
    {
        $locked = Booking::where('id', $bookingId)->lockForUpdate()->firstOrFail();

        abort_if(
            is_null($locked->flagged_at) || !is_null($locked->resolved_at),
            409,
            'This booking is not an open stale flag.'
        );
        abort_if(
            !in_array($locked->status, ['accepted', 'en_route', 'arrived']),
            422,
            'Booking is no longer in an active session state.'
        );

        return $locked;
    }

    private function markResolved(Booking $booking, Request $request): void
    {
        $booking->update([
            'resolved_at' => now(),
            'resolved_by' => $request->user()->id,
        ]);
    }

    public function cancelledHistory()
    {
        $bookings = Booking::with(['service', 'serviceVariant', 'therapist.user', 'customer', 'resolvedBy'])
            ->where('status', 'cancelled')
            ->whereNotNull('cancellation_type')
            ->orderByDesc('cancelled_at')
            ->get()
            ->map(fn($b) => $this->formatBooking($b));

        return response()->json($bookings);
    }

    public function stats()
    {
        $today = Carbon::today('Asia/Dubai');

        return response()->json([
            'total_bookings'       => Booking::count(),
            'pending_verification' => Booking::where('downpayment_status', 'submitted')->count(),
            'pending_refunds'      => Booking::where('status', 'cancelled')
                                             ->where('cancellation_type', 'refunded')
                                             ->where('downpayment_status', 'refunded')
                                             ->count(),
            'active_today'         => Booking::whereIn('status', ['accepted', 'en_route', 'arrived'])
                                             ->whereDate('scheduled_start', $today)
                                             ->count(),
            'completed_today'      => Booking::where('status', 'completed')
                                             ->whereDate('scheduled_start', $today)
                                             ->count(),
            'revenue_today'        => Booking::where('status', 'completed')
                                             ->whereDate('scheduled_start', $today)
                                             ->join('services', 'bookings.service_id', '=', 'services.id')
                                             ->sum('services.price'),
        ]);
    }

    private function formatBooking(Booking $b): array
    {
        return [
            'id'                       => $b->id,
            'ref'                      => 'IHS-' . str_pad($b->id, 5, '0', STR_PAD_LEFT),
            'customer_name'            => $b->customer?->name,
            'customer_email'           => $b->customer?->email,
            'customer_phone'           => $b->customer?->phone,
            'therapist_name'           => $b->therapist?->user?->name,
            'service_name'             => $b->service?->name,
            // service.price is a legacy pre-variant-refactor column, null on any
            // variant-based booking — serviceVariant.price is the real source.
            'service_price'            => $b->serviceVariant?->price ?? $b->service?->price,
            'status'                   => $b->status,
            'payment_method'           => $b->payment_method,
            'location'                 => $b->location,
            'zone_name'                => $b->zone_name,
            'scheduled_start'          => $b->scheduled_start,
            'scheduled_start_fmt'      => $b->scheduled_start
                ? Carbon::parse($b->scheduled_start)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                : null,
            'scheduled_end'            => $b->scheduled_end,
            'scheduled_end_fmt'        => $b->scheduled_end
                ? Carbon::parse($b->scheduled_end)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                : null,
            'downpayment_amount'       => $b->downpayment_amount,
            'remaining_amount'         => $b->remaining_amount,
            'downpayment_status'       => $b->downpayment_status,
            'payment_type'             => $b->payment_type,
            'payment_status'           => $b->payment_status,
            'is_voucher_covered'       => $b->is_voucher_covered,
            'voucher_code'             => $b->voucher_code,
            'downpayment_proof'        => $b->downpayment_proof,
            'downpayment_submitted_at' => $b->downpayment_submitted_at
                ? Carbon::parse($b->downpayment_submitted_at)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                : null,
            'downpayment_verified_at'  => $b->downpayment_verified_at
                ? Carbon::parse($b->downpayment_verified_at)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                : null,
            'cancellation_type'        => $b->cancellation_type,
            'cancellation_reason'      => $b->cancellation_reason,
            'cancelled_at'             => $b->cancelled_at
                ? Carbon::parse($b->cancelled_at)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                : null,
            'refund_reference'         => $b->refund_reference,
            'refund_sent_at'           => $b->refund_sent_at
                ? Carbon::parse($b->refund_sent_at)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                : null,
            'created_at'               => Carbon::parse($b->created_at)->timezone('Asia/Dubai')->format('M d, Y g:i A'),
            // A genuine ISO-8601 instant (unlike the human-formatted field
            // above) — the "New Bookings" panel diffs this against the
            // browser's own clock to show waiting time, which only gives a
            // correct result when the timestamp carries its own offset.
            'created_at_iso'           => $b->created_at?->toIso8601String(),
            // ── Stale Active Session flag ──────────────────────────────────────
            'flagged_at'               => $b->flagged_at,
            'flagged_at_fmt'           => $b->flagged_at
                ? Carbon::parse($b->flagged_at)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                : null,
            'flag_reason'              => $b->flag_reason,
            'is_stale_unresolved'      => $b->flagged_at !== null && $b->resolved_at === null,
            'resolved_at'              => $b->resolved_at,
            'resolved_by_name'         => $b->resolvedBy?->name,
        ];
    }
}