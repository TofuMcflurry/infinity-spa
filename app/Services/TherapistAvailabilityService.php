<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\Therapist;
use App\Models\TherapistUnavailableSlot;
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
 * isDayOff()/isWithinShift()/hasUnavailableSlot() below are a deliberate
 * duplication (not a refactor-and-call) of the private assertNotDayOff()/
 * assertWithinShift()/hasUnavailableSlot() logic already proven in
 * BookingRescheduleService for admin rescheduling — same fields, same
 * overlap semantics, same crosses_midnight handling. Reused rather than
 * extracted, to avoid touching the admin reschedule flow (out of scope for
 * the customer booking-integrity fix this was added for); a future cleanup
 * could have BookingRescheduleService call these shared methods instead.
 */
class TherapistAvailabilityService
{
    // Booking statuses that occupy a therapist's schedule and must be
    // checked for overlap — the exact set BookingController already used,
    // plus en_route/arrived: a booking mid-session (therapist already
    // traveling to or physically at the customer's location) must still
    // block a new booking for the same therapist/time. Previously excluded,
    // which was a confirmed gap — see the double-booking integrity audit.
    public const ACTIVE_STATUSES = ['pending_payment', 'pending', 'accepted', 'en_route', 'arrived'];

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

    /**
     * Is $start on the therapist's weekly day off? Same rule as
     * BookingRescheduleService::assertNotDayOff() — weekday computed in
     * Asia/Dubai regardless of $start's own timezone.
     */
    public static function isDayOff(Therapist $therapist, Carbon $start): bool
    {
        $dayName = $start->copy()->timezone('Asia/Dubai')->format('l');

        return $therapist->day_off === $dayName;
    }

    /**
     * Does the candidate window — $start through $bufferEnd — fit entirely
     * inside the therapist's actual shift (shift_start/shift_end, wrapping
     * past midnight when crosses_midnight is set)? Same rule as
     * BookingRescheduleService::assertWithinShift(). Unlike
     * BookingController::getAvailableSlots() (which hardcodes a single
     * 16:00-04:00 window for every therapist for slot generation), this
     * uses the therapist's own shift fields.
     */
    public static function isWithinShift(Therapist $therapist, Carbon $start, Carbon $bufferEnd): bool
    {
        $shiftStartTime = Carbon::parse($therapist->shift_start)->format('H:i:s');
        $shiftEndTime   = Carbon::parse($therapist->shift_end)->format('H:i:s');

        $dateStr    = $start->toDateString();
        $shiftStart = Carbon::parse($dateStr . ' ' . $shiftStartTime);
        $shiftEnd   = Carbon::parse($dateStr . ' ' . $shiftEndTime);

        if ($therapist->crosses_midnight) {
            if ($start->format('H:i:s') < $shiftStartTime) {
                // Candidate's time-of-day is before shift_start (e.g. 02:00
                // with shift_start 16:00) — it belongs to the shift that
                // began the previous calendar day.
                $shiftStart->subDay();
            } else {
                $shiftEnd->addDay();
            }
        }

        return !($start->lt($shiftStart) || $bufferEnd->gt($shiftEnd));
    }

    /**
     * Has the therapist manually blocked this time? Same rule as
     * BookingRescheduleService::hasUnavailableSlot() — checked against the
     * session window ($start through $scheduledEnd), not the travel/buffer
     * window, matching that service's established interpretation.
     */
    public static function hasUnavailableSlot(Therapist $therapist, Carbon $start, Carbon $scheduledEnd): bool
    {
        // therapist_unavailable_slots.therapist_id references users.id
        // (see TherapistScheduleController::storeUnavailable), not
        // therapists.id — must key off the therapist's user_id here.
        return TherapistUnavailableSlot::where('therapist_id', $therapist->user_id)
            ->where('date', $start->toDateString())
            ->where(function ($q) use ($start, $scheduledEnd) {
                $q->where('is_full_day', true)
                    ->orWhere(function ($q2) use ($start, $scheduledEnd) {
                        $q2->where('is_full_day', false)
                            ->where('start_time', '<', $scheduledEnd->format('H:i:s'))
                            ->where('end_time', '>', $start->format('H:i:s'));
                    });
            })
            ->exists();
    }
}
