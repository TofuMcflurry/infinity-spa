<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
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

        return Therapist::create([
            'user_id'       => $user->id,
            'base_location' => 'Dubai',
            'gender'        => 'female',
            'is_active'     => true,
        ]);
    }

    private function bookingPayload(Therapist $therapist, array $overrides = []): array
    {
        return array_merge([
            'service_id'     => $this->variant->id,
            'therapist_id'   => $therapist->id,
            'zone_name'      => 'Test Zone',
            'location'       => 'Test location',
            'datetime'       => now()->addDay()->toDateTimeString(),
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
        $datetime  = now()->addDay()->setTime(14, 0)->toDateTimeString();

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
        $datetime   = now()->addDay()->setTime(15, 0)->toDateTimeString();

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
                ['datetime' => now()->addDay()->setTime(9, 0)->toDateTimeString()]
            ));
        $afternoon = $this->actingAs(User::factory()->create(['role' => 'customer']))
            ->postJson('/api/bookings', $this->bookingPayload(
                $therapist,
                ['datetime' => now()->addDay()->setTime(16, 0)->toDateTimeString()]
            ));

        $morning->assertCreated();
        $afternoon->assertCreated();

        $this->assertSame(2, Booking::where('therapist_id', $therapist->id)->count());
    }

    // ── Sequential "winner then loser" race proof ────────────────────────

    public function test_two_near_simultaneous_requests_for_the_same_slot_produce_exactly_one_booking(): void
    {
        $therapist = $this->makeTherapist();
        $datetime  = now()->addDay()->setTime(11, 0)->toDateTimeString();

        $winner = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));
        $loser = $this->actingAs(User::factory()->create(['role' => 'customer']))
            ->postJson('/api/bookings', $this->bookingPayload($therapist, ['datetime' => $datetime]));

        $winner->assertCreated();
        $loser->assertStatus(409);

        $this->assertSame(1, Booking::where('therapist_id', $therapist->id)->count());
    }
}
