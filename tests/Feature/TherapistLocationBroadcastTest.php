<?php

namespace Tests\Feature;

use App\Events\TherapistLocationUpdated;
use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Redis;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/StaleActiveSessionTest.php. Run with DB_CONNECTION=
 * pgsql pointed at a disposable test database, not sqlite (phpunit.xml's
 * default) and never the real dev database. It also requires a reachable
 * local Redis/Valkey server — see docs/architecture/GPS-LOCAL-REDIS-SETUP.md.
 *
 * GPS v1 realtime layer (docs/architecture/GPS-ARCHITECTURE.md). Covers only
 * that a valid, stored location update dispatches TherapistLocationUpdated
 * on the correct channel with the correct payload, and that rejected/failed
 * writes never broadcast. No frontend listener, no browser testing.
 */
class TherapistLocationBroadcastTest extends TestCase
{
    use RefreshDatabase;

    private User $therapistUser;
    private Therapist $therapist;
    private User $otherTherapistUser;
    private User $customer;
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

        $this->otherTherapistUser = User::factory()->create(['role' => 'therapist']);
        Therapist::create([
            'user_id'       => $this->otherTherapistUser->id,
            'base_location' => 'Dubai',
            'gender'        => 'female',
            'is_active'     => true,
        ]);

        $this->service = Service::create([
            'name' => 'Swedish Massage', 'duration_minutes' => 60, 'price' => 300, 'is_active' => true,
        ]);
        $this->variant = ServiceVariant::create([
            'service_id' => $this->service->id, 'duration_minutes' => 60, 'price' => 300,
        ]);
    }

    private ?string $redisKey = null;
    private bool $redisIsMocked = false;

    protected function tearDown(): void
    {
        // Test J mocks Redis::connection() with a strict ->once() expectation
        // — calling the facade again here would both break that count and
        // hit a mock with no del() defined. Cleanup is a best-effort nicety
        // for the real-Redis tests, not something to risk against a mock.
        if (! $this->redisIsMocked) {
            Redis::connection()->del($this->redisKey ?? '');
        }

        parent::tearDown();
    }

    private function makeBooking(array $overrides = []): Booking
    {
        $booking = Booking::create(array_merge([
            'customer_id'        => $this->customer->id,
            'therapist_id'       => $this->therapist->id,
            'service_id'         => $this->service->id,
            'service_variant_id' => $this->variant->id,
            'location'           => 'Test location',
            'zone_name'          => 'Test Zone',
            'payment_method'     => 'cashless',
            'payment_type'       => 'full',
            'status'             => 'en_route',
            'scheduled_start'    => now()->addDays(3),
            'scheduled_end'      => now()->addDays(3)->addHour(),
        ], $overrides));

        $this->redisKey = "booking:{$booking->id}:location";
        Redis::connection()->del($this->redisKey);

        return $booking;
    }

    private function send(Booking $booking, array $payload, ?User $as = null): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($as ?? $this->therapistUser)->postJson(
            "/therapist/api/bookings/{$booking->id}/location",
            $payload
        );
    }

    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'latitude'        => 25.2048,
            'longitude'       => 55.2708,
            'accuracy_meters' => 15,
            'recorded_at'     => now()->toIso8601String(),
        ], $overrides);
    }

    // ── A. Valid update broadcasts the event ─────────────────────────────────

    public function test_a_valid_location_update_broadcasts_the_event(): void
    {
        Event::fake([TherapistLocationUpdated::class]);
        $booking = $this->makeBooking();

        $this->send($booking, $this->validPayload())->assertOk();

        Event::assertDispatched(TherapistLocationUpdated::class);
    }

    // ── B. Exact private booking location channel ───────────────────────────

    public function test_b_event_broadcasts_on_the_exact_private_booking_location_channel(): void
    {
        Event::fake([TherapistLocationUpdated::class]);
        $booking = $this->makeBooking();

        $this->send($booking, $this->validPayload())->assertOk();

        Event::assertDispatched(TherapistLocationUpdated::class, function (TherapistLocationUpdated $event) use ($booking) {
            $channels = $event->broadcastOn();
            $this->assertCount(1, $channels);
            $this->assertSame("private-booking.{$booking->id}.location", $channels[0]->name);

            return true;
        });
    }

    // ── C. Payload contains the validated location data ─────────────────────

    public function test_c_broadcast_payload_contains_the_validated_location_data(): void
    {
        Event::fake([TherapistLocationUpdated::class]);
        $booking = $this->makeBooking();
        $recordedAt = now()->toIso8601String();

        $this->send($booking, $this->validPayload([
            'latitude'        => 25.1111,
            'longitude'       => 55.2222,
            'accuracy_meters' => 20,
            'recorded_at'     => $recordedAt,
            'heading'         => 45,
        ]))->assertOk();

        Event::assertDispatched(TherapistLocationUpdated::class, function (TherapistLocationUpdated $event) use ($booking) {
            $this->assertSame($booking->id, $event->bookingId);
            $this->assertSame($booking->therapist_id, $event->therapistId);
            $this->assertEquals(25.1111, $event->latitude);
            $this->assertEquals(55.2222, $event->longitude);
            $this->assertEquals(20, $event->accuracyMeters);
            $this->assertEquals(45, $event->heading);

            $with = $event->broadcastWith();
            $this->assertSame('location.updated', $event->broadcastAs());
            $this->assertArrayHasKey('recorded_at', $with);

            return true;
        });
    }

    // ── H. Therapist not assigned to the booking cannot write (and nothing broadcasts) ─

    public function test_h_unassigned_therapist_cannot_write_location_and_nothing_broadcasts(): void
    {
        Event::fake([TherapistLocationUpdated::class]);
        $booking = $this->makeBooking();

        $this->send($booking, $this->validPayload(), $this->otherTherapistUser)->assertStatus(403);

        Event::assertNotDispatched(TherapistLocationUpdated::class);
    }

    // ── I. Invalid GPS update does not broadcast ─────────────────────────────

    public function test_i_invalid_update_does_not_broadcast(): void
    {
        Event::fake([TherapistLocationUpdated::class]);
        $booking = $this->makeBooking();

        $this->send($booking, $this->validPayload(['accuracy_meters' => 150]))->assertStatus(422);

        Event::assertNotDispatched(TherapistLocationUpdated::class);
        $this->assertNull(Redis::connection()->get("booking:{$booking->id}:location"));
    }

    // ── J. Redis failure does not broadcast ──────────────────────────────────

    public function test_j_redis_failure_does_not_broadcast(): void
    {
        Event::fake([TherapistLocationUpdated::class]);
        $booking = $this->makeBooking();

        $failingConnection = \Mockery::mock();
        $failingConnection->shouldReceive('get')->once()->andReturn(null);
        $failingConnection->shouldReceive('setex')->once()->andThrow(new \RuntimeException('Redis connection lost'));

        Redis::shouldReceive('connection')->once()->andReturn($failingConnection);
        $this->redisIsMocked = true;

        $response = $this->send($booking, $this->validPayload());

        $response->assertStatus(500);
        Event::assertNotDispatched(TherapistLocationUpdated::class);
    }
}
