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
 */
class CustomerDashboardUpcomingBookingTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;
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
            'customer_id'     => $this->customer->id,
            'therapist_id'    => $this->therapist->id,
            'service_id'      => $this->service->id,
            'location'        => 'Test location',
            'zone_name'       => 'Test Zone',
            'payment_method'  => 'cash',
        ], $overrides));
    }

    private function fetchUpcoming(): ?array
    {
        $response = $this->actingAs($this->customer)->getJson('/api/dashboard-data');
        $response->assertOk();
        return $response->json('upcoming_booking');
    }

    public function test_en_route_booking_with_past_scheduled_start_is_still_returned(): void
    {
        $this->makeBooking([
            'status'          => 'en_route',
            'scheduled_start' => now()->subHours(3),
            'scheduled_end'   => now()->subHours(2),
        ]);

        $upcoming = $this->fetchUpcoming();

        $this->assertNotNull($upcoming, 'A stale en_route booking should still surface as the upcoming booking.');
        $this->assertSame('en_route', $upcoming['status']);
    }

    public function test_arrived_booking_with_past_scheduled_start_is_still_returned(): void
    {
        $this->makeBooking([
            'status'          => 'arrived',
            'scheduled_start' => now()->subHours(4),
            'scheduled_end'   => now()->subHours(3),
        ]);

        $upcoming = $this->fetchUpcoming();

        $this->assertNotNull($upcoming, 'A stale arrived booking should still surface as the upcoming booking.');
        $this->assertSame('arrived', $upcoming['status']);
    }

    public function test_accepted_booking_with_past_scheduled_start_is_not_returned(): void
    {
        // The widened visibility is scoped to en_route/arrived only — an
        // accepted booking whose scheduled_start has already passed must NOT
        // be treated as upcoming (existing behavior, must stay unchanged).
        $this->makeBooking([
            'status'          => 'accepted',
            'scheduled_start' => now()->subHours(3),
            'scheduled_end'   => now()->subHours(2),
        ]);

        $upcoming = $this->fetchUpcoming();

        $this->assertNull($upcoming, 'A past-due accepted booking must not be widened into visibility.');
    }

    public function test_pending_booking_with_past_scheduled_start_is_not_returned(): void
    {
        $this->makeBooking([
            'status'          => 'pending',
            'scheduled_start' => now()->subHours(5),
            'scheduled_end'   => now()->subHours(4),
        ]);

        $upcoming = $this->fetchUpcoming();

        $this->assertNull($upcoming, 'A past-due pending booking must not be widened into visibility.');
    }

    public function test_future_accepted_booking_is_still_returned_as_before(): void
    {
        $this->makeBooking([
            'status'          => 'accepted',
            'scheduled_start' => now()->addDay(),
            'scheduled_end'   => now()->addDay()->addHour(),
        ]);

        $upcoming = $this->fetchUpcoming();

        $this->assertNotNull($upcoming);
        $this->assertSame('accepted', $upcoming['status']);
    }

    public function test_upcoming_booking_payload_includes_raw_iso_scheduled_start_alongside_existing_fields(): void
    {
        $booking = $this->makeBooking([
            'status'          => 'en_route',
            'scheduled_start' => now()->subHour(),
            'scheduled_end'   => now()->addMinutes(30),
        ]);

        $upcoming = $this->fetchUpcoming();

        $this->assertNotNull($upcoming);

        // Existing fields must all still be present, unchanged in shape.
        foreach (['id', 'service', 'therapist', 'datetime', 'location', 'zone_name', 'status', 'duration'] as $field) {
            $this->assertArrayHasKey($field, $upcoming, "Existing field '{$field}' must be preserved.");
        }
        $this->assertSame($booking->id, $upcoming['id']);

        // New additive field: raw ISO8601 scheduled_start.
        $this->assertArrayHasKey('scheduled_start', $upcoming);
        $this->assertNotNull(\Carbon\Carbon::parse($upcoming['scheduled_start']));
        $this->assertTrue(
            \Carbon\Carbon::parse($upcoming['scheduled_start'])->equalTo($booking->scheduled_start),
            'Raw scheduled_start must match the booking\'s actual scheduled_start.'
        );
    }

    public function test_en_route_still_takes_priority_over_accepted_when_both_exist(): void
    {
        // Existing priority ordering (en_route > arrived > accepted > pending
        // > pending_payment) must be unaffected by the widened WHERE clause.
        $this->makeBooking([
            'status'          => 'accepted',
            'scheduled_start' => now()->addHour(),
            'scheduled_end'   => now()->addHours(2),
        ]);
        $enRoute = $this->makeBooking([
            'status'          => 'en_route',
            'scheduled_start' => now()->subHours(2),
            'scheduled_end'   => now()->subHour(),
        ]);

        $upcoming = $this->fetchUpcoming();

        $this->assertNotNull($upcoming);
        $this->assertSame($enRoute->id, $upcoming['id']);
        $this->assertSame('en_route', $upcoming['status']);
    }
}
