<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\RescheduleRequest;
use App\Models\RestDayRequest;
use App\Models\TherapistUnavailableSlot;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class TherapistScheduleController extends Controller
{
    public function index(): InertiaResponse
    {
        return Inertia::render('Therapist/Schedule');
    }

    // GET /therapist/api/schedule?week_start=YYYY-MM-DD
    public function schedule(Request $request): JsonResponse
    {
        $therapist   = auth()->user()->therapist;
        $weekStart   = $request->get('week_start', Carbon::now()->startOfWeek(Carbon::MONDAY)->toDateString());
        $weekEnd     = Carbon::parse($weekStart)->addDays(6)->toDateString();
        $userId      = auth()->id();

        $bookings = Booking::with(['service', 'customer'])
            ->where('therapist_id', $therapist->id)
            ->whereBetween('scheduled_start', [
                Carbon::parse($weekStart)->startOfDay(),
                Carbon::parse($weekEnd)->endOfDay(),
            ])
            ->whereNotIn('status', ['rejected', 'cancelled'])
            ->get()
            ->map(fn($b) => [
                'id'            => $b->id,
                'customer_name' => $b->customer?->name ?? ($b->guest_name ?? 'Guest'),
                'service_name'  => $b->service->name,
                'location'      => $b->location,
                'date'          => Carbon::parse($b->scheduled_start)->toDateString(),
                'start_time'    => Carbon::parse($b->scheduled_start)->format('H:i'),
                'end_time'      => Carbon::parse($b->scheduled_end)->format('H:i'),
                'duration'      => $b->service->duration_minutes,
                'status'        => $b->status,
            ]);

        $unavailableSlots = TherapistUnavailableSlot::where('therapist_id', $userId)
            ->whereBetween('date', [$weekStart, $weekEnd])
            ->get(['id', 'date', 'start_time', 'end_time', 'is_full_day', 'reason'])
            ->map(fn($s) => [
                'id'         => $s->id,
                'date'       => Carbon::parse($s->date)->toDateString(),
                'start_time' => $s->start_time,
                'end_time'   => $s->end_time,
                'is_full_day'=> $s->is_full_day,
                'reason'     => $s->reason,
            ]);

        $restDayRequests = RestDayRequest::where('therapist_id', $userId)
            ->orderByDesc('requested_date')
            ->get(['id', 'requested_date', 'reason', 'status', 'admin_notes'])
            ->map(fn($r) => [
                'id'             => $r->id,
                'requested_date' => Carbon::parse($r->requested_date)->toDateString(),
                'reason'         => $r->reason,
                'status'         => $r->status,
                'admin_notes'    => $r->admin_notes,
            ]);

        return response()->json([
            'week_start'        => $weekStart,
            'week_end'          => $weekEnd,
            'bookings'          => $bookings,
            'unavailable_slots' => $unavailableSlots,
            'rest_day_requests' => $restDayRequests,
        ]);
    }

    // POST /therapist/api/unavailable
    public function storeUnavailable(Request $request): JsonResponse
    {
        $request->validate([
            'date'        => 'required|date|after_or_equal:today',
            'is_full_day' => 'boolean',
            'start_time'  => 'required_if:is_full_day,false|nullable|date_format:H:i',
            'end_time'    => 'required_if:is_full_day,false|nullable|date_format:H:i',
            'reason'      => 'nullable|string|max:255',
        ]);

        $slot = TherapistUnavailableSlot::create([
            'therapist_id' => auth()->id(),
            'date'         => $request->date,
            'start_time'   => $request->boolean('is_full_day') ? null : $request->start_time,
            'end_time'     => $request->boolean('is_full_day') ? null : $request->end_time,
            'is_full_day'  => $request->boolean('is_full_day'),
            'reason'       => $request->reason,
        ]);

        return response()->json([
            'message' => 'Slot marked as unavailable.',
            'slot'    => [
                'id'         => $slot->id,
                'date'       => Carbon::parse($slot->date)->toDateString(),
                'start_time' => $slot->start_time,
                'end_time'   => $slot->end_time,
                'is_full_day'=> $slot->is_full_day,
                'reason'     => $slot->reason,
            ],
        ], 201);
    }

    // DELETE /therapist/api/unavailable/{slot}
    public function destroyUnavailable(TherapistUnavailableSlot $slot): JsonResponse
    {
        abort_if($slot->therapist_id !== auth()->id(), 403);
        $slot->delete();
        return response()->json(['message' => 'Unavailable slot removed.']);
    }

    // POST /therapist/api/reschedule-request
    public function storeRescheduleRequest(Request $request): JsonResponse
    {
        $request->validate([
            'booking_id'     => 'required|exists:bookings,id',
            'requested_date' => 'required|date|after:today',
            'requested_time' => 'required|date_format:H:i',
            'reason'         => 'nullable|string|max:500',
        ]);

        $booking   = Booking::findOrFail($request->booking_id);
        $therapist = auth()->user()->therapist;
        abort_if($booking->therapist_id !== $therapist->id, 403);

        // Prevent duplicate pending request for same booking
        $existing = RescheduleRequest::where('booking_id', $request->booking_id)
            ->where('status', 'pending')
            ->exists();

        if ($existing) {
            return response()->json(['message' => 'A pending reschedule request already exists for this booking.'], 409);
        }

        $reschedule = RescheduleRequest::create([
            'booking_id'     => $request->booking_id,
            'therapist_id'   => auth()->id(),
            'requested_date' => $request->requested_date,
            'requested_time' => $request->requested_time,
            'reason'         => $request->reason,
        ]);

        return response()->json(['message' => 'Reschedule request submitted. Awaiting admin approval.', 'id' => $reschedule->id], 201);
    }

    // POST /therapist/api/rest-day-request
    public function storeRestDayRequest(Request $request): JsonResponse
    {
        $request->validate([
            'requested_date' => 'required|date|after:today',
            'reason'         => 'required|string|max:500',
        ]);

        // Reject if Tuesday (automatic rest day)
        $dayOfWeek = Carbon::parse($request->requested_date)->dayOfWeek;
        if ($dayOfWeek === Carbon::TUESDAY) {
            return response()->json(['message' => 'Tuesday is already a rest day.'], 422);
        }

        $existing = RestDayRequest::where('therapist_id', auth()->id())
            ->where('requested_date', $request->requested_date)
            ->where('status', 'pending')
            ->exists();

        if ($existing) {
            return response()->json(['message' => 'You already have a pending request for this date.'], 409);
        }

        $restDay = RestDayRequest::create([
            'therapist_id'   => auth()->id(),
            'requested_date' => $request->requested_date,
            'reason'         => $request->reason,
        ]);

        return response()->json(['message' => 'Rest day request submitted.', 'id' => $restDay->id], 201);
    }

    // GET /therapist/api/rest-day-requests
    public function restDayRequests(): JsonResponse
    {
        $requests = RestDayRequest::where('therapist_id', auth()->id())
            ->orderByDesc('requested_date')
            ->get(['id', 'requested_date', 'reason', 'status', 'admin_notes'])
            ->map(fn($r) => [
                'id'             => $r->id,
                'requested_date' => Carbon::parse($r->requested_date)->toDateString(),
                'reason'         => $r->reason,
                'status'         => $r->status,
                'admin_notes'    => $r->admin_notes,
            ]);

        return response()->json($requests);
    }
}

