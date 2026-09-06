<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class BookingController extends Controller
{
    // ── Step 1: Get all active services ──────────────────────────────────────
    public function getServices()
    {
        $services = Service::where('is_active', true)
            ->with(['variants' => fn($q) => $q->where('is_active', true)->orderBy('duration_minutes')])
            ->orderBy('group_name')
            ->get();

        $grouped = $services->groupBy('group_name')->map(function ($items, $groupName) {
            $first    = $items->first();
            $variants = $items->flatMap->variants;

            return [
                'group_name'    => $groupName,
                'group_name_ar' => $first->group_name_ar,
                'category'      => $first->category,
                'min_price'     => $variants->min('price'),
                'durations'     => $variants->map(fn($v) => [
                    'id'               => $v->id,
                    'service_id'       => $v->service_id,
                    'duration_minutes' => $v->duration_minutes,
                    'price'            => $v->price,
                    'rating'           => $first->rating,
                    'description'      => $first->description,
                ])->values(),
            ];
        })->values();

        return response()->json($grouped);
    }

    // ── Step 2: Get all active therapists ─────────────────────────────────────
    public function getTherapists()
    {
        $therapists = Therapist::with(['user', 'zones'])
            ->where('is_active', true)
            ->orderByDesc('rating')
            ->get()
            ->map(function ($t) {
                $reviewCount = \App\Models\Review::where('therapist_id', $t->id)
                    ->where('is_visible', true)
                    ->whereNotNull('therapist_rating')
                    ->count();

                return [
                    'id'               => $t->id,
                    'name'             => $t->user->name,
                    'specialty'        => $t->specialty,
                    'bio'              => $t->bio,
                    'rating'           => $t->rating,
                    'review_count'     => $reviewCount,
                    'experience_years' => $t->experience_years,
                    'gender'           => $t->gender,
                    'day_off'          => $t->day_off,
                    'shift_start'      => Carbon::parse($t->shift_start)->format('g:i A'),
                    'shift_end'        => Carbon::parse($t->shift_end)->format('g:i A'),
                    'zones'            => $t->zones->pluck('zone_name')->toArray(),
                    'avatar'           => strtoupper(substr($t->user->name, 0, 1))
                                         . strtoupper(substr(explode(' ', $t->user->name)[1] ?? '', 0, 1)),
                ];
            });

        return response()->json($therapists);
    }

    // ── Step 4: Get available time slots ─────────────────────────────────────
    public function getAvailableSlots(Request $request)
    {
        $request->validate([
            'service_id'   => 'required|exists:service_variants,id',
            'zone_name'    => 'required|string',
            'date'         => 'required|date',
            'therapist_id' => 'nullable|exists:therapists,id',
        ]);

        $variant     = ServiceVariant::findOrFail($request->service_id);
        $date        = $request->date;
        $zoneName    = $request->zone_name;
        $therapistId = $request->therapist_id;
        $customerId  = auth()->id();

        // ── Day-off check ─────────────────────────────────────────────────────
        $dayName = Carbon::parse($date, 'Asia/Dubai')->format('l');

        if ($therapistId) {
            $therapist = Therapist::findOrFail($therapistId);
            if ($therapist->day_off === $dayName) {
                return response()->json([
                    'day_off' => true,
                    'message' => "{$therapist->user->name} is off on {$dayName}s.",
                    'slots'   => [],
                ]);
            }
        } else {
            $anyAvailable = Therapist::where('is_active', true)
                ->where('day_off', '!=', $dayName)
                ->whereHas('zones', fn($q) => $q->where('zone_name', $zoneName))
                ->exists();

            if (!$anyAvailable) {
                return response()->json([
                    'day_off' => true,
                    'message' => 'No therapists available on ' . $dayName . 's.',
                    'slots'   => [],
                ]);
            }
        }

        // ── Generate valid time slots ─────────────────────────────────────────
        $shiftStart    = Carbon::parse($date . ' 16:00:00');
        $shiftEnd      = Carbon::parse($date . ' 04:00:00')->addDay();
        $maxBuffer     = 30;
        $lastValidTime = $shiftEnd->copy()->subMinutes($variant->duration_minutes + $maxBuffer);

        // ── Pre-fetch ONCE before loop ────────────────────────────────────────
        $travelMinutes = $therapistId
            ? Therapist::findOrFail($therapistId)->getTravelTime($zoneName)
            : 0;

        // Pre-fetch ALL customer active bookings ONCE (not inside loop)
        $customerBookings = $customerId
            ? Booking::where('customer_id', $customerId)
                ->whereIn('status', ['pending_payment', 'pending', 'accepted'])
                ->whereNotNull('scheduled_start')
                ->whereNotNull('scheduled_end')
                ->get(['scheduled_start', 'scheduled_end'])
            : collect();

        $slots   = [];
        $current = $shiftStart->copy();

        while ($current->lessThanOrEqualTo($lastValidTime)) {
            $slotDateTime = Carbon::parse($date . ' ' . $current->format('H:i:s'));

            if ($current->format('H') < 16) {
                $slotDateTime->addDay();
            }

            if ($therapistId) {
                $slotResult = $this->getTherapistSlotStatus(
                    $therapistId,
                    $slotDateTime,
                    $variant->duration_minutes,
                    $zoneName
                );

                // ── FIX 3: Check customer conflict using pre-fetched bookings ──
                if ($slotResult['available']) {
                    $thisBlocks = Booking::computeTimeBlocks(
                        $slotDateTime->toDateTimeString(),
                        $variant->duration_minutes,
                        $travelMinutes
                    );

                    // Customer-side conflict: compare only the actual session
                    // window (scheduled_start/scheduled_end) — no therapist
                    // travel/rest buffer applies to the customer's own schedule.
                    $customerConflict = $customerBookings->contains(function ($b) use ($slotDateTime, $thisBlocks) {
                        return Carbon::parse($b->scheduled_start)->lt($thisBlocks['scheduled_end'])
                            && Carbon::parse($b->scheduled_end)->gt($slotDateTime);
                    });

                    if ($customerConflict) {
                        $slotResult = ['available' => false, 'reason' => 'customer_conflict'];
                    }
                }
            } else {
                $isAvail    = $this->hasAvailableTherapist(
                    $slotDateTime,
                    $variant->duration_minutes,
                    $zoneName,
                    $dayName
                );
                $slotResult = ['available' => $isAvail, 'reason' => $isAvail ? null : 'booked'];
            }

            $slots[] = [
                'time'      => $slotDateTime->format('H:i'),
                'datetime'  => $slotDateTime->toDateTimeString(),
                'label'     => $slotDateTime->format('g:i A'),
                'available' => $slotResult['available'],
                'reason'    => $slotResult['reason'],
            ];

            $current->addMinutes(30);
        }

        return response()->json([
            'day_off' => false,
            'slots'   => $slots,
        ]);
    }

    // ── Step 5: Store booking ─────────────────────────────────────────────────
    public function store(Request $request)
    {
        $request->validate([
            'service_id'     => 'required|exists:service_variants,id',
            'therapist_id'   => 'required|exists:therapists,id',
            'zone_name'      => 'required|string',
            'location'       => 'required|string',
            'datetime'       => 'required|string',
            'payment_type'   => 'nullable|in:downpayment,full',
            'payment_method' => [
                Rule::requiredIf(fn () =>
                    !$request->boolean('is_voucher_covered')
                    && $request->input('payment_type', 'downpayment') !== 'full'
                ),
                'nullable',
                'in:cash,cashless',
            ],
            'voucher_code'       => 'nullable|string',
            'is_voucher_covered' => 'nullable|boolean',
        ]);

        $variant   = ServiceVariant::findOrFail($request->service_id);
        $therapist = Therapist::findOrFail($request->therapist_id);

        $isVoucherCovered = $request->boolean('is_voucher_covered');

        $downpaymentAmount = $isVoucherCovered ? 0 : round($variant->price * 0.20, 2);
        $remainingAmount   = $isVoucherCovered ? 0 : round($variant->price * 0.80, 2);

        $slotDatetime  = Carbon::parse($request->datetime);
        $travelMinutes = $therapist->getTravelTime($request->zone_name);
        $timeBlocks    = Booking::computeTimeBlocks(
            $slotDatetime->toDateTimeString(),
            $variant->duration_minutes,
            $travelMinutes
        );

        // ── FIX 3: Customer double booking prevention ─────────────────────────
        // Customer-side conflict only cares about the actual session window
        // (scheduled_start/scheduled_end) — the therapist travel/rest buffer
        // is not the customer's concern, so back-to-back bookings are fine.
        $customerConflict = auth()->id()
            ? Booking::where('customer_id', auth()->id())
                ->whereIn('status', ['pending_payment', 'pending', 'accepted'])
                ->whereNotNull('scheduled_start')
                ->whereNotNull('scheduled_end')
                ->where('scheduled_start', '<', $timeBlocks['scheduled_end'])
                ->where('scheduled_end',   '>', $slotDatetime)
                ->exists()
            : false;

        if ($customerConflict) {
            return response()->json([
                'message' => 'You already have a booking at this time. Please choose a different time slot.',
            ], 409);
        }

        // ── Therapist conflict check ──────────────────────────────────────────
        if ($this->hasConflict(
            $therapist->id,
            $timeBlocks['travel_start'],
            $timeBlocks['buffer_end']
        )) {
            return response()->json([
                'message' => 'Sorry, this slot is no longer available.',
            ], 409);
        }

        $booking = Booking::create([
            'customer_id'        => auth()->id(),
            'therapist_id'       => $request->therapist_id,
            'service_id'         => $variant->service_id,
            'service_variant_id' => $variant->id,
            'location'           => $request->location,
            'zone_name'          => $request->zone_name,
            'scheduled_start'    => $slotDatetime,
            'scheduled_end'      => $timeBlocks['scheduled_end'],
            'travel_start'       => $timeBlocks['travel_start'],
            'buffer_end'         => $timeBlocks['buffer_end'],
            'payment_method'     => $request->payment_method ?? ($isVoucherCovered ? 'cash' : null),
            // A voucher-covered booking has nothing to pay via Stripe, so it
            // skips 'pending_payment' and is marked paid/accepted immediately —
            // the same end state the Stripe webhook reaches for a paid booking.
            'status'             => $isVoucherCovered ? 'accepted' : 'pending_payment',
            'downpayment_amount' => $downpaymentAmount,
            'remaining_amount'   => $remainingAmount,
            'downpayment_status' => 'pending',
            'payment_status'     => $isVoucherCovered ? 'paid' : 'pending',
            'paid_amount'        => $isVoucherCovered ? 0 : null,
            'voucher_code'       => $request->voucher_code,
            'is_voucher_covered' => $isVoucherCovered,
        ]);

        return response()->json([
            'message' => 'Booking submitted!',
            'booking' => $booking->load('service', 'serviceVariant', 'therapist.user'),
        ], 201);
    }

    // ── Payment status (polled by PaymentSuccess page after Stripe redirect) ──
    public function paymentStatus(Booking $booking)
    {
        if (auth()->id() !== $booking->customer_id) {
            abort(403);
        }

        $booking->load('service', 'serviceVariant', 'therapist.user');

        $scheduledStart = Carbon::parse($booking->scheduled_start)->timezone('Asia/Dubai');

        return response()->json([
            'id'                 => $booking->id,
            'status'             => $booking->status,
            'payment_status'     => $booking->payment_status,
            'payment_type'       => $booking->payment_type,
            'paid_amount'        => $booking->paid_amount,
            'downpayment_amount' => $booking->downpayment_amount,
            'remaining_amount'   => $booking->remaining_amount,
            'is_voucher_covered' => $booking->is_voucher_covered,
            'voucher_code'       => $booking->voucher_code,
            'service_name'       => trim($booking->service->group_name . ' ' . ($booking->serviceVariant->duration_minutes ?? '') . ' min'),
            'therapist_name'     => $booking->therapist?->user?->name,
            'location'           => $booking->location,
            'date_formatted'     => $scheduledStart->format('l, d F Y'),
            'time_formatted'     => $scheduledStart->format('g:i A'),
        ]);
    }

    // ── My Bookings ───────────────────────────────────────────────────────────
    public function myBookings()
    {
        $customerId = auth()->id();

        $bookings = Booking::with(['service', 'serviceVariant', 'therapist.user'])
            ->where('customer_id', $customerId)
            ->orderByDesc('scheduled_start')
            ->get()
            ->map(fn($b) => [
                'id'               => $b->id,
                'service'          => $b->service->name,
                'service_id'       => $b->service_id,
                'therapist'        => $b->therapist?->user?->name,
                'therapist_id'     => $b->therapist_id,
                'therapist_avatar' => $b->therapist?->user
                    ? strtoupper(substr($b->therapist->user->name, 0, 1))
                    . strtoupper(substr(explode(' ', $b->therapist->user->name)[1] ?? '', 0, 1))
                    : '?',
                'date'             => Carbon::parse($b->scheduled_start)->timezone('Asia/Dubai')->format('l, d F Y'),
                'date_short'       => Carbon::parse($b->scheduled_start)->timezone('Asia/Dubai')->format('M d, Y'),
                'time'             => Carbon::parse($b->scheduled_start)->timezone('Asia/Dubai')->format('g:i A'),
                'time_end'         => Carbon::parse($b->scheduled_end)->timezone('Asia/Dubai')->format('g:i A'),
                'duration'         => $b->serviceVariant->duration_minutes ?? $b->service->duration_minutes,
                'price'            => $b->serviceVariant->price ?? $b->service->price,
                'location'         => $b->location,
                'zone_name'        => $b->zone_name,
                'payment_method'   => $b->payment_method,
                'status'           => $b->status,
                'rejection_reason' => $b->rejection_reason,
                'can_review'       => $this->canReview($b, $customerId),
                'hours_until_session' => now('Asia/Dubai')
                    ->diffInHours(Carbon::parse($b->scheduled_start)->timezone('Asia/Dubai'), false),
                'hours_until_session' => Carbon::parse($b->scheduled_start)
                    ->timezone('Asia/Dubai')
                    ->diffInHours(now('Asia/Dubai'), false), 
                'cancellation_reason' => $b->cancellation_reason, // ← idagdag ito
                'downpayment_amount'  => $b->downpayment_amount,
                'remaining_amount'    => $b->remaining_amount,
                'downpayment_status'  => $b->downpayment_status,
                'downpayment_proof'   => $b->downpayment_proof,
                'is_voucher_covered'  => $b->is_voucher_covered,
                'voucher_code'        => $b->voucher_code,
                'cancellation_type'   => $b->cancellation_type,
                'cancelled_at'        => $b->cancelled_at
                    ? Carbon::parse($b->cancelled_at)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                    : null,
            ]);

        return response()->json([
            // FIX 1: Show pending_payment in pending tab too
            'upcoming'  => $bookings->where('status', 'accepted')->values(),
            'pending'   => $bookings->whereIn('status', ['pending', 'pending_payment'])->values(),
            'completed' => $bookings->where('status', 'completed')->values(),
            'cancelled' => $bookings->whereIn('status', ['rejected', 'cancelled'])->values(),
        ]);
    }

    // ── Private Helpers ───────────────────────────────────────────────────────

    private function getTherapistSlotStatus(
        int    $therapistId,
        Carbon $slotDatetime,
        int    $duration,
        string $zoneName
    ): array {
        $therapist     = Therapist::with('zones')->findOrFail($therapistId);
        $travelMinutes = $therapist->getTravelTime($zoneName);

        $thisBlocks = Booking::computeTimeBlocks(
            $slotDatetime->toDateTimeString(),
            $duration,
            $travelMinutes
        );

        $activeBookings = Booking::where('therapist_id', $therapistId)
            ->whereIn('status', ['pending_payment', 'pending', 'accepted'])
            ->get(['travel_start', 'scheduled_start', 'scheduled_end', 'buffer_end']);

        foreach ($activeBookings as $booking) {
            $existingTravelStart = Carbon::parse($booking->travel_start);
            $existingBufferEnd   = Carbon::parse($booking->buffer_end);
            $existingStart       = Carbon::parse($booking->scheduled_start);
            $existingEnd         = Carbon::parse($booking->scheduled_end);

            $overlaps = $thisBlocks['travel_start']->lte($existingBufferEnd)
                && $thisBlocks['buffer_end']->gte($existingTravelStart);

            if (!$overlaps) continue;

            if ($slotDatetime->gte($existingStart) && $slotDatetime->lt($existingEnd)) {
                return ['available' => false, 'reason' => 'booked'];
            }

            if ($slotDatetime->lt($existingStart)) {
                return ['available' => false, 'reason' => 'travel'];
            }

            return ['available' => false, 'reason' => 'buffer'];
        }

        return ['available' => true, 'reason' => null];
    }

    private function hasAvailableTherapist(
        Carbon $slotDatetime,
        int    $duration,
        string $zoneName,
        string $dayName
    ): bool {
        $therapists = Therapist::with('zones')
            ->where('is_active', true)
            ->where('day_off', '!=', $dayName)
            ->whereHas('zones', fn($q) => $q->where('zone_name', $zoneName))
            ->get();

        foreach ($therapists as $therapist) {
            $travelMinutes = $therapist->getTravelTime($zoneName);
            $timeBlocks    = Booking::computeTimeBlocks(
                $slotDatetime->toDateTimeString(),
                $duration,
                $travelMinutes
            );

            if (!$this->hasConflict(
                $therapist->id,
                $timeBlocks['travel_start'],
                $timeBlocks['buffer_end']
            )) {
                return true;
            }
        }

        return false;
    }

    private function hasConflict(
        int    $therapistId,
        Carbon $travelStart,
        Carbon $bufferEnd
    ): bool {
        return Booking::where('therapist_id', $therapistId)
            ->whereIn('status', ['pending_payment', 'pending', 'accepted'])
            ->where('travel_start', '<=', $bufferEnd)
            ->where('buffer_end',   '>=', $travelStart)
            ->exists();
    }

    private function canReview(Booking $booking, int $customerId): bool
    {
        if ($booking->status !== 'completed') return false;

        $hoursElapsed = Carbon::parse($booking->updated_at)->diffInHours(now());
        if ($hoursElapsed > 48) return false;

        if (\App\Models\Review::where('booking_id', $booking->id)->exists()) {
            return false;
        }

        $canServiceRate = \App\Models\ServiceRatingLog::canRate(
            $customerId,
            $booking->service->group_name
        );

        $canTherapistRate = \App\Models\TherapistRatingLog::canRate(
            $customerId,
            $booking->therapist_id
        );

        return $canServiceRate || $canTherapistRate;
    }
}