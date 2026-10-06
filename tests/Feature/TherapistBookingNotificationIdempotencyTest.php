<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\LoyaltyReward;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use App\Notifications\BookingNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification as NotificationFacade;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/StaleActiveSessionTest.php and
 * tests/Feature/BookingApprovalFlowTest.php. Run with DB_CONNECTION=pgsql
 * pointed at a disposable test database, not sqlite (phpunit.xml's default)
 * and never the real dev database — this suite's lockForUpdate() guard is
 * meaningless against sqlite's connection-wide locking.
 *
 * Covers the accept()/start() duplicate-notification hotfix:
 * TherapistBookingController::accept() had no state guard at all (any repeat
 * call re-sent the "accepted" notification/email), and start() had a status
 * guard but no row lock (two near-simultaneous requests could both pass the
 * check before either write committed). Both now re-check status inside a
 * DB::transaction() + lockForUpdate() before transitioning, so only the
 * request that actually performs the transition ever reaches notify().
 */
class TherapistBookingNotificationIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;
    private User $therapistUser;
    private Therapist $therapist;
    private Service $service;
    private ServiceVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customer = User::factory()->create(['role' => 'customer']);

        $this->therapistUser = User::factory()->create(['role' => 'therapist']);
        $this->therapist = Therapist::create([
            'user_id'       => $this->therapistUser->id,
            'base_location' => 'Dubai',
            'gender'        => 'female',
            'is_active'     => true,
        ]);

        $this->service = Service::create([
            'name'             => 'Swedish Massage',
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

    private function makeBooking(array $overrides = []): Booking
    {
        return Booking::create(array_merge([
            'customer_id'        => $this->customer->id,
            'therapist_id'       => $this->therapist->id,
            'service_id'         => $this->service->id,
            'service_variant_id' => $this->variant->id,
            'location'           => 'Test location',
            'zone_name'          => 'Test Zone',
            'payment_method'     => 'cashless',
            'payment_type'       => 'full',
            'status'             => 'pending',
            'payment_status'     => 'paid',
            'scheduled_start'    => now()->addDay(),
            'scheduled_end'      => now()->addDay()->addHour(),
        ], $overrides));
    }

    // ── ACCEPT ────────────────────────────────────────────────────────────

    public function test_accept_once_transitions_booking_and_sends_exactly_one_notification(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking(['status' => 'pending']);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/accept");

        $response->assertOk();
        $booking->refresh();
        $this->assertSame('accepted', $booking->status);

        NotificationFacade::assertSentTimes(BookingNotification::class, 1);
        NotificationFacade::assertSentTo(
            $this->customer,
            BookingNotification::class,
            fn($notification) => $notification->type === 'accepted'
        );
    }

    public function test_accept_repeated_after_already_accepted_sends_no_additional_notification(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking(['status' => 'pending']);

        $first = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/accept");
        $first->assertOk();

        // Simulate a double-click / retried request against the
        // already-accepted booking.
        $second = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/accept");
        $second->assertStatus(422);

        $booking->refresh();
        $this->assertSame('accepted', $booking->status);

        // Exactly one notification total, from the first call only.
        NotificationFacade::assertSentTimes(BookingNotification::class, 1);
    }

    public function test_accept_rejects_a_booking_that_is_no_longer_acceptable(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking(['status' => 'rejected']);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/accept");

        $response->assertStatus(422);
        $booking->refresh();
        $this->assertSame('rejected', $booking->status, 'A rejected booking must not be accept-able after the fact.');

        NotificationFacade::assertNothingSent();
    }

    public function test_accept_still_works_for_a_pending_payment_booking(): void
    {
        // Therapists can accept/reject a 'pending_payment' booking before
        // Stripe confirms payment — see BookingApprovalFlowTest and the
        // Therapist/Bookings.jsx accept-button eligibility. The new guard
        // must preserve this.
        NotificationFacade::fake();

        $booking = $this->makeBooking(['status' => 'pending_payment', 'payment_status' => 'pending']);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/accept");

        $response->assertOk();
        $booking->refresh();
        $this->assertSame('accepted', $booking->status);

        NotificationFacade::assertSentTimes(BookingNotification::class, 1);
    }

    // ── START ─────────────────────────────────────────────────────────────

    public function test_start_once_transitions_booking_and_sends_exactly_one_notification(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking(['status' => 'accepted']);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/start");

        $response->assertOk();
        $booking->refresh();
        $this->assertSame('en_route', $booking->status);

        NotificationFacade::assertSentTimes(BookingNotification::class, 1);
        NotificationFacade::assertSentTo(
            $this->customer,
            BookingNotification::class,
            fn($notification) => $notification->type === 'en_route'
        );
    }

    public function test_concurrent_duplicate_start_requests_produce_exactly_one_transition_and_one_notification(): void
    {
        // True multi-process concurrency can't be driven from a single
        // synchronous PHPUnit process. This exercises the code path that
        // makes concurrent safety hold in production: the row lock forces
        // the second request to observe the *post-commit* state before its
        // own guard check runs, which is exactly what happens to the loser
        // of a real race once the winner's transaction commits and releases
        // the lock.
        NotificationFacade::fake();

        $booking = $this->makeBooking(['status' => 'accepted']);

        $winner = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/start");
        $loser = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/start");

        $winner->assertOk();
        $loser->assertStatus(422);

        $booking->refresh();
        $this->assertSame('en_route', $booking->status, 'Exactly one transition should have occurred.');

        NotificationFacade::assertSentTimes(BookingNotification::class, 1);
    }

    public function test_start_still_blocks_when_therapist_already_has_an_active_session(): void
    {
        NotificationFacade::fake();

        $active = $this->makeBooking(['status' => 'en_route']);
        $next   = $this->makeBooking(['status' => 'accepted']);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$next->id}/start");

        $response->assertStatus(422);
        $next->refresh();
        $this->assertSame('accepted', $next->status);

        NotificationFacade::assertNothingSent();
    }

    // ── Stale active-session guard (P0 fix) ─────────────────────────────
    // See tests/Feature/StaleActiveSessionTest.php for the thresholds
    // these mirror (FlagStaleActiveSessions::EN_ROUTE_STALE_AFTER_MINUTES /
    // ARRIVED_STALE_AFTER_HOURS) — a stale en_route/arrived session must
    // no longer block the therapist from starting new work, while a
    // genuinely active one (test_start_still_blocks_when_therapist_already_has_an_active_session
    // above) still must.

    public function test_start_is_not_blocked_by_a_stale_en_route_session_from_a_previous_day(): void
    {
        NotificationFacade::fake();

        $stale = $this->makeBooking([
            'status'          => 'en_route',
            'scheduled_start' => now()->subHours(3), // past the 60-minute threshold
            'scheduled_end'   => now()->subHours(2),
        ]);
        $next = $this->makeBooking(['status' => 'accepted']);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$next->id}/start");

        $response->assertOk();
        $next->refresh();
        $this->assertSame('en_route', $next->status);

        // The stale booking itself must be left exactly as-is — this guard
        // only stops it from blocking new work, it never silently resolves it.
        $stale->refresh();
        $this->assertSame('en_route', $stale->status);
        $this->assertNull($stale->flagged_at);
        $this->assertNull($stale->resolved_at);
    }

    public function test_start_is_not_blocked_by_a_stale_arrived_session_from_a_previous_day(): void
    {
        NotificationFacade::fake();

        $stale = $this->makeBooking([
            'status'          => 'arrived',
            'scheduled_start' => now()->subHours(5),
            'scheduled_end'   => now()->subHours(4), // past the 2-hour threshold
        ]);
        $next = $this->makeBooking(['status' => 'accepted']);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$next->id}/start");

        $response->assertOk();
        $next->refresh();
        $this->assertSame('en_route', $next->status);

        $stale->refresh();
        $this->assertSame('arrived', $stale->status);
        $this->assertNull($stale->flagged_at);
        $this->assertNull($stale->resolved_at);
    }

    public function test_start_still_blocked_by_an_arrived_session_still_within_the_grace_window(): void
    {
        NotificationFacade::fake();

        // Not stale yet — scheduled_end only just passed, still inside the
        // 2-hour grace window — must still count as genuinely active.
        $recent = $this->makeBooking([
            'status'          => 'arrived',
            'scheduled_start' => now()->subMinutes(90),
            'scheduled_end'   => now()->subMinutes(30),
        ]);
        $next = $this->makeBooking(['status' => 'accepted']);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$next->id}/start");

        $response->assertStatus(422);
        $next->refresh();
        $this->assertSame('accepted', $next->status);
        NotificationFacade::assertNothingSent();
    }

    public function test_start_rejects_a_booking_that_is_not_accepted(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking(['status' => 'pending']);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/start");

        $response->assertStatus(422);
        $booking->refresh();
        $this->assertSame('pending', $booking->status);

        NotificationFacade::assertNothingSent();
    }

    // ── COMPLETE (P1 idempotency fix) ───────────────────────────────────
    // See tests/Feature/StaleActiveSessionTest.php for the admin stale-
    // resolution completion path, which already goes through its own lock
    // (AdminBookingController::lockStaleBooking()) and is unaffected by
    // this change — this section covers the therapist-facing complete()
    // endpoint, which previously had no lock at all.

    public function test_complete_once_transitions_booking_and_sends_exactly_one_notification(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking(['status' => 'arrived']);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/complete");

        $response->assertOk();
        $booking->refresh();
        $this->assertSame('completed', $booking->status);

        NotificationFacade::assertSentTimes(BookingNotification::class, 1);
        $this->assertSame(
            1,
            LoyaltyReward::where('customer_id', $this->customer->id)->sum('completed_count'),
            'Loyalty completed_count should increase by exactly one.'
        );
    }

    public function test_complete_rejects_a_booking_that_is_not_arrived(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking(['status' => 'accepted']);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/complete");

        $response->assertStatus(422);
        $booking->refresh();
        $this->assertSame('accepted', $booking->status);

        NotificationFacade::assertNothingSent();
        $this->assertSame(0, LoyaltyReward::where('customer_id', $this->customer->id)->sum('completed_count'));
    }

    public function test_duplicate_complete_requests_only_run_completion_side_effects_once(): void
    {
        // Same rationale as test_concurrent_duplicate_start_requests_...
        // above: true multi-process concurrency can't be driven from a
        // single synchronous PHPUnit process, but this exercises the exact
        // code path that makes concurrent safety hold in production — the
        // row lock forces the second request to observe the post-commit
        // 'completed' status before its own guard check runs, which is
        // exactly what happens to the loser of a real race once the
        // winner's transaction has committed.
        NotificationFacade::fake();

        $booking = $this->makeBooking(['status' => 'arrived']);

        $winner = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/complete");
        $loser = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/complete");

        $winner->assertOk();
        $loser->assertStatus(422);

        $booking->refresh();
        $this->assertSame('completed', $booking->status, 'Exactly one completion should have occurred.');

        // The side effects BookingCompletionService::complete() fires —
        // loyalty increment and completion notification — must each have
        // run exactly once, not twice.
        NotificationFacade::assertSentTimes(BookingNotification::class, 1);
        $this->assertSame(
            1,
            LoyaltyReward::where('customer_id', $this->customer->id)->sum('completed_count'),
            'Loyalty completed_count must not be double-counted by a duplicate completion request.'
        );
    }

    // ── End-to-end happy path is unchanged ───────────────────────────────

    public function test_full_accept_then_start_flow_still_works_and_sends_two_distinct_notifications(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking(['status' => 'pending']);

        $accept = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/accept");
        $accept->assertOk();

        $start = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/start");
        $start->assertOk();

        $booking->refresh();
        $this->assertSame('en_route', $booking->status);

        NotificationFacade::assertSentTimes(BookingNotification::class, 2);
        NotificationFacade::assertSentTo(
            $this->customer,
            BookingNotification::class,
            fn($notification) => $notification->type === 'accepted'
        );
        NotificationFacade::assertSentTo(
            $this->customer,
            BookingNotification::class,
            fn($notification) => $notification->type === 'en_route'
        );
    }
}
