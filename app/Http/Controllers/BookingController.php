<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Service;
use App\Models\Therapist;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Inertia\Inertia;

class BookingController extends Controller
{
    // ── Step 1: Get all active services ──────────────────────────────────────
    public function getServices()
    {
        $services = Service::where('is_active', true)->get();
        return response()->json($services);
    }

    // ── Step 3: Get available time slots ─────────────────────────────────────
    public function getAvailableSlots(Request $request)
    {
        $request->validate([
            'service_id' => 'required|exists:services,id',
            'zone_name'  => 'required|string',
            'date'       => 'required|date|after:today',
        ]);

        $service   = Service::findOrFail($request->service_id);
        $date      = $request->date;
        $zoneName  = $request->zone_name;

        // All possible time slots (9AM - 8PM)
        $allSlots = [
            '09:00', '10:00', '11:00', '12:00',
            '13:00', '14:00', '15:00', '16:00',
            '17:00', '18:00', '19:00', '20:00',
        ];

        $availableSlots = [];

        foreach ($allSlots as $slot) {
            // Check if AT LEAST ONE therapist is available for this slot
            $hasAvailableTherapist = $this->hasAvailableTherapist(
                $date,
                $slot,
                $service->duration_minutes,
                $zoneName
            );

            $availableSlots[] = [
                'time'      => $slot,
                'label'     => Carbon::createFromFormat('H:i', $slot)->format('g:i A'),
                'available' => $hasAvailableTherapist,
            ];
        }

        return response()->json($availableSlots);
    }

    // ── Step 4: Get available therapists ─────────────────────────────────────
    public function getAvailableTherapists(Request $request)
    {
        $request->validate([
            'service_id' => 'required|exists:services,id',
            'zone_name'  => 'required|string',
            'date'       => 'required|date|after:today',
            'time'       => 'required|string',
        ]);

        $service  = Service::findOrFail($request->service_id);
        $date     = $request->date;
        $time     = $request->time;
        $zoneName = $request->zone_name;

        // Get all active therapists that serve this zone
        $therapists = Therapist::with(['user', 'zones'])
            ->where('is_active', true)
            ->whereHas('zones', fn($q) => $q->where('zone_name', $zoneName))
            ->get();

        $result = $therapists->map(function ($therapist) use (
            $date, $time, $service, $zoneName
        ) {
            $travelMinutes = $therapist->getTravelTime($zoneName);
            $timeBlocks    = Booking::computeTimeBlocks(
                $time,
                $service->duration_minutes,
                $travelMinutes
            );

            $isAvailable = !$this->hasConflict(
                $therapist->id,
                $date,
                $timeBlocks['travel_start'],
                $timeBlocks['buffer_end']
            );

            // Find next available slot if booked
            $nextAvailable = null;
            if (!$isAvailable) {
                $nextAvailable = $this->findNextAvailableSlot(
                    $therapist->id,
                    $date,
                    $time,
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
            'service_id'      => 'required|exists:services,id',
            'therapist_id'    => 'required|exists:therapists,id',
            'zone_name'       => 'required|string',
            'location'        => 'required|string',
            'date'            => 'required|date|after:today',
            'time'            => 'required|string',
            'payment_method'  => 'required|in:cash,cashless',
        ]);

        $service   = Service::findOrFail($request->service_id);
        $therapist = Therapist::findOrFail($request->therapist_id);

        $travelMinutes = $therapist->getTravelTime($request->zone_name);
        $timeBlocks    = Booking::computeTimeBlocks(
            $request->time,
            $service->duration_minutes,
            $travelMinutes
        );

        // Final conflict check before storing
        $hasConflict = $this->hasConflict(
            $therapist->id,
            $request->date,
            $timeBlocks['travel_start'],
            $timeBlocks['buffer_end']
        );

        if ($hasConflict) {
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
            'scheduled_date'  => $request->date,
            'scheduled_start' => $request->time,
            'scheduled_end'   => $timeBlocks['scheduled_end'],
            'travel_start'    => $timeBlocks['travel_start'],
            'buffer_end'      => $timeBlocks['buffer_end'],
            'payment_method'  => $request->payment_method,
            'status'          => 'pending',
        ]);

        return response()->json([
            'message' => 'Booking submitted successfully!',
            'booking' => $booking->load('service', 'therapist.user'),
        ], 201);
    }

    // Idagdag sa BookingController — after store()
    public function myBookings()
    {
        $customerId = auth()->id();

        $bookings = Booking::with(['service', 'therapist.user'])
            ->where('customer_id', $customerId)
            ->orderByDesc('scheduled_date')
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
                'date'             => Carbon::parse($b->scheduled_date)->format('l, d F Y'),
                'date_short'       => Carbon::parse($b->scheduled_date)->format('M d, Y'),
                'time'             => Carbon::parse($b->scheduled_start)->format('g:i A'),
                'duration'         => $b->service->duration_minutes,
                'price'            => $b->service->price,
                'location'         => $b->location,
                'zone_name'        => $b->zone_name,
                'payment_method'   => $b->payment_method,
                'status'           => $b->status,
                'rejection_reason' => $b->rejection_reason,
            ]);

        return response()->json([
            'upcoming'  => $bookings->whereIn('status', ['accepted'])->values(),
            'pending'   => $bookings->where('status', 'pending')->values(),
            'completed' => $bookings->where('status', 'completed')->values(),
            'cancelled' => $bookings->whereIn('status', ['rejected', 'cancelled'])->values(),
        ]);
    }
    // ── Private Helpers ───────────────────────────────────────────────────────

    private function hasConflict(
        int    $therapistId,
        string $date,
        string $travelStart,
        string $bufferEnd
    ): bool {
        return Booking::where('therapist_id', $therapistId)
            ->where('scheduled_date', $date)
            ->whereIn('status', ['pending', 'accepted'])
            ->where('travel_start', '<', $bufferEnd)
            ->where('buffer_end', '>', $travelStart)
            ->exists();
    }

    private function hasAvailableTherapist(
        string $date,
        string $time,
        int    $duration,
        string $zoneName
    ): bool {
        $therapists = Therapist::with('zones')
            ->where('is_active', true)
            ->whereHas('zones', fn($q) => $q->where('zone_name', $zoneName))
            ->get();

        foreach ($therapists as $therapist) {
            $travelMinutes = $therapist->getTravelTime($zoneName);
            $timeBlocks    = Booking::computeTimeBlocks(
                $time, $duration, $travelMinutes
            );

            $conflict = $this->hasConflict(
                $therapist->id,
                $date,
                $timeBlocks['travel_start'],
                $timeBlocks['buffer_end']
            );

            if (!$conflict) return true;
        }

        return false;
    }

    private function findNextAvailableSlot(
        int    $therapistId,
        string $date,
        string $currentTime,
        int    $duration,
        int    $travelMinutes
    ): ?string {
        $allSlots = [
            '09:00', '10:00', '11:00', '12:00',
            '13:00', '14:00', '15:00', '16:00',
            '17:00', '18:00', '19:00', '20:00',
        ];

        // Only check slots AFTER the current time
        $futureSlots = array_filter(
            $allSlots,
            fn($s) => $s > $currentTime
        );

        foreach ($futureSlots as $slot) {
            $timeBlocks = Booking::computeTimeBlocks(
                $slot, $duration, $travelMinutes
            );

            $conflict = $this->hasConflict(
                $therapistId,
                $date,
                $timeBlocks['travel_start'],
                $timeBlocks['buffer_end']
            );

            if (!$conflict) {
                return Carbon::createFromFormat('H:i', $slot)->format('g:i A');
            }
        }

        return null;
    }
}