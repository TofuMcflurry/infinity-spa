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
     * Is there at least one active, zone-serving therapist free at this
     * slot — not on day off, within their own shift, not manually blocked,
     * and without a conflicting active booking? Used by the "any therapist"
     * search path (BookingController::getAvailableSlots() with no
     * therapist_id — not currently called by the Customer Booking Wizard,
     * which always selects a therapist first, but kept correct since the
     * endpoint is still public).
     *
     * Day-off is evaluated per candidate from $slotDatetime's own (possibly
     * next-calendar-day) date via isDayOff() — not a single dayName computed
     * once from the requested date — matching what BookingController::store()
     * actually enforces at the overnight boundary.
     */
    public static function hasAvailableTherapist(
        Carbon $slotDatetime,
        int    $duration,
        string $zoneName
    ): bool {
        $therapists = Therapist::with('zones')
            ->where('is_active', true)
            ->whereHas('zones', fn($q) => $q->where('zone_name', $zoneName))
            ->get();

        foreach ($therapists as $therapist) {
            if (self::isDayOff($therapist, $slotDatetime)) {
                continue;
            }

            $travelMinutes = $therapist->getTravelTime($zoneName);
            $timeBlocks    = Booking::computeTimeBlocks(
                $slotDatetime->toDateTimeString(),
                $duration,
                $travelMinutes
            );

            if (!self::isWithinShift($therapist, $slotDatetime, $timeBlocks['buffer_end'])) {
                continue;
            }

            if (self::hasUnavailableSlot($therapist, $slotDatetime, $timeBlocks['scheduled_end'])) {
                continue;
            }

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
     * Has the therapist manually blocked this time? Checked against the
     * session window ($start through $scheduledEnd), not the travel/buffer
     * window — matching BookingRescheduleService's established
     * interpretation for admin rescheduling (a separate, private
     * implementation there, out of scope to touch here).
     *
     * Compares full datetimes, not raw time-of-day strings. Schedule.jsx's
     * UnavailableModal always creates single-hour, same-date blocks via its
     * own effHour/effDate rollover — except the 23:00 hour, whose end_time
     * is submitted as "00:00" (via (effHour+1)%24) to mean "midnight at the
     * end of this date," not an earlier time on the same date. A plain
     * end_time > start_time string/time comparison breaks for exactly that
     * record ('00:00:00' > '23:00:00' is false), so a session overlapping
     * that hour was never detected as blocked — confirmed via Schedule.jsx's
     * own code and comments, not a new convention. Treating an end_time
     * that is <= its own start_time as rolling into the following date is
     * the only reading consistent with how these rows are actually created.
     */
    public static function hasUnavailableSlot(Therapist $therapist, Carbon $start, Carbon $scheduledEnd): bool
    {
        // therapist_unavailable_slots.therapist_id references users.id
        // (see TherapistScheduleController::storeUnavailable), not
        // therapists.id — must key off the therapist's user_id here.
        return TherapistUnavailableSlot::where('therapist_id', $therapist->user_id)
            ->where('date', $start->toDateString())
            ->get(['date', 'start_time', 'end_time', 'is_full_day'])
            ->contains(function ($slot) use ($start, $scheduledEnd) {
                if ($slot->is_full_day) {
                    return true;
                }

                $blockDate  = Carbon::parse($slot->date)->toDateString();
                $blockStart = Carbon::parse($blockDate . ' ' . $slot->start_time);
                $blockEnd   = Carbon::parse($blockDate . ' ' . $slot->end_time);

                if ($blockEnd->lte($blockStart)) {
                    $blockEnd->addDay();
                }

                return $blockStart->lt($scheduledEnd) && $blockEnd->gt($start);
            });
    }

    /**
     * The shift window that STARTS on $date (e.g. a 16:00->04:00 shift for
     * Oct 8 runs Oct 8 16:00 through Oct 9 04:00). Same rule as
     * BookingRescheduleService::shiftWindowStartingOn() — the natural
     * reading for a date picker, used by getAvailableSlots() to generate
     * the candidate slot list for a selected therapist's own shift instead
     * of a hardcoded 16:00-04:00 window.
     */
    public static function shiftWindowStartingOn(Therapist $therapist, string $date): array
    {
        $shiftStartTime = Carbon::parse($therapist->shift_start)->format('H:i:s');
        $shiftEndTime   = Carbon::parse($therapist->shift_end)->format('H:i:s');

        $shiftStart = Carbon::parse($date . ' ' . $shiftStartTime);
        $shiftEnd   = Carbon::parse($date . ' ' . $shiftEndTime);

        if ($therapist->crosses_midnight) {
            $shiftEnd->addDay();
        }

        return [$shiftStart, $shiftEnd];
    }

    /**
     * The widest candidate window that could contain any active, zone-serving
     * therapist's shift starting on $date — the union of every such
     * therapist's own shiftWindowStartingOn(). Used by getAvailableSlots()
     * when no therapist is selected, so a therapist configured with
     * different hours than the rest is never excluded from slot generation
     * just because their shift falls outside the common 16:00-04:00 window.
     * Day-off is deliberately not applied here — it only affects which
     * individual candidate slots end up eligible (checked separately per
     * slot by hasAvailableTherapist()), not the shift-hours envelope itself.
     * Returns null when no active therapist serves this zone at all.
     */
    public static function zoneShiftEnvelope(string $zoneName, string $date): ?array
    {
        $therapists = Therapist::where('is_active', true)
            ->whereHas('zones', fn($q) => $q->where('zone_name', $zoneName))
            ->get(['shift_start', 'shift_end', 'crosses_midnight']);

        if ($therapists->isEmpty()) {
            return null;
        }

        $envelopeStart = null;
        $envelopeEnd   = null;

        foreach ($therapists as $therapist) {
            [$start, $end] = self::shiftWindowStartingOn($therapist, $date);

            if ($envelopeStart === null || $start->lt($envelopeStart)) {
                $envelopeStart = $start;
            }
            if ($envelopeEnd === null || $end->gt($envelopeEnd)) {
                $envelopeEnd = $end;
            }
        }

        return [$envelopeStart, $envelopeEnd];
    }
}
