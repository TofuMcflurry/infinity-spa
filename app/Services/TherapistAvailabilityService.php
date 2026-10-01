<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\Therapist;
use Carbon\Carbon;

/**
 * Single source of truth for therapist scheduling conflicts. Extracted from
 * BookingController's private hasConflict()/getTherapistSlotStatus()/
 * hasAvailableTherapist() so the customer booking flow and the future
 * Admin Rescheduling flow evaluate availability identically.
 *
 * This is a straight extraction — the overlap rule, the active-status set,
 * and the 30-minute buffer baked into Booking::computeTimeBlocks() are all
 * unchanged from the original BookingController implementation.
 *
 * Day-off, TherapistUnavailableSlot, and shift_start/shift_end/crosses_midnight
 * are NOT enforced here yet — the original BookingController logic never
 * checked them inside these three methods either (day-off is checked
 * separately, upstream, by BookingController::getAvailableSlots). Admin
 * Rescheduling can add that enforcement here later without touching the
 * customer booking call sites, since they only rely on the methods below.
 */
class TherapistAvailabilityService
{
    // Booking statuses that occupy a therapist's schedule and must be
    // checked for overlap — the exact set BookingController already used.
    public const ACTIVE_STATUSES = ['pending_payment', 'pending', 'accepted'];

    /**
     * Does the therapist have any active booking whose [travel_start, buffer_end]
     * interval overlap the candidate [travelStart, bufferEnd] interval?
     *
     * $excludeBookingId lets a caller check a candidate slot without that
     * booking's own current row counting as a conflict against itself —
     * needed by Admin Rescheduling when re-checking the booking being moved.
     * Unused (null) by the current customer booking flow, which preserves
     * its existing behavior exactly.
     */
    public static function hasConflict(
        int    $therapistId,
        Carbon $travelStart,
        Carbon $bufferEnd,
        ?int   $excludeBookingId = null
    ): bool {
        return Booking::where('therapist_id', $therapistId)
            ->whereIn('status', self::ACTIVE_STATUSES)
            ->when($excludeBookingId, fn ($q) => $q->where('id', '!=', $excludeBookingId))
            ->where('travel_start', '<=', $bufferEnd)
            ->where('buffer_end',   '>=', $travelStart)
            ->exists();
    }

    /**
     * Slot-level status for a specific therapist — same overlap rule as
     * hasConflict(), but walks the active bookings to report *why* a slot
     * is unavailable ('booked' | 'travel' | 'buffer'), for UI messaging.
     */
    public static function getTherapistSlotStatus(
        int    $therapistId,
        Carbon $slotDatetime,
        int    $duration,
        string $zoneName,
        ?int   $excludeBookingId = null
    ): array {
        $therapist     = Therapist::with('zones')->findOrFail($therapistId);
        $travelMinutes = $therapist->getTravelTime($zoneName);

        $thisBlocks = Booking::computeTimeBlocks(
            $slotDatetime->toDateTimeString(),
            $duration,
            $travelMinutes
        );

        $activeBookings = Booking::where('therapist_id', $therapistId)
            ->whereIn('status', self::ACTIVE_STATUSES)
            ->when($excludeBookingId, fn ($q) => $q->where('id', '!=', $excludeBookingId))
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

    /**
     * Is there at least one active, zone-serving therapist (not on day off)
     * free at this slot? Used by the "any therapist" search path.
     */
    public static function hasAvailableTherapist(
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

            if (!self::hasConflict(
                $therapist->id,
                $timeBlocks['travel_start'],
                $timeBlocks['buffer_end']
            )) {
                return true;
            }
        }

        return false;
    }
}
