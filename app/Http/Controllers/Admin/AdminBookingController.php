<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

// Audit Events
use App\Events\Audit\BookingAccepted;
use App\Events\Audit\BookingRejected;
use App\Events\Audit\BookingCancelled;
use App\Events\Audit\RefundSent;
use App\Events\Audit\StaleBookingResolved;

// Services — same code paths the therapist/customer flows already use
use App\Services\BookingCompletionService;
use App\Services\BookingCancellationService;

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