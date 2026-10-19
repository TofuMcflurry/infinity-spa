<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\Therapist;
use App\Models\TherapistUnavailableSlot;
use Carbon\Carbon;

/**
 * Admin-initiated booking reschedule: moves an existing booking's
 * scheduled_start (and its derived scheduled_end/travel_start/buffer_end)
 * to a new time, after re-validating therapist availability exactly the
 * way a brand new booking would be validated — plus the extra day-off /
 * shift / unavailable-slot checks the customer booking flow does not
 * currently enforce (admin rescheduling is a stronger safety context).
 *
 * The caller is responsible for wrapping the call in DB::transaction()
 * with the booking row already locked via
 * Booking::where('id', $id)->lockForUpdate()->firstOrFail() — this method
 * assumes it is operating on that locked row and re-validates state
 * against it, but does not open the lock itself (see
 * AdminBookingController::lockStaleBooking() for the existing pattern
 * this mirrors).
 *
 * Every validation failure goes through abort_if() — the same 422 +
 * plain-message convention AdminBookingController's own admin actions
 * already use (markRefundSent(), lockStaleBooking()) — thrown before
 * Booking::update() ever runs, so a failure never writes a partial change.
 */
class BookingRescheduleService
{
    // Only these booking statuses represent a still-pending, not-yet-active
    // future session — a session already under way (en_route/arrived) or
    // in a terminal state (completed/rejected/cancelled) cannot be
    // rescheduled. pending_payment is deliberately excluded: an admin
    // should not reschedule a booking the customer hasn't finished paying
    // for yet.
    public const RESCHEDULABLE_STATUSES = ['pending', 'accepted'];

    /**
     * Validates a candidate new start time against every rule reschedule()
     * itself enforces — status, future time, day-off, shift, unavailable
     * slot, and conflict (self-excluded) — WITHOUT writing anything.
     * Returns the computed time blocks (scheduled_end/travel_start/
     * buffer_end) a caller can use to preview the change.
     *
     * reschedule() below calls this first and is the only method that ever
     * writes to the booking — this is a read-only reuse of the same rules,
     * never a second scheduling engine. See
     * RescheduleProposalService::create(), which previews a proposal this
     * way without mutating the booking until the customer accepts it.
     */
    public static function validateCandidate(Booking $booking, Carbon $newStart): array
    {
        abort_if(
            !in_array($booking->status, self::RESCHEDULABLE_STATUSES, true),
            422,
            'This booking is not in a reschedulable state.'
        );

        abort_if($newStart->lte(now()), 422, 'The new schedule must be in the future.');

        $booking->loadMissing('serviceVariant', 'therapist');
        $variant   = $booking->serviceVariant;
        $therapist = $booking->therapist;

        abort_if(
            !$variant || !$therapist,
            422,
            'This booking is missing the service or therapist data required to reschedule.'
        );

        $travelMinutes = $therapist->getTravelTime($booking->zone_name);
        $blocks        = Booking::computeTimeBlocks(
            $newStart->toDateTimeString(),
            $variant->duration_minutes,
            $travelMinutes
        );

        self::assertNotDayOff($therapist, $newStart);
        self::assertWithinShift($therapist, $newStart, $blocks['buffer_end']);
        self::assertNoUnavailableSlot($therapist, $newStart, $blocks['scheduled_end']);

        // Conflict check excludes this booking's own current row — it still
        // occupies its old slot, which must not count as a conflict with
        // the new slot being evaluated for it.
        abort_if(
            TherapistAvailabilityService::hasConflict(
                $therapist->id,
                $blocks['travel_start'],
                $blocks['buffer_end'],
                $booking->id
            ),
            422,
            'This time conflicts with another booking for this therapist.'
        );

        return $blocks;
    }

    /**
     * The one chokepoint every reschedule path funnels through — a direct
     * admin reschedule, an approved reschedule request, and an accepted
     * reschedule proposal all call this and nothing else ever moves a
     * booking's schedule. That makes it the single correct place to enforce
     * the durable refund-forfeiture policy: if the appointment being
     * replaced (i.e. $booking->scheduled_start as it stands right now,
     * before this update) is already inside
     * BookingCancellationService::cancel()'s 24-hour non-refundable
     * window, moving the booking to a date that LOOKS safe must never
     * silently restore the refund/voucher entitlement already lost under
     * the original schedule — see refund_forfeited_at's migration
     * docblock. Checked and persisted atomically with the schedule change
     * (same update() call) and only ever set once — already-forfeited
     * stays forfeited through any number of further reschedules.
     */
    public static function reschedule(Booking $booking, Carbon $newStart, ?string $reason = null): Booking
    {
        $blocks = self::validateCandidate($booking, $newStart);

        $updates = [
            'scheduled_start' => $newStart,
            'scheduled_end'   => $blocks['scheduled_end'],
            'travel_start'    => $blocks['travel_start'],
            'buffer_end'      => $blocks['buffer_end'],
        ];

        if ($booking->refund_forfeited_at === null) {
            $hoursUntilCurrent = now('Asia/Dubai')
                ->diffInHours(Carbon::parse($booking->scheduled_start)->timezone('Asia/Dubai'), false);

            if ($hoursUntilCurrent <= 24) {
                $updates['refund_forfeited_at'] = now();
            }
        }

        $booking->update($updates);

        return $booking;
    }

    private static function assertNotDayOff(Therapist $therapist, Carbon $newStart): void
    {
        $dayName = $newStart->copy()->timezone('Asia/Dubai')->format('l');

        abort_if($therapist->day_off === $dayName, 422, "Therapist is off on {$dayName}s.");
    }

    /**
     * The candidate window — from the new session start through its
     * buffer_end — must fit entirely inside the therapist's actual shift
     * (shift_start/shift_end, wrapping past midnight when crosses_midnight
     * is set). Unlike BookingController::getAvailableSlots (which hardcodes
     * a single 16:00-04:00 window for every therapist), this uses the
     * therapist's own shift fields, as required for admin rescheduling.
     */
    private static function assertWithinShift(Therapist $therapist, Carbon $newStart, Carbon $bufferEnd): void
    {
        $shiftStartTime = Carbon::parse($therapist->shift_start)->format('H:i:s');
        $shiftEndTime   = Carbon::parse($therapist->shift_end)->format('H:i:s');

        $dateStr    = $newStart->toDateString();
        $shiftStart = Carbon::parse($dateStr . ' ' . $shiftStartTime);
        $shiftEnd   = Carbon::parse($dateStr . ' ' . $shiftEndTime);

        if ($therapist->crosses_midnight) {
            if ($newStart->format('H:i:s') < $shiftStartTime) {
                // Candidate's time-of-day is before shift_start (e.g. 02:00
                // with shift_start 16:00) — it belongs to the shift that
                // began the previous calendar day.
                $shiftStart->subDay();
            } else {
                $shiftEnd->addDay();
            }
        }

        abort_if(
            $newStart->lt($shiftStart) || $bufferEnd->gt($shiftEnd),
            422,
            "The selected time is outside the therapist's working hours."
        );
    }

    private static function assertNoUnavailableSlot(Therapist $therapist, Carbon $newStart, Carbon $scheduledEnd): void
    {
        abort_if(
            self::hasUnavailableSlot($therapist, $newStart, $scheduledEnd),
            422,
            'Therapist has marked this time as unavailable.'
        );
    }

    /**
     * Compares full datetimes, not raw time-of-day strings — consistent
     * with TherapistAvailabilityService::hasUnavailableSlot() (fixed at
     * Checkpoint #24). Schedule.jsx's UnavailableModal always creates
     * single-hour, same-date blocks via its own effHour/effDate rollover —
     * except the 23:00 hour, whose end_time is submitted as "00:00" (via
     * (effHour+1)%24) to mean "midnight at the end of this date," not an
     * earlier time on the same date. The previous end_time > start_time
     * string/time comparison broke for exactly that record
     * ('00:00:00' > '23:00:00' is false), so an admin reschedule candidate
     * overlapping that hour was never rejected here, even though the
     * customer booking path already correctly rejected it. Treating an
     * end_time that is <= its own start_time as rolling into the following
     * date is the only reading consistent with how these rows are created.
     */
    private static function hasUnavailableSlot(Therapist $therapist, Carbon $newStart, Carbon $scheduledEnd): bool
    {
        // therapist_unavailable_slots.therapist_id references users.id
        // (see TherapistScheduleController::storeUnavailable), not
        // therapists.id — must key off the therapist's user_id here.
        return TherapistUnavailableSlot::where('therapist_id', $therapist->user_id)
            ->where('date', $newStart->toDateString())
            ->get(['date', 'start_time', 'end_time', 'is_full_day'])
            ->contains(function ($slot) use ($newStart, $scheduledEnd) {
                if ($slot->is_full_day) {
                    return true;
                }

                $blockDate  = Carbon::parse($slot->date)->toDateString();
                $blockStart = Carbon::parse($blockDate . ' ' . $slot->start_time);
                $blockEnd   = Carbon::parse($blockDate . ' ' . $slot->end_time);

                if ($blockEnd->lte($blockStart)) {
                    $blockEnd->addDay();
                }

                return $blockStart->lt($scheduledEnd) && $blockEnd->gt($newStart);
            });
    }

    /**
     * The shift window that STARTS on the given calendar date (e.g. a
     * 16:00->04:00 shift selected for Oct 8 runs Oct 8 16:00 through
     * Oct 9 04:00). This is the natural reading for a date-picker — unlike
     * assertWithinShift()'s backward/forward check (which must also decide
     * whether an arbitrary submitted instant belongs to the *previous*
     * day's shift), a date the admin explicitly picked always means "the
     * shift beginning on this day".
     */
    private static function shiftWindowStartingOn(Therapist $therapist, string $date): array
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
     * Read-only availability preview for the admin reschedule UI — never
     * mutates anything, never requires a transaction/lock. Reuses the exact
     * same facts and checks reschedule() validates against (day-off,
     * therapist shift, TherapistUnavailableSlot, and
     * TherapistAvailabilityService's conflict check with this booking
     * excluded from its own conflict calculation) so the UI can only ever
     * offer times the backend would actually accept — it never invents a
     * second scheduling/conflict engine.
     *
     * Called with no $date: returns just the static facts needed to drive
     * a date-picker (which weekday is the day off, the service duration).
     * Called with a $date: additionally returns whether that date is the
     * day off, and — if not — every 30-minute slot across the shift that
     * starts on that date, each flagged available/unavailable with why.
     */
    public static function previewAvailability(Booking $booking, ?string $date = null): array
    {
        $booking->loadMissing('serviceVariant', 'therapist');
        $variant   = $booking->serviceVariant;
        $therapist = $booking->therapist;

        abort_if(
            !$variant || !$therapist,
            422,
            'This booking is missing the service or therapist data required to reschedule.'
        );

        $result = [
            'day_off_weekday'  => $therapist->day_off,
            'duration_minutes' => $variant->duration_minutes,
        ];

        if ($date === null) {
            return $result;
        }

        $dayName = Carbon::parse($date)->format('l');

        if ($therapist->day_off === $dayName) {
            return $result + ['date' => $date, 'is_day_off' => true, 'slots' => []];
        }

        $travelMinutes = $therapist->getTravelTime($booking->zone_name);
        [$shiftStart, $shiftEnd] = self::shiftWindowStartingOn($therapist, $date);
        $lastValid = $shiftEnd->copy()->subMinutes($variant->duration_minutes + 30);

        $slots   = [];
        $current = $shiftStart->copy();

        while ($current->lte($lastValid)) {
            $blocks = Booking::computeTimeBlocks(
                $current->toDateTimeString(),
                $variant->duration_minutes,
                $travelMinutes
            );

            $isPast        = $current->lte(now());
            $isUnavailable = self::hasUnavailableSlot($therapist, $current, $blocks['scheduled_end']);
            $hasConflict   = TherapistAvailabilityService::hasConflict(
                $therapist->id,
                $blocks['travel_start'],
                $blocks['buffer_end'],
                $booking->id
            );

            $available = !$isPast && !$isUnavailable && !$hasConflict;
            $reason    = $isPast ? 'past' : ($isUnavailable ? 'unavailable_slot' : ($hasConflict ? 'conflict' : null));

            $slots[] = [
                'time'      => $current->format('H:i'),
                'label'     => $current->format('g:i A'),
                'available' => $available,
                'reason'    => $reason,
            ];

            $current->addMinutes(30);
        }

        return $result + ['date' => $date, 'is_day_off' => false, 'slots' => $slots];
    }
}
