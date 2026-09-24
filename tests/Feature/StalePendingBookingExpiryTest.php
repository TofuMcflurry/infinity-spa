<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Service;
use App\Models\Therapist;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/StaleActiveSessionTest.php. Run with DB_CONNECTION=
 * pgsql pointed at a disposable test database, not sqlite (phpunit.xml's
 * default) and never the real dev database.
 *
 * Covers the target business rule for a pending booking whose scheduled_start
 * has passed without a therapist decision:
 *   pending (past due) -> cancelled, cancellation_type = 'expired'
 * via the bookings:auto-cancel-past-due command — and that 'accepted' bookings
 * are no longer swept into the same treatment (see StaleActiveSessionTest for
 * the accepted-booking stale-review path instead).
 */
class StalePendingBookingExpiryTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;
    private User $therapistUser;
    private Therapist $therapist;
    private Service $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customer = User::factory()->create(['role' => 'customer']);

        $therapistUser = User::factory()->create(['role' => 'therapist']);
        $this->therapist = Therapist::create([
            'user_id'       => $therapistUser->id,
            'base_location' => 'Dubai',
            'gender'        => 'female',
            'is_active'     => true,
        ]);
        $this->therapistUser = $therapistUser;

        $this->service = Service::create([
            'name'             => 'Swedish Massage',
            'duration_minutes' => 60,
            'price'            => 300,
            'is_active'        => true,
        ]);
    }

    private function makeBooking(array $overrides = []): Booking
    {
        return Booking::create(array_merge([
            'customer_id'    => $this->customer->id,
            'therapist_id'   => $this->therapist->id,
            'service_id'     => $this->service->id,
            'location'       => 'Test location',
            'zone_name'      => 'Test Zone',
            'payment_method' => 'cash',
        ], $overrides));
    }

    // ── bookings:auto-cancel-past-due ───────────────────────────────────────

    public function test_future_pending_booking_is_untouched(): void
    {
        $booking = $this->makeBooking([
            'status'          => 'pending',
            'scheduled_start' => now()->addDay(),
            'scheduled_end'   => now()->addDay()->addHour(),
        ]);

        $this->artisan('bookings:auto-cancel-past-due')->assertSuccessful();

        $booking->refresh();
        $this->assertSame('pending', $booking->status);
        $this->assertNull($booking->cancellation_type);
    }

    public function test_pending_booking_past_scheduled_start_is_expired(): void
    {
        // Mirrors the real-world scenario: customer booked Sept 24, therapist
        // never responded, and nobody looked again until well after the slot.
        $booking = $this->makeBooking([
            'status'          => 'pending',
            'scheduled_start' => now()->subDays(10),
            'scheduled_end'   => now()->subDays(10)->addHour(),
        ]);

        $this->artisan('bookings:auto-cancel-past-due')->assertSuccessful();

        $booking->refresh();
        $this->assertSame('cancelled', $booking->status);
        $this->assertSame('expired', $booking->cancellation_type);
        $this->assertNotNull($booking->cancelled_at);
    }

    public function test_accepted_booking_past_scheduled_start_is_not_expired_by_this_command(): void
    {
        // The therapist already confirmed this one — auto-cancel-past-due
        // must not treat it like an unanswered pending request. It is instead
        // picked up by bookings:flag-stale-active-sessions for admin review
        // (see StaleActiveSessionTest::test_accepted_booking_past_due_and_never_started_is_flagged).
        $booking = $this->makeBooking([
            'status'          => 'accepted',
            'scheduled_start' => now()->subDays(10),
            'scheduled_end'   => now()->subDays(10)->addHour(),
        ]);

        $this->artisan('bookings:auto-cancel-past-due')->assertSuccessful();

        $booking->refresh();
        $this->assertSame('accepted', $booking->status, 'An accepted booking must not be auto-cancelled the same way a pending one is.');
        $this->assertNull($booking->cancellation_type);
    }

    public function test_pending_payment_booking_past_scheduled_start_is_left_to_its_own_command(): void
    {
        // pending_payment expiry is handled by ExpireStalePendingPaymentBookings
        // (created_at-based), not this one — must not double-handle it.
        $booking = $this->makeBooking([
            'status'          => 'pending_payment',
            'scheduled_start' => now()->subDays(10),
            'scheduled_end'   => now()->subDays(10)->addHour(),
        ]);

        $this->artisan('bookings:auto-cancel-past-due')->assertSuccessful();

        $this->assertSame('pending_payment', $booking->refresh()->status);
    }

    // ── Customer history visibility ─────────────────────────────────────────

    public function test_customer_can_still_see_expired_booking_in_history_after_returning_much_later(): void
    {
        $booking = $this->makeBooking([
            'status'          => 'pending',
            'scheduled_start' => now()->subMonth(),
            'scheduled_end'   => now()->subMonth()->addHour(),
        ]);

        $this->artisan('bookings:auto-cancel-past-due')->assertSuccessful();

        $response = $this->actingAs($this->customer)->getJson('/api/my-bookings');
        $response->assertOk();

        $cancelled = collect($response->json('cancelled'));
        $entry     = $cancelled->firstWhere('id', $booking->id);

        $this->assertNotNull($entry, 'Expired booking must remain visible in the customer\'s cancelled/history tab.');
        $this->assertSame('expired', $entry['cancellation_type']);

        $pendingIds = collect($response->json('pending'))->pluck('id');
        $this->assertFalse($pendingIds->contains($booking->id), 'Expired booking must no longer appear as an actionable pending booking.');
    }

    // ── Therapist view ───────────────────────────────────────────────────────

    public function test_therapist_no_longer_sees_expired_pending_booking_as_actionable(): void
    {
        $booking = $this->makeBooking([
            'status'          => 'pending',
            'scheduled_start' => now()->subMonth(),
            'scheduled_end'   => now()->subMonth()->addHour(),
        ]);

        $this->artisan('bookings:auto-cancel-past-due')->assertSuccessful();

        $response = $this->actingAs($this->therapistUser)
            ->getJson('/therapist/api/bookings?status=pending,pending_payment');
        $response->assertOk();

        $ids = collect($response->json('data'))->pluck('id');
        $this->assertFalse($ids->contains($booking->id), 'Expired booking must not appear in the therapist\'s actionable Pending Approval list.');
    }

    public function test_therapist_index_no_longer_silently_mutates_past_due_bookings_inline(): void
    {
        // Regression guard: TherapistBookingController::index() used to carry
        // its own inline auto-cancel sweep (without cancellation_type/cancelled_at,
        // and wrongly including 'accepted') that duplicated and conflicted with
        // bookings:auto-cancel-past-due. That inline sweep is removed — hitting
        // the index endpoint alone (without the scheduled command having run)
        // must leave the booking's status untouched.
        $booking = $this->makeBooking([
            'status'          => 'pending',
            'scheduled_start' => now()->subMonth(),
            'scheduled_end'   => now()->subMonth()->addHour(),
        ]);

        $this->actingAs($this->therapistUser)
            ->getJson('/therapist/api/bookings')
            ->assertOk();

        $this->assertSame('pending', $booking->refresh()->status, 'Loading the therapist bookings list must not itself mutate booking status — that is the scheduled command\'s job.');
    }
}
