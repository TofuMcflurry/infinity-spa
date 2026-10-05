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
 * note in tests/Feature/StaleActiveSessionTest.php. Run with DB_CONNECTION=
 * pgsql pointed at a disposable test database, not sqlite (phpunit.xml's
 * default) and never the real dev database.
 *
 * GPS v1 channel authorization (docs/architecture/GPS-ARCHITECTURE.md §8/§11).
 * Exercises the real /broadcasting/auth endpoint (Broadcast::routes() in
 * routes/web.php) against the booking.{bookingId}.location channel
 * registered in routes/channels.php.
 *
 * phpunit.xml forces BROADCAST_CONNECTION=null for the suite as a whole,
 * and Laravel's NullBroadcaster::auth() is a no-op that never even consults
 * the registered channel callback — so testing against it would silently
 * pass regardless of what the authorization closure does.
 *
 * This suite needs the real 'reverb' driver instead — but that CANNOT be
 * set via a runtime config(['broadcasting.default' => 'reverb']) call in
 * setUp(). routes/channels.php registers its Broadcast::channel() closures
 * onto whichever connection is already the default *at boot time* (i.e.
 * 'null', per phpunit.xml); switching the config afterwards only makes the
 * BroadcastManager lazily construct a second, separate 'reverb' broadcaster
 * instance with an empty channel list, since registration and resolution
 * are keyed by connection instance, not re-applied on a config change. The
 * fix is to set BROADCAST_CONNECTION=reverb as a real environment variable
 * before the app boots — e.g.
 *   DB_CONNECTION=pgsql DB_DATABASE=infinity_spa_test BROADCAST_CONNECTION=reverb php artisan test --filter=GpsLocationChannelAuthorizationTest
 * — the same technique this project already uses to override DB_CONNECTION
 * for Postgres-only suites (phpunit.xml's <env> tags don't force-override
 * an already-set shell env var). authorizeChannel() itself only does local
 * HMAC signing with the existing REVERB_APP_KEY/SECRET from .env — no live
 * Reverb server connection is required for this.
 */
class GpsLocationChannelAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $customer;
    private User $otherCustomer;
    private Therapist $therapist;
    private Service $service;
    private ServiceVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin         = User::factory()->create(['role' => 'admin']);
        $this->customer      = User::factory()->create(['role' => 'customer']);
        $this->otherCustomer = User::factory()->create(['role' => 'customer']);

        $therapistUser = User::factory()->create(['role' => 'therapist']);
        $this->therapist = Therapist::create([
            'user_id'       => $therapistUser->id,
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
            'status'             => 'en_route',
            'scheduled_start'    => now()->addDays(3),
            'scheduled_end'      => now()->addDays(3)->addHour(),
        ], $overrides));
    }

    private function authorize(Booking $booking, User $as): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($as)->postJson('/broadcasting/auth', [
            'socket_id'    => '123.456',
            'channel_name' => "private-booking.{$booking->id}.location",
        ]);
    }

    // ── D. Owning customer may authorize ─────────────────────────────────────

    public function test_d_customer_who_owns_the_booking_may_authorize_the_channel(): void
    {
        $booking = $this->makeBooking();

        $this->authorize($booking, $this->customer)->assertOk();
    }

    // ── E. Non-owning customer is denied ─────────────────────────────────────

    public function test_e_customer_who_does_not_own_the_booking_is_denied(): void
    {
        $booking = $this->makeBooking();

        $this->authorize($booking, $this->otherCustomer)->assertStatus(403);
    }

    // ── F. Admin may authorize an en_route booking ───────────────────────────

    public function test_f_admin_may_authorize_an_en_route_booking(): void
    {
        $booking = $this->makeBooking();

        $this->authorize($booking, $this->admin)->assertOk();
    }

    // ── G. Non-en_route booking denies channel access (even to the owner) ───

    public function test_g_non_en_route_booking_denies_channel_access(): void
    {
        foreach (['pending', 'accepted', 'arrived', 'completed', 'cancelled', 'rejected'] as $status) {
            $booking = $this->makeBooking(['status' => $status]);

            $this->authorize($booking, $this->customer)
                ->assertStatus(403, "Status '{$status}' must not grant GPS channel access.");
        }
    }

    public function test_g_non_en_route_booking_denies_admin_too(): void
    {
        $booking = $this->makeBooking(['status' => 'completed']);

        $this->authorize($booking, $this->admin)->assertStatus(403);
    }

    // ── Existing booking.{bookingId} channel must remain unaffected ─────────

    public function test_existing_booking_channel_authorization_is_unchanged(): void
    {
        // The pre-existing channel authorizes the owning customer regardless
        // of status (it's used for every lifecycle broadcast) — this must
        // still be true after adding the GPS-specific channel above.
        $booking = $this->makeBooking(['status' => 'completed']);

        $response = $this->actingAs($this->customer)->postJson('/broadcasting/auth', [
            'socket_id'    => '123.456',
            'channel_name' => "private-booking.{$booking->id}",
        ]);

        $response->assertOk();
    }
}
