<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Redis;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/StaleActiveSessionTest.php. Run with DB_CONNECTION=
 * pgsql pointed at a disposable test database, not sqlite (phpunit.xml's
 * default) and never the real dev database.
 *
 * It also requires a reachable local Redis/Valkey server on the configured
 * REDIS_HOST/REDIS_PORT (see docs/architecture/GPS-LOCAL-REDIS-SETUP.md) —
 * the endpoint under test writes through the real predis connection, not a
 * mock, so the stale-overwrite and TTL assertions exercise the real store.
 *
 * GPS v1 ingestion/storage layer (docs/architecture/GPS-ARCHITECTURE.md).
 * Covers only validation + Redis storage — no broadcasting, no frontend.
 */
class TherapistLocationIngestionTest extends TestCase
{
    use RefreshDatabase;

    private User $therapistUser;
    private Therapist $therapist;
    private User $otherTherapistUser;
    private Therapist $otherTherapist;
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
        $this->otherTherapist = Therapist::create([
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

    protected function tearDown(): void
    {
        // Leave no latest-location keys behind between tests/runs.
        Redis::connection()->del($this->redisKey ?? '');
        parent::tearDown();
    }

    private ?string $redisKey = null;

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

    // ── A. Happy path ─────────────────────────────────────────────────────────

    public function test_a_valid_en_route_therapist_location_is_accepted(): void
    {
        $booking = $this->makeBooking();

        $response = $this->send($booking, $this->validPayload());

        $response->assertOk();
        $response->assertJsonPath('status', 'accepted');
    }

    // ── B. Correct Redis key ─────────────────────────────────────────────────

    public function test_b_correct_redis_key_is_written(): void
    {
        $booking = $this->makeBooking();

        $this->send($booking, $this->validPayload())->assertOk();

        $this->assertNotNull(Redis::connection()->get("booking:{$booking->id}:location"));
    }

    // ── C. Stored payload correctness ────────────────────────────────────────

    public function test_c_stored_payload_is_correct(): void
    {
        $booking = $this->makeBooking();
        $recordedAt = now()->toIso8601String();

        $this->send($booking, $this->validPayload([
            'latitude'        => 25.1,
            'longitude'       => 55.2,
            'accuracy_meters' => 12.5,
            'recorded_at'     => $recordedAt,
            'heading'         => 90,
        ]))->assertOk();

        $stored = json_decode(Redis::connection()->get("booking:{$booking->id}:location"), true);

        $this->assertSame($booking->id, $stored['booking_id']);
        $this->assertSame($booking->therapist_id, $stored['therapist_id']);
        $this->assertEquals(25.1, $stored['latitude']);
        $this->assertEquals(55.2, $stored['longitude']);
        $this->assertEquals(12.5, $stored['accuracy_meters']);
        $this->assertEquals(90, $stored['heading']);
        $this->assertNotEmpty($stored['recorded_at']);
    }

    // ── D. TTL is 60 seconds ─────────────────────────────────────────────────

    public function test_d_ttl_is_60_seconds(): void
    {
        $booking = $this->makeBooking();

        $this->send($booking, $this->validPayload())->assertOk();

        $ttl = Redis::connection()->ttl("booking:{$booking->id}:location");
        $this->assertGreaterThan(0, $ttl);
        $this->assertLessThanOrEqual(60, $ttl);
        $this->assertGreaterThan(55, $ttl); // allow a few seconds of test execution slack
    }

    // ── E. Second valid update refreshes TTL ─────────────────────────────────

    public function test_e_second_valid_update_refreshes_ttl(): void
    {
        $booking = $this->makeBooking();
        $key = "booking:{$booking->id}:location";

        $this->send($booking, $this->validPayload(['recorded_at' => now()->toIso8601String()]))->assertOk();

        // Artificially shrink the TTL to prove the next update resets it to 60,
        // rather than merely never having dropped from an initial 60.
        Redis::connection()->expire($key, 10);
        $this->assertLessThanOrEqual(10, Redis::connection()->ttl($key));

        $this->send($booking, $this->validPayload(['recorded_at' => now()->addSecond()->toIso8601String()]))->assertOk();

        $ttl = Redis::connection()->ttl($key);
        $this->assertGreaterThan(55, $ttl, 'A valid update must refresh the TTL back to the full 60 seconds.');
    }

    // ── F. Non-en_route booking rejected ─────────────────────────────────────

    public function test_f_non_en_route_booking_is_rejected(): void
    {
        foreach (['pending', 'accepted', 'arrived', 'completed', 'cancelled', 'rejected'] as $status) {
            $booking = $this->makeBooking(['status' => $status]);

            $response = $this->send($booking, $this->validPayload());

            $response->assertStatus(422, "Status '{$status}' must not accept a location update.");
            $this->assertNull(Redis::connection()->get("booking:{$booking->id}:location"));
        }
    }

    // ── G. Wrong therapist rejected ───────────────────────────────────────────

    public function test_g_wrong_therapist_is_rejected(): void
    {
        $booking = $this->makeBooking();

        $response = $this->send($booking, $this->validPayload(), $this->otherTherapistUser);

        $response->assertStatus(403);
        $this->assertNull(Redis::connection()->get("booking:{$booking->id}:location"));
    }

    // ── H. Accuracy > 100m rejected ───────────────────────────────────────────

    public function test_h_accuracy_over_100_meters_is_rejected(): void
    {
        $booking = $this->makeBooking();

        $response = $this->send($booking, $this->validPayload(['accuracy_meters' => 100.01]));

        $response->assertStatus(422);
        $this->assertNull(Redis::connection()->get("booking:{$booking->id}:location"));
    }

    public function test_h_accuracy_exactly_100_meters_is_accepted(): void
    {
        $booking = $this->makeBooking();

        $this->send($booking, $this->validPayload(['accuracy_meters' => 100]))->assertOk();
    }

    // ── I. Invalid coordinates rejected ──────────────────────────────────────

    public function test_i_invalid_coordinates_are_rejected(): void
    {
        $booking = $this->makeBooking();

        $this->send($booking, $this->validPayload(['latitude' => 95]))->assertStatus(422);
        $this->send($booking, $this->validPayload(['longitude' => 190]))->assertStatus(422);
        $this->send($booking, $this->validPayload(['latitude' => 'not-a-number']))->assertStatus(422);

        $this->assertNull(Redis::connection()->get("booking:{$booking->id}:location"));
    }

    // ── J. Impossible speed rejected ──────────────────────────────────────────

    public function test_j_impossible_speed_over_160kmh_is_rejected(): void
    {
        $booking = $this->makeBooking();

        // First valid location.
        $t0 = now();
        $this->send($booking, $this->validPayload([
            'latitude' => 25.2048, 'longitude' => 55.2708, 'recorded_at' => $t0->toIso8601String(),
        ]))->assertOk();

        // ~110km away, 60 seconds later → ~6,600 km/h implied speed.
        $response = $this->send($booking, $this->validPayload([
            'latitude' => 24.2048, 'longitude' => 55.2708, 'recorded_at' => $t0->copy()->addSeconds(60)->toIso8601String(),
        ]));

        $response->assertStatus(422);

        // The impossible update must not have overwritten the first valid one.
        $stored = json_decode(Redis::connection()->get("booking:{$booking->id}:location"), true);
        $this->assertEquals(25.2048, $stored['latitude']);
    }

    // ── K. First location skips the speed check ──────────────────────────────

    public function test_k_first_location_skips_speed_check(): void
    {
        $booking = $this->makeBooking();

        // No previous location exists yet — this must be accepted even though
        // there is nothing to compare speed against.
        $response = $this->send($booking, $this->validPayload());

        $response->assertOk();
    }

    // ── L. Older update cannot overwrite newer location ──────────────────────

    public function test_l_older_update_cannot_overwrite_newer_location(): void
    {
        $booking = $this->makeBooking();
        $t0 = now();

        $this->send($booking, $this->validPayload([
            'latitude' => 25.20, 'longitude' => 55.27, 'recorded_at' => $t0->toIso8601String(),
        ]))->assertOk();

        // An update timestamped *before* the one already stored.
        $response = $this->send($booking, $this->validPayload([
            'latitude' => 25.21, 'longitude' => 55.28, 'recorded_at' => $t0->copy()->subSeconds(5)->toIso8601String(),
        ]));

        $response->assertStatus(409);

        $stored = json_decode(Redis::connection()->get("booking:{$booking->id}:location"), true);
        $this->assertEquals(25.20, $stored['latitude'], 'The older update must not have overwritten the newer location.');
    }

    // ── M. Cancelled/arrived booking cannot receive location ─────────────────

    public function test_m_cancelled_booking_cannot_receive_location(): void
    {
        $booking = $this->makeBooking(['status' => 'cancelled']);

        $this->send($booking, $this->validPayload())->assertStatus(422);
        $this->assertNull(Redis::connection()->get("booking:{$booking->id}:location"));
    }

    public function test_m_arrived_booking_cannot_receive_location(): void
    {
        $booking = $this->makeBooking(['status' => 'arrived']);

        $this->send($booking, $this->validPayload())->assertStatus(422);
        $this->assertNull(Redis::connection()->get("booking:{$booking->id}:location"));
    }

    // ── N. Unauthenticated request rejected ───────────────────────────────────

    public function test_n_unauthenticated_request_is_rejected(): void
    {
        $booking = $this->makeBooking();

        $response = $this->postJson(
            "/therapist/api/bookings/{$booking->id}/location",
            $this->validPayload()
        );

        $response->assertStatus(401);
        $this->assertNull(Redis::connection()->get("booking:{$booking->id}:location"));
    }

    // ── Bonus: nonexistent booking (explicitly called out in §2 of the task) ──

    public function test_nonexistent_booking_is_rejected(): void
    {
        $response = $this->actingAs($this->therapistUser)->postJson(
            '/therapist/api/bookings/999999/location',
            $this->validPayload()
        );

        $response->assertStatus(404);
    }
}
