<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Service;
use App\Models\Therapist;
use Carbon\Carbon;
use Illuminate\Http\Request;

class BookingController extends Controller
{
    // ── Step 1: Get all active services ──────────────────────────────────────
    public function getServices()
    {
        $services = Service::where('is_active', true)
            ->orderBy('group_name')
            ->orderBy('duration_minutes')
            ->get();

        $grouped = $services->groupBy('group_name')->map(function ($items, $groupName) {
            $first = $items->first();
            return [
                'group_name'    => $groupName,
                'group_name_ar' => $first->group_name_ar,
                'category'      => $first->category,
                'min_price'     => $items->min('price'),
                'durations'     => $items->map(fn($s) => [
                    'id'               => $s->id,
                    'duration_minutes' => $s->duration_minutes,
                    'price'            => $s->price,
                    'rating'           => $s->rating,
                    'description'      => $s->description,
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
            'service_id'   => 'required|exists:services,id',
            'zone_name'    => 'required|string',
            'date'         => 'required|date',
            'therapist_id' => 'nullable|exists:therapists,id',
        ]);

        $service     = Service::findOrFail($request->service_id);
        $date        = $request->date;
        $zoneName    = $request->zone_name;
        $therapistId = $request->therapist_id;
        $customerId  = auth()->id();

        // ── Day-off check ─────────────────────────────────────────────────────
        $dayName = Carbon::parse($date)->format('l');

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
        $lastValidTime = $shiftEnd->copy()->subMinutes($service->duration_minutes + $maxBuffer);

        // ── Pre-fetch ONCE before loop ────────────────────────────────────────
        $travelMinutes = $therapistId
            ? Therapist::findOrFail($therapistId)->getTravelTime($zoneName)
            : 0;

        // Pre-fetch ALL customer active bookings ONCE (not inside loop)
        $customerBookings = Booking::where('customer_id', $customerId)
            ->whereIn('status', ['pending_payment', 'pending', 'accepted'])
            ->get(['travel_start', 'buffer_end']);

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
                    $service->duration_minutes,
                    $zoneName
                );

                // ── FIX 3: Check customer conflict using pre-fetched bookings ──
                if ($slotResult['available']) {
                    $thisBlocks = Booking::computeTimeBlocks(
                        $slotDateTime->toDateTimeString(),
                        $service->duration_minutes,
                        $travelMinutes
                    );

                    // Check against pre-fetched customer bookings
                    $customerConflict = $customerBookings->contains(function ($b) use ($thisBlocks) {
                        return Carbon::parse($b->travel_start)->lt($thisBlocks['buffer_end'])
                            && Carbon::parse($b->buffer_end)->gt($thisBlocks['travel_start']);
                    });

                    if ($customerConflict) {
                        $slotResult = ['available' => false, 'reason' => 'customer_conflict'];
                    }
                }
            } else {
                $isAvail    = $this->hasAvailableTherapist(
                    $slotDateTime,
                    $service->duration_minutes,
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

            $current->addHour();
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
            'service_id'     => 'required|exists:services,id',
            'therapist_id'   => 'required|exists:therapists,id',
            'zone_name'      => 'required|string',
            'location'       => 'required|string',
            'datetime'       => 'required|string',
            'payment_method' => 'required|in:cash,cashless',
        ]);

        $service   = Service::findOrFail($request->service_id);
        $therapist = Therapist::findOrFail($request->therapist_id);

        $downpaymentAmount = round($service->price * 0.20, 2);
        $remainingAmount   = round($service->price * 0.80, 2);

        $slotDatetime  = Carbon::parse($request->datetime);
        $travelMinutes = $therapist->getTravelTime($request->zone_name);
        $timeBlocks    = Booking::computeTimeBlocks(
            $slotDatetime->toDateTimeString(),
            $service->duration_minutes,
            $travelMinutes
        );

        // ── FIX 3: Customer double booking prevention ─────────────────────────
        $customerConflict = Booking::where('customer_id', auth()->id())
            ->whereIn('status', ['pending_payment', 'pending', 'accepted'])
            ->where('travel_start', '<', $timeBlocks['buffer_end'])
            ->where('buffer_end',   '>', $timeBlocks['travel_start'])
            ->exists();

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
            'service_id'         => $request->service_id,
            'location'           => $request->location,
            'zone_name'          => $request->zone_name,
            'scheduled_start'    => $slotDatetime,
            'scheduled_end'      => $timeBlocks['scheduled_end'],
            'travel_start'       => $timeBlocks['travel_start'],
            'buffer_end'         => $timeBlocks['buffer_end'],
            'payment_method'     => $request->payment_method,
            'status'             => 'pending_payment',
            'downpayment_amount' => $downpaymentAmount,
            'remaining_amount'   => $remainingAmount,
            'downpayment_status' => 'pending',
        ]);

        return response()->json([
            'message' => 'Booking submitted!',
            'booking' => $booking->load('service', 'therapist.user'),
        ], 201);
    }

    // ── My Bookings ───────────────────────────────────────────────────────────
    public function myBookings()
    {
        $customerId = auth()->id();

        $bookings = Booking::with(['service', 'therapist.user'])
            ->where('customer_id', $customerId)
            ->orderByDesc('scheduled_start')
            ->get()
            ->map(fn($b) => [
                'id'               => $b->id,
                'service'          => $b->service->name,
                'service_id'       => $b->service_id,
                'therapist'        => $b->therapist->user->name,
                'therapist_id'     => $b->therapist_id,
                'therapist_avatar' => strtoupper(substr($b->therapist->user->name, 0, 1))
                                      . strtoupper(substr(explode(' ', $b->therapist->user->name)[1] ?? '', 0, 1)),
                'date'             => Carbon::parse($b->scheduled_start)->format('l, d F Y'),
                'date_short'       => Carbon::parse($b->scheduled_start)->format('M d, Y'),
                'time'             => Carbon::parse($b->scheduled_start)->format('g:i A'),
                'duration'         => $b->service->duration_minutes,
                'price'            => $b->service->price,
                'location'         => $b->location,
                'zone_name'        => $b->zone_name,
                'payment_method'   => $b->payment_method,
                'status'           => $b->status,
                'rejection_reason' => $b->rejection_reason,
                'can_review'       => $this->canReview($b, $customerId),
                'hours_remaining'  => $b->updated_at
                    ? max(0, 48 - Carbon::parse($b->updated_at)->diffInHours(now()))
                    : null,
                'hours_until_session' => Carbon::parse($b->scheduled_start)->diffInHours(now(), false),
                'downpayment_amount'  => $b->downpayment_amount,
                'remaining_amount'    => $b->remaining_amount,
                'downpayment_status'  => $b->downpayment_status,
                'downpayment_proof'   => $b->downpayment_proof,
                'cancellation_type'   => $b->cancellation_type,
                'cancelled_at'        => $b->cancelled_at
                    ? Carbon::parse($b->cancelled_at)->format('M d, Y g:i A')
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

            $overlaps = $thisBlocks['travel_start']->lt($existingBufferEnd)
                     && $thisBlocks['buffer_end']->gt($existingTravelStart);

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
            ->where('travel_start', '<', $bufferEnd)
            ->where('buffer_end',   '>', $travelStart)
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