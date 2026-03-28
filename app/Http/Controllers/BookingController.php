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

        // Group by group_name
        $grouped = $services->groupBy('group_name')->map(function ($items, $groupName) {
            $first = $items->first();
            return [
                'group_name'    => $groupName,
                'group_name_ar' => $first->group_name_ar,
                'category'      => $first->category,
                'min_price'     => $items->min('price'),
                'durations' => $items->map(fn($s) => [
                    'id'               => $s->id,
                    'duration_minutes' => $s->duration_minutes,
                    'price'            => $s->price,
                    'rating'           => $s->rating,
                    'description'      => $s->description, // ← ADD THIS
                ])->values(),
            ];
        })->values();

        return response()->json($grouped);
    }

    // ── Step 3: Get available time slots ─────────────────────────────────────
    public function getAvailableSlots(Request $request)
    {
        $request->validate([
            'service_id' => 'required|exists:services,id',
            'zone_name'  => 'required|string',
            'date'       => 'required|date|after:today',
        ]);

        $service  = Service::findOrFail($request->service_id);
        $date     = $request->date;
        $zoneName = $request->zone_name;

        // ── Check if requested date is a day off ──────────────────────────
        $dayName = Carbon::parse($date)->format('l'); // "Monday", "Tuesday"...
        
        // Check if ALL therapists are off on this day
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

        // ── Generate valid time slots ─────────────────────────────────────
        // Shift: 4:00 PM to 4:00 AM (next day)
        // Last valid slot = 4:00 AM - duration - buffer
        $shiftStart    = Carbon::parse($date . ' 16:00:00'); // 4:00 PM
        $shiftEnd      = Carbon::parse($date . ' 04:00:00')->addDay(); // 4:00 AM next day

        $maxBuffer     = 30;
        $lastValidTime = $shiftEnd->copy()
            ->subMinutes($service->duration_minutes + $maxBuffer);

        // Generate hourly slots from 4PM to last valid time
        $slots    = [];
        $current  = $shiftStart->copy();

        while ($current->lessThanOrEqualTo($lastValidTime)) {
            $slotDateTime = Carbon::parse($date . ' ' . $current->format('H:i:s'));

            // Handle midnight crossing
            if ($current->format('H') < 16) {
                $slotDateTime->addDay();
            }

            $hasAvailable = $this->hasAvailableTherapist(
                $slotDateTime,
                $service->duration_minutes,
                $zoneName,
                $dayName
            );

            $slots[] = [
                'time'      => $slotDateTime->format('H:i'),
                'datetime'  => $slotDateTime->toDateTimeString(),
                'label'     => $slotDateTime->format('g:i A'),
                'available' => $hasAvailable,
            ];

            $current->addHour();
        }

        return response()->json([
            'day_off' => false,
            'slots'   => $slots,
        ]);
    }

    // ── Step 4: Get available therapists ─────────────────────────────────────
    public function getAvailableTherapists(Request $request)
    {
        $request->validate([
            'service_id' => 'required|exists:services,id',
            'zone_name'  => 'required|string',
            'datetime'   => 'required|string',
        ]);

        $service      = Service::findOrFail($request->service_id);
        $slotDatetime = Carbon::parse($request->datetime);
        $zoneName     = $request->zone_name;
        $dayName      = $slotDatetime->format('l');

        $therapists = Therapist::with(['user', 'zones'])
            ->where('is_active', true)
            ->where('day_off', '!=', $dayName)
            ->whereHas('zones', fn($q) => $q->where('zone_name', $zoneName))
            ->get();

        $result = $therapists->map(function ($therapist) use (
            $slotDatetime, $service, $zoneName
        ) {
            $travelMinutes = $therapist->getTravelTime($zoneName);
            $timeBlocks    = Booking::computeTimeBlocks(
                $slotDatetime->toDateTimeString(),
                $service->duration_minutes,
                $travelMinutes
            );

            $isAvailable = !$this->hasConflict(
                $therapist->id,
                $timeBlocks['travel_start'],
                $timeBlocks['buffer_end']
            );

            $nextAvailable = null;
            if (!$isAvailable) {
                $nextAvailable = $this->findNextAvailableSlot(
                    $therapist->id,
                    $slotDatetime,
                    $service->duration_minutes,
                    $travelMinutes
                );
            }

            return [
                'id'             => $therapist->id,
                'name'           => $therapist->user->name,
                'specialty'      => $therapist->specialty,
                'rating'         => $therapist->rating,
                'experience'     => $therapist->experience_years,
                'gender'         => $therapist->gender,
                'avatar'         => strtoupper(substr($therapist->user->name, 0, 1))
                                    . strtoupper(substr(explode(' ', $therapist->user->name)[1] ?? '', 0, 1)),
                'available'      => $isAvailable,
                'next_available' => $nextAvailable,
            ];
        });

        return response()->json($result);
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

        $slotDatetime  = Carbon::parse($request->datetime);
        $travelMinutes = $therapist->getTravelTime($request->zone_name);
        $timeBlocks    = Booking::computeTimeBlocks(
            $slotDatetime->toDateTimeString(),
            $service->duration_minutes,
            $travelMinutes
        );

        // Final conflict check
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
            'customer_id'     => auth()->id(),
            'therapist_id'    => $request->therapist_id,
            'service_id'      => $request->service_id,
            'location'        => $request->location,
            'zone_name'       => $request->zone_name,
            'scheduled_start' => $slotDatetime,
            'scheduled_end'   => $timeBlocks['scheduled_end'],
            'travel_start'    => $timeBlocks['travel_start'],
            'buffer_end'      => $timeBlocks['buffer_end'],
            'payment_method'  => $request->payment_method,
            'status'          => 'pending',
        ]);

        return response()->json([
            'message' => 'Booking submitted!',
            'booking' => $booking->load('service', 'therapist.user'),
        ], 201);
    }

    // ── My Bookings ───────────────────────────────────────────────────────────
    public function myBookings()
    {
        $bookings = Booking::with(['service', 'therapist.user'])
            ->where('customer_id', auth()->id())
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
                'can_review'      => $this->canReview($b, auth()->id()),
                'hours_remaining' => $b->updated_at
                    ? max(0, 48 - \Carbon\Carbon::parse($b->updated_at)->diffInHours(now()))
                    : null,
            ]);

        return response()->json([
            'upcoming'  => $bookings->where('status', 'accepted')->values(),
            'pending'   => $bookings->where('status', 'pending')->values(),
            'completed' => $bookings->where('status', 'completed')->values(),
            'cancelled' => $bookings->whereIn('status', ['rejected', 'cancelled'])->values(),
        ]);
    }

    private function canReview(Booking $booking, int $customerId): bool
    {
        if ($booking->status !== 'completed') return false;

        // Check 48 hour window
        $hoursElapsed = \Carbon\Carbon::parse($booking->updated_at)
            ->diffInHours(now());
        if ($hoursElapsed > 48) return false;

        // Check if already reviewed
        if (\App\Models\Review::where('booking_id', $booking->id)->exists()) {
            return false;
        }

        // Check if either rating is still available
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

    // Sa BookingController.php — idagdag:
    public function getTherapists()
    {
        $therapists = Therapist::with(['user', 'zones'])
            ->where('is_active', true)
            ->orderByDesc('rating')
            ->get()
            ->map(function ($t) {
                // Count total reviews
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
                    'shift_start'      => \Carbon\Carbon::parse($t->shift_start)->format('g:i A'),
                    'shift_end'        => \Carbon\Carbon::parse($t->shift_end)->format('g:i A'),
                    'zones'            => $t->zones->pluck('zone_name')->toArray(),
                ];
            });

        return response()->json($therapists);
    }

    // ── Private Helpers ───────────────────────────────────────────────────────

    private function hasConflict(
        int    $therapistId,
        Carbon $travelStart,
        Carbon $bufferEnd
    ): bool {
        return Booking::where('therapist_id', $therapistId)
            ->whereIn('status', ['pending', 'accepted'])
            ->where('travel_start', '<', $bufferEnd)
            ->where('buffer_end',   '>', $travelStart)
            ->exists();
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

    private function findNextAvailableSlot(
        int    $therapistId,
        Carbon $currentSlot,
        int    $duration,
        int    $travelMinutes
    ): ?string {
        $next = $currentSlot->copy()->addHour();
        $shiftEnd = $currentSlot->copy()->setTime(4, 0)->addDay();

        while ($next->lessThan($shiftEnd)) {
            $timeBlocks = Booking::computeTimeBlocks(
                $next->toDateTimeString(),
                $duration,
                $travelMinutes
            );

            if (!$this->hasConflict(
                $therapistId,
                $timeBlocks['travel_start'],
                $timeBlocks['buffer_end']
            )) {
                return $next->format('g:i A');
            }

            $next->addHour();
        }

        return null;
    }
}