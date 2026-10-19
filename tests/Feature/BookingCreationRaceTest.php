<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\TherapistUnavailableSlot;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/BookingApprovalFlowTest.php / StaleActiveSessionTest.php.
 * Run with DB_CONNECTION=pgsql pointed at a disposable test database, not
 * sqlite (phpunit.xml's default) and never the real dev database — this
 * suite's lockForUpdate() guard is meaningless against sqlite's
 * connection-wide locking.
 *
 * Covers the P1 fix for BookingController::store()'s check-then-insert race:
 * TherapistAvailabilityService::hasConflict() followed by Booking::create()
 * previously ran as two separate, unlocked statements, so two
 * near-simultaneous requests for the same therapist and an overlapping slot
 * could both pass the conflict check before either committed. The fix wraps
 * both in a DB::transaction() with the therapist row locked via
 * Therapist::where(...)->lockForUpdate() first — the same lock+recheck
 * pattern already used by TherapistBookingController's lifecycle methods,
 * applied to the therapist row since the booking being created doesn't
 * exist yet to lock directly.
 *
 * True multi-process concurrency can't be driven from a single synchronous
 * PHPUnit process — the "concurrent" tests below exercise the same code
 * path that makes concurrent safety hold in production: the row lock
 * forces the second request to observe the post-commit state before its
 * own conflict check runs, which is exactly what happens to the loser of a
 * real race once the winner's transaction commits and releases the lock.
 */
class BookingCreationRaceTest extends TestCase
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

    private function makeTherapist(): Therapist
    {
        $user = User::factory()->create(['role' => 'therapist']);

        // day_off/shift_start/shift_end/crosses_midnight are left to the
        // therapists table's own column defaults (Tuesday / 16:00 / 04:00 /
        // true — see the add_shift_columns_to_therapists migration), the
        // same defaults every seeded real therapist uses. Test datetimes
        // below are chosen to always fall inside that shift and never on
        // that day-off, regardless of what day the suite runs on.
        return Therapist::create([
            'user_id'       => $user->id,
            'base_location' => 'Dubai',
            'gender'        => 'female',
            'is_active'     => true,
        ]);
    }

    // "next Monday" is always strictly in the future and is never the
    // default day_off ('Tuesday'), regardless of what day the suite runs
    // on — avoids the flakiness of "tomorrow" occasionally landing on the
    // day off. $hour/$minute must fall inside the default 16:00-04:00
    // shift (i.e. >= 16:00 or < 04:00) for a booking to be acceptable.
    private function shiftDateTime(int $hour, int $minute = 0): string
    {
        return Carbon::parse('next Monday')->setTime($hour, $minute)->toDateTimeString();
    }

    private function bookingPayload(Therapist $therapist, array $overrides = []): array
    {
        return array_merge([
            'service_id'     => $this->variant->id,
            'therapist_id'   => $therapist->id,
            'zone_name'      => 'Test Zone',
            'location'       => 'Test location',
            'datetime'       => $this->shiftDateTime(20, 0),
            'payment_type'   => 'full',
            'payment_method' => 'cashless',
        ], $overrides);
    }

    // ── a. Free slot → booking succeeds ──────────────────────────────────

    public function test_booking_a_free_slot_succeeds(): void
    {
        $therapist = $this->makeTherapist();

        $response = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist));

        $response->assertCreated();
        $this->assertSame(1, Booking::where('therapist_id', $therapist->id)->count());
    }

    // ── b & c: same therapist + overlapping slot → second gets 409,
    //           exactly one booking exists ───────────────────────────────

    public function test_second_overlapping_booking_for_same_therapist_is_rejected_with_409(): void
    {
        $therapist = $this->makeTherapist();
        $datetime  = $this->shiftDateTime(20, 0);

        $first = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));
        $first->assertCreated();

        $second = $this->actingAs(User::factory()->create(['role' => 'customer']))
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));

        $second->assertStatus(409);
        $second->assertJson(['message' => 'Sorry, this slot is no longer available.']);

        $this->assertSame(
            1,
            Booking::where('therapist_id', $therapist->id)->count(),
            'Exactly one booking should exist for this therapist/slot — the second request must not have created an overlapping row.'
        );
    }

    // ── d. Different therapists + same time → both succeed ──────────────

    public function test_different_therapists_at_the_same_time_can_both_book_successfully(): void
    {
        $therapistA = $this->makeTherapist();
        $therapistB = $this->makeTherapist();
        $datetime   = $this->shiftDateTime(21, 0);

        $responseA = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapistA, ['datetime' => $datetime]));
        $responseB = $this->actingAs(User::factory()->create(['role' => 'customer']))
            ->postJson('/api/bookings', $this->bookingPayload($therapistB, ['datetime' => $datetime]));

        $responseA->assertCreated();
        $responseB->assertCreated();

        $this->assertSame(1, Booking::where('therapist_id', $therapistA->id)->count());
        $this->assertSame(1, Booking::where('therapist_id', $therapistB->id)->count());
    }

    // ── e. Same therapist + non-overlapping times → both succeed ────────

    public function test_same_therapist_at_non_overlapping_times_can_both_book_successfully(): void
    {
        $therapist = $this->makeTherapist();

        $morning = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload(
                $therapist,
                ['datetime' => $this->shiftDateTime(20, 0)]
            ));
        $afternoon = $this->actingAs(User::factory()->create(['role' => 'customer']))
            ->postJson('/api/bookings', $this->bookingPayload(
                $therapist,
                ['datetime' => $this->shiftDateTime(23, 0)]
            ));

        $morning->assertCreated();
        $afternoon->assertCreated();

        $this->assertSame(2, Booking::where('therapist_id', $therapist->id)->count());
    }

    // ── Sequential "winner then loser" race proof ────────────────────────

    public function test_two_near_simultaneous_requests_for_the_same_slot_produce_exactly_one_booking(): void
    {
        $therapist = $this->makeTherapist();
        $datetime  = $this->shiftDateTime(22, 0);

        $winner = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));
        $loser = $this->actingAs(User::factory()->create(['role' => 'customer']))
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));

        $winner->assertCreated();
        $loser->assertStatus(409);

        $this->assertSame(1, Booking::where('therapist_id', $therapist->id)->count());
    }

    // ── Partial overlap → rejected ────────────────────────────────────────

    public function test_partially_overlapping_booking_for_same_therapist_is_rejected_with_409(): void
    {
        $therapist = $this->makeTherapist();

        $first = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $this->shiftDateTime(20, 0)]));
        $first->assertCreated();

        // 20:30 start overlaps the first booking's 19:30-21:30 travel/buffer
        // window even though it doesn't share the same start time.
        $second = $this->actingAs(User::factory()->create(['role' => 'customer']))
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $this->shiftDateTime(20, 30)]));

        $second->assertStatus(409);
        $this->assertSame(1, Booking::where('therapist_id', $therapist->id)->count());
    }

    // ── A cancelled booking must not block rebooking the same slot ───────

    public function test_cancelled_booking_does_not_block_rebooking_the_same_slot(): void
    {
        $therapist = $this->makeTherapist();
        $datetime  = $this->shiftDateTime(20, 0);

        $first = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));
        $first->assertCreated();

        Booking::where('therapist_id', $therapist->id)->update(['status' => 'cancelled']);

        $second = $this->actingAs(User::factory()->create(['role' => 'customer']))
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));

        $second->assertCreated();
        $this->assertSame(2, Booking::where('therapist_id', $therapist->id)->count());
    }

    // ── en_route / arrived must still reserve the therapist (confirmed gap) ──

    public function test_booking_overlapping_an_en_route_booking_is_rejected_with_409(): void
    {
        $therapist = $this->makeTherapist();
        $datetime  = $this->shiftDateTime(20, 0);

        $first = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));
        $first->assertCreated();

        Booking::where('therapist_id', $therapist->id)->update(['status' => 'en_route']);

        $second = $this->actingAs(User::factory()->create(['role' => 'customer']))
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));

        $second->assertStatus(409);
        $this->assertSame(1, Booking::where('therapist_id', $therapist->id)->count());
    }

    public function test_booking_overlapping_an_arrived_booking_is_rejected_with_409(): void
    {
        $therapist = $this->makeTherapist();
        $datetime  = $this->shiftDateTime(20, 0);

        $first = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));
        $first->assertCreated();

        Booking::where('therapist_id', $therapist->id)->update(['status' => 'arrived']);

        $second = $this->actingAs(User::factory()->create(['role' => 'customer']))
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));

        $second->assertStatus(409);
        $this->assertSame(1, Booking::where('therapist_id', $therapist->id)->count());
    }

    // ── Day-off / shift / manual-unavailability must be enforced by a
    //    direct POST, not just by the slot list (confirmed gap) ──────────

    public function test_booking_on_therapist_day_off_is_rejected_with_409(): void
    {
        $therapist = $this->makeTherapist();
        $therapist->update(['day_off' => 'Monday']);

        // shiftDateTime() always lands on a Monday.
        $datetime = $this->shiftDateTime(20, 0);

        $response = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));

        $response->assertStatus(409);
        $this->assertSame(0, Booking::where('therapist_id', $therapist->id)->count());
    }

    public function test_booking_during_manually_blocked_slot_is_rejected_with_409(): void
    {
        $therapist = $this->makeTherapist();
        $datetime  = $this->shiftDateTime(20, 0);

        // therapist_unavailable_slots.therapist_id references users.id, not
        // therapists.id — see TherapistAvailabilityService::hasUnavailableSlot().
        TherapistUnavailableSlot::create([
            'therapist_id' => $therapist->user_id,
            'date'         => Carbon::parse($datetime)->toDateString(),
            'start_time'   => '19:00:00',
            'end_time'     => '21:00:00',
            'is_full_day'  => false,
        ]);

        $response = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));

        $response->assertStatus(409);
        $this->assertSame(0, Booking::where('therapist_id', $therapist->id)->count());
    }

    public function test_booking_outside_therapist_shift_hours_is_rejected_with_409(): void
    {
        $therapist = $this->makeTherapist();
        $datetime  = $this->shiftDateTime(10, 0); // 10 AM — outside the 16:00-04:00 shift

        $response = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));

        $response->assertStatus(409);
        $this->assertSame(0, Booking::where('therapist_id', $therapist->id)->count());
    }

    // ── Overnight (crosses-midnight) boundary ─────────────────────────────

    public function test_valid_overnight_booking_after_midnight_succeeds(): void
    {
        $therapist = $this->makeTherapist();
        $datetime  = $this->shiftDateTime(2, 0); // 2 AM — inside the overnight shift

        $response = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));

        $response->assertCreated();
    }

    public function test_overnight_booking_exceeding_shift_end_is_rejected_with_409(): void
    {
        $therapist = $this->makeTherapist();
        // 60-min service + 30-min buffer starting 03:40 ends 05:10 —
        // past the therapist's 04:00 shift end.
        $datetime = $this->shiftDateTime(3, 40);

        $response = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));

        $response->assertStatus(409);
        $this->assertSame(0, Booking::where('therapist_id', $therapist->id)->count());
    }
}
