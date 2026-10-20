<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\TherapistUnavailableSlot;
use App\Models\TherapistZone;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/BookingCreationRaceTest.php. Run with DB_CONNECTION=
 * pgsql pointed at a disposable test database, never sqlite and never the
 * real dev database.
 *
 * Covers BookingController::getAvailableSlots() after it was changed to stop
 * hardcoding a 16:00-04:00 window for every therapist and to stop ignoring
 * TherapistUnavailableSlot — it now reads each therapist's own
 * shift_start/shift_end/crosses_midnight/day_off via
 * TherapistAvailabilityService, the same source BookingController::store()
 * already enforces. The core assertion running through this whole file is
 * consistency: whatever GET says is available must be exactly what the real
 * POST /api/bookings would accept, and vice versa.
 */
class AvailableSlotsConsistencyTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;
    private Service $service;
    private ServiceVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customer = User::factory()->create(['role' => 'customer']);

        $this->service = Service::create([
            'name'             => 'Deep Relaxation Massage',
            'duration_minutes' => 60,
            'price'            => 300,
            'is_active'        => true,
        ]);

        $this->variant = ServiceVariant::create([
            'service_id'       => $this->service->id,
            'duration_minutes' => 60,
            'price'            => 300,
        ]);
    }

    // Column defaults are Tuesday day-off, 16:00-04:00 shift, crosses_midnight
    // true (add_shift_columns_to_therapists migration) — every real seeded
    // therapist uses exactly this. Overrides let individual tests configure
    // a therapist differently.
    private function makeTherapist(array $overrides = []): Therapist
    {
        $user = User::factory()->create(['role' => 'therapist']);

        return Therapist::create(array_merge([
            'user_id'       => $user->id,
            'base_location' => 'Dubai',
            'gender'        => 'female',
            'is_active'     => true,
        ], $overrides));
    }

    // "next Monday" is always strictly in the future and never the default
    // day off ('Tuesday'), regardless of what day the suite runs on — same
    // pattern as BookingCreationRaceTest::shiftDateTime().
    private function nonDayOffDate(): string
    {
        return Carbon::parse('next Monday')->toDateString();
    }

    private function getSlotsFor(Therapist $therapist, string $date, string $zoneName = 'Test Zone')
    {
        return $this->actingAs($this->customer)->getJson(
            '/api/available-slots?service_id=' . $this->variant->id .
            '&zone_name=' . urlencode($zoneName) .
            '&date=' . $date .
            '&therapist_id=' . $therapist->id
        );
    }

    private function getSlotsAnyTherapist(string $date, string $zoneName = 'Test Zone')
    {
        return $this->actingAs($this->customer)->getJson(
            '/api/available-slots?service_id=' . $this->variant->id .
            '&zone_name=' . urlencode($zoneName) .
            '&date=' . $date
        );
    }

    private function slotsByTime($response): \Illuminate\Support\Collection
    {
        return collect($response->json('slots'))->keyBy('time');
    }

    private function bookingPayload(Therapist $therapist, string $datetime, string $zoneName = 'Test Zone'): array
    {
        return [
            'service_id'     => $this->variant->id,
            'therapist_id'   => $therapist->id,
            'zone_name'      => $zoneName,
            'location'       => 'Test location',
            'datetime'       => $datetime,
            'payment_type'   => 'full',
            'payment_method' => 'cashless',
        ];
    }

    private function makeActiveBooking(Therapist $therapist, string $scheduledStart, string $status = 'accepted', int $travelMinutes = 30): Booking
    {
        $start = Carbon::parse($scheduledStart);
        $blocks = Booking::computeTimeBlocks($start->toDateTimeString(), 60, $travelMinutes);

        return Booking::create([
            'customer_id'        => User::factory()->create(['role' => 'customer'])->id,
            'therapist_id'       => $therapist->id,
            'service_id'         => $this->service->id,
            'service_variant_id' => $this->variant->id,
            'location'           => 'Test location',
            'zone_name'          => 'Test Zone',
            'scheduled_start'    => $start,
            'scheduled_end'      => $blocks['scheduled_end'],
            'travel_start'       => $blocks['travel_start'],
            'buffer_end'         => $blocks['buffer_end'],
            'payment_method'     => 'cashless',
            'payment_type'       => 'full',
            'status'             => $status,
            'payment_status'     => 'paid',
            'downpayment_amount' => 0,
            'remaining_amount'   => 0,
            'downpayment_status' => 'pending',
        ]);
    }

    // ── 1: default 16:00-04:00 overnight shift unchanged ──────────────────

    public function test_default_overnight_shift_produces_the_same_window_as_before(): void
    {
        $therapist = $this->makeTherapist();
        $date      = $this->nonDayOffDate();

        $response = $this->getSlotsFor($therapist, $date);

        $response->assertOk();
        $slots = $response->json('slots');
        $this->assertNotEmpty($slots);
        $this->assertSame('16:00', $slots[0]['time']);
        // Batch #29: datetime is now toIso8601String() — explicit +04:00
        // offset, unambiguous for every JS engine (was the bare
        // "Y-m-d H:i:s" toDateTimeString(), whose parsing on the client is
        // implementation-defined and was confirmed to misparse on at least
        // one real customer's device not set to Asia/Dubai).
        $this->assertSame($date . 'T16:00:00+04:00', $slots[0]['datetime']);

        $last = end($slots);
        // shiftEnd (04:00 next day) - duration(60) - buffer(30) = 02:30
        $this->assertSame('02:30', $last['time']);
    }

    // ── 2: therapist configured with different working hours ─────────────

    public function test_therapist_with_different_working_hours_uses_own_shift_window(): void
    {
        $therapist = $this->makeTherapist([
            'shift_start'      => '09:00:00',
            'shift_end'        => '17:00:00',
            'crosses_midnight' => false,
        ]);
        $date = $this->nonDayOffDate();

        $response = $this->getSlotsFor($therapist, $date);

        $response->assertOk();
        $slots = $response->json('slots');
        $this->assertNotEmpty($slots);
        $this->assertSame('09:00', $slots[0]['time']);

        $last = end($slots);
        // 17:00 - duration(60) - buffer(30) = 15:30
        $this->assertSame('15:30', $last['time']);

        foreach ($slots as $slot) {
            $this->assertGreaterThanOrEqual('09:00', $slot['time']);
            $this->assertLessThanOrEqual('15:30', $slot['time']);
        }
    }

    // ── 3: day-off exclusion ───────────────────────────────────────────────

    public function test_day_off_date_returns_no_slots(): void
    {
        $therapist = $this->makeTherapist(['day_off' => 'Monday']);
        $date      = $this->nonDayOffDate(); // always a Monday

        $response = $this->getSlotsFor($therapist, $date);

        $response->assertOk();
        $response->assertJson(['day_off' => true, 'slots' => []]);
    }

    // ── 4: manually blocked slot exclusion ─────────────────────────────────

    public function test_manually_blocked_slot_is_excluded_without_affecting_neighbors(): void
    {
        $therapist = $this->makeTherapist();
        $date      = $this->nonDayOffDate();

        TherapistUnavailableSlot::create([
            'therapist_id' => $therapist->user_id,
            'date'         => $date,
            'start_time'   => '19:00:00',
            'end_time'     => '21:00:00',
            'is_full_day'  => false,
        ]);

        $slots = $this->slotsByTime($this->getSlotsFor($therapist, $date));

        $this->assertFalse($slots['19:00']['available']);
        $this->assertSame('unavailable_slot', $slots['19:00']['reason']);
        $this->assertFalse($slots['20:00']['available']);

        // Exactly at the block's end_time the session no longer overlaps —
        // confirms the block doesn't bleed into neighboring valid slots.
        $this->assertTrue($slots['21:00']['available']);
        $this->assertTrue($slots['16:00']['available']);
    }

    // ── 5 & 9: active booking + travel/buffer conflict boundary ───────────

    public function test_active_booking_blocks_its_buffer_window_but_not_beyond_it(): void
    {
        $therapist = $this->makeTherapist();
        $date      = $this->nonDayOffDate();

        // 19:00-20:00 session, 30-min default travel → travel_start 18:30,
        // buffer_end 20:30.
        $this->makeActiveBooking($therapist, $date . ' 19:00:00');

        $slots = $this->slotsByTime($this->getSlotsFor($therapist, $date));

        $this->assertFalse($slots['19:00']['available']);
        $this->assertSame('booked', $slots['19:00']['reason']);
        // 20:00 session overlaps the buffer window (travel_start 19:30 <= buffer_end 20:30)
        $this->assertFalse($slots['20:00']['available']);
        // 21:30 session's travel_start (21:00) is after the booking's buffer_end
        // (20:30) — genuinely free, must not be falsely blocked.
        $this->assertTrue($slots['21:30']['available']);
    }

    // ── 6: a different therapist remains available ────────────────────────

    public function test_different_therapist_remains_available_when_one_is_booked(): void
    {
        $therapistA = $this->makeTherapist();
        $therapistB = $this->makeTherapist();
        $date       = $this->nonDayOffDate();

        $this->makeActiveBooking($therapistA, $date . ' 19:00:00');

        $slotsB = $this->slotsByTime($this->getSlotsFor($therapistB, $date));

        $this->assertTrue($slotsB['19:00']['available']);
    }

    // ── 7: all eligible therapists unavailable (no therapist selected) ────

    public function test_all_eligible_therapists_unavailable_shows_slot_unavailable(): void
    {
        $therapist = $this->makeTherapist();
        TherapistZone::create([
            'therapist_id'   => $therapist->id,
            'zone_name'      => 'Test Zone',
            'travel_minutes' => 30,
        ]);
        $date = $this->nonDayOffDate();

        $this->makeActiveBooking($therapist, $date . ' 19:00:00');

        $slots = $this->slotsByTime($this->getSlotsAnyTherapist($date));

        $this->assertFalse($slots['19:00']['available']);
        $this->assertSame('booked', $slots['19:00']['reason']);
        // A time with no conflict is available via the any-therapist path.
        $this->assertTrue($slots['16:00']['available']);
    }

    // ── 8: overnight blocked-time boundary (next-calendar-day) ────────────

    public function test_unavailable_slot_on_the_rolled_forward_calendar_date_is_respected(): void
    {
        // day_off is deliberately NOT Tuesday (the default) here — nextDate
        // below always lands on a Tuesday, and this test is isolating the
        // unavailable-slot boundary, not the day-off boundary already
        // covered by its own test above.
        $therapist     = $this->makeTherapist(['day_off' => 'Wednesday']);
        $requestedDate = $this->nonDayOffDate();
        $nextDate      = Carbon::parse($requestedDate)->addDay()->toDateString();

        // Block 01:00-03:00 on the NEXT calendar date — the date the 02:00
        // slot (generated as part of $requestedDate's overnight shift)
        // actually falls on.
        TherapistUnavailableSlot::create([
            'therapist_id' => $therapist->user_id,
            'date'         => $nextDate,
            'start_time'   => '01:00:00',
            'end_time'     => '03:00:00',
            'is_full_day'  => false,
        ]);

        $slots = $this->slotsByTime($this->getSlotsFor($therapist, $requestedDate));

        $this->assertFalse($slots['02:00']['available']);
        $this->assertSame('unavailable_slot', $slots['02:00']['reason']);
        // The pre-midnight portion of the same shift is unaffected.
        $this->assertTrue($slots['20:00']['available']);
        // Session ends exactly when the block starts (00:00-01:00 vs a
        // 01:00-03:00 block) — no overlap, confirms the block doesn't bleed
        // outside its own window.
        $this->assertTrue($slots['00:00']['available']);
    }

    // ── Overnight-wrap unavailable-slot record (end_time "00:00") ─────────
    //
    // Schedule.jsx's UnavailableModal always submits a same-date,
    // single-hour block — except clicking the 23:00 cell, whose end_time is
    // (23+1)%24 = "00:00", meaning "midnight at the end of this date," not
    // an earlier time on the same date. These tests cover that exact record
    // shape, which the previous string/time comparison never matched.

    public function test_overnight_block_ending_at_midnight_blocks_its_own_hour(): void
    {
        $therapist = $this->makeTherapist();
        $date      = $this->nonDayOffDate();

        // The exact row Schedule.jsx produces for the 23:00 grid cell.
        TherapistUnavailableSlot::create([
            'therapist_id' => $therapist->user_id,
            'date'         => $date,
            'start_time'   => '23:00:00',
            'end_time'     => '00:00:00',
            'is_full_day'  => false,
        ]);

        $slots = $this->slotsByTime($this->getSlotsFor($therapist, $date));

        $this->assertFalse($slots['23:00']['available']);
        $this->assertSame('unavailable_slot', $slots['23:00']['reason']);

        // GET and POST must agree on this exact slot.
        $postResponse = $this->actingAs(User::factory()->create(['role' => 'customer']))
            ->postJson('/api/bookings', $this->bookingPayload($therapist, $date . ' 23:00:00'));
        $postResponse->assertStatus(409);
    }

    public function test_session_spanning_midnight_overlapping_the_wrap_block_is_rejected(): void
    {
        $therapist = $this->makeTherapist();
        $date      = $this->nonDayOffDate();

        TherapistUnavailableSlot::create([
            'therapist_id' => $therapist->user_id,
            'date'         => $date,
            'start_time'   => '23:00:00',
            'end_time'     => '00:00:00',
            'is_full_day'  => false,
        ]);

        $slots = $this->slotsByTime($this->getSlotsFor($therapist, $date));

        // 22:30 session runs 22:30-23:30 (60-min duration) — starts before
        // the block but overlaps its first 30 minutes.
        $this->assertFalse($slots['22:30']['available']);
        $this->assertSame('unavailable_slot', $slots['22:30']['reason']);
    }

    public function test_slots_adjacent_to_the_wrap_block_remain_available(): void
    {
        // day_off is deliberately NOT Tuesday here — the 00:00 slot checked
        // below rolls onto the next calendar date, which is always a
        // Tuesday (the default day off) relative to nonDayOffDate(); this
        // test isolates the unavailable-slot boundary, not day-off.
        $therapist = $this->makeTherapist(['day_off' => 'Wednesday']);
        $date      = $this->nonDayOffDate();

        TherapistUnavailableSlot::create([
            'therapist_id' => $therapist->user_id,
            'date'         => $date,
            'start_time'   => '23:00:00',
            'end_time'     => '00:00:00',
            'is_full_day'  => false,
        ]);

        $slots = $this->slotsByTime($this->getSlotsFor($therapist, $date));

        // 22:00 session ends exactly 23:00, when the block starts — no overlap.
        $this->assertTrue($slots['22:00']['available']);
        // 00:00 (the next calendar date) session starts exactly when the
        // block ends — no overlap, confirms the wrap rolls to the correct
        // following date and no further.
        $this->assertTrue($slots['00:00']['available']);
    }

    // ── 10: GET availability must agree with the real POST validation ────

    public function test_get_availability_agrees_with_post_for_every_checked_case(): void
    {
        $date = $this->nonDayOffDate();

        // Case A: a genuinely free default-shift slot.
        $free = $this->makeTherapist();
        $this->assertGetAndPostAgree($free, $date . ' 20:00:00');

        // Case B: day off.
        $dayOff = $this->makeTherapist(['day_off' => 'Monday']);
        $this->assertGetAndPostAgree($dayOff, $date . ' 20:00:00');

        // Case C: outside a custom shift.
        $dayShift = $this->makeTherapist([
            'shift_start' => '09:00:00', 'shift_end' => '17:00:00', 'crosses_midnight' => false,
        ]);
        $this->assertGetAndPostAgree($dayShift, $date . ' 20:00:00');

        // Case D: manually blocked.
        $blocked = $this->makeTherapist();
        TherapistUnavailableSlot::create([
            'therapist_id' => $blocked->user_id, 'date' => $date,
            'start_time' => '19:00:00', 'end_time' => '21:00:00', 'is_full_day' => false,
        ]);
        $this->assertGetAndPostAgree($blocked, $date . ' 20:00:00');

        // Case E: conflicting with an existing active booking.
        $conflicted = $this->makeTherapist();
        $this->makeActiveBooking($conflicted, $date . ' 19:00:00');
        $this->assertGetAndPostAgree($conflicted, $date . ' 19:30:00');
    }

    // ── 11: the exact round-trip Bookings.jsx performs (Batch #29) ────────
    // GET a slot's raw 'datetime' value, submit it UNMODIFIED as the
    // booking payload (exactly what `datetime: selectedTime` in Bookings.jsx
    // does), and confirm the stored scheduled_start is the same Dubai
    // wall-clock moment the slot was advertised as — with no shift
    // introduced by the offset-qualified format now returned.
    public function test_a_slots_raw_datetime_value_round_trips_through_booking_creation_unchanged(): void
    {
        $therapist = $this->makeTherapist();
        $date      = $this->nonDayOffDate();

        $slots = $this->slotsByTime($this->getSlotsFor($therapist, $date));
        $slot  = $slots['19:00'];

        $this->assertSame($date . 'T19:00:00+04:00', $slot['datetime']);

        $response = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist, $slot['datetime']));

        $response->assertCreated();
        $booking = Booking::where('customer_id', $this->customer->id)->latest('id')->first();
        $this->assertSame($date . ' 19:00:00', $booking->scheduled_start->toDateTimeString());
    }

    private function assertGetAndPostAgree(Therapist $therapist, string $datetime): void
    {
        $date = Carbon::parse($datetime)->toDateString();
        $time = Carbon::parse($datetime)->format('H:i');

        $getResponse = $this->getSlotsFor($therapist, $date);
        // A time GET never generates at all (e.g. outside a custom shift)
        // is just as unavailable as one explicitly marked so — both must
        // still agree with POST rejecting it.
        $getAvailable = $getResponse->json('day_off')
            ? false
            : ($this->slotsByTime($getResponse)[$time]['available'] ?? false);

        $postResponse = $this->actingAs(User::factory()->create(['role' => 'customer']))
            ->postJson('/api/bookings', $this->bookingPayload($therapist, $datetime));

        if ($getAvailable) {
            $postResponse->assertCreated();
        } else {
            $postResponse->assertStatus(409);
        }
    }
}
