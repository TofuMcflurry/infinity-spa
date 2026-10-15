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
 * phpunit.xml forces BROADCAST_CONNECTION=null suite-wide (deliberately —
 * it must stay that way so no other test can trigger a real outbound
 * broadcast), and Laravel's NullBroadcaster::auth() is a no-op that never
 * even consults the registered channel callback — so testing against it
 * would silently pass regardless of what the authorization closure does.
 *
 * A plain runtime config(['broadcasting.default' => ...]) call in setUp()
 * doesn't fix this either: Broadcast::channel() (called from
 * routes/channels.php during boot) resolves and caches ONE default-driver
 * instance the first time it's invoked, and registers every subsequent
 * channel pattern onto that same instance. Changing the config afterwards
 * just makes BroadcastManager lazily build a second, separate instance
 * with an empty channel list — the real closures stay stranded on the
 * original (null) instance.
 *
 * The fix used here: read the ALREADY-POPULATED null-driver instance's
 * registered channels (the genuine routes/channels.php closures — never
 * reimplemented) via reflection, and copy that exact state onto a fresh
 * RedisBroadcaster, whose auth() (unlike Null's) genuinely calls
 * verifyUserCanAccessChannel() against them. It reuses the already-isolated
 * test Redis connection (config/database.php's 'default' Redis connection,
 * pinned to a dedicated database index for this test environment) — no
 * new credentials, no live Reverb/Pusher connection, and auth() never
 * calls broadcast(), so no pub/sub message is ever published, not even to
 * that isolated Redis db. The swapped instance lives only on this test's
 * own (per-test, freshly booted) BroadcastManager, and is explicitly
 * reverted in tearDown() as a defensive measure even though Laravel
 * discards the whole app container between tests anyway.
 */
class GpsLocationChannelAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private $originalBroadcasterDrivers = null;
    private ?string $broadcastConnectionName = null;

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

        $this->installRealAuthCapableBroadcaster();
    }

    protected function tearDown(): void
    {
        // Defensive restore — Laravel discards this whole app container
        // (and its BroadcastManager) between tests regardless, but this
        // keeps the swap explicitly scoped to this test class either way.
        if ($this->originalBroadcasterDrivers !== null) {
            $manager = app(\Illuminate\Broadcasting\BroadcastManager::class);
            $driversProp = new \ReflectionProperty($manager, 'drivers');
            $driversProp->setAccessible(true);
            $driversProp->setValue($manager, $this->originalBroadcasterDrivers);
        }

        parent::tearDown();
    }

    /**
     * Swap the cached default broadcaster (NullBroadcaster, whose auth() is
     * a no-op) for a RedisBroadcaster carrying the SAME channel closures
     * routes/channels.php already registered on it — copied via reflection,
     * never reimplemented. This is scoped to this test's own BroadcastManager
     * instance only; the global BROADCAST_CONNECTION=null setting in
     * phpunit.xml is untouched for every other test class.
     */
    private function installRealAuthCapableBroadcaster(): void
    {
        $this->broadcastConnectionName = config('broadcasting.default');

        $manager = app(\Illuminate\Broadcasting\BroadcastManager::class);

        // Force resolution now, so routes/channels.php's registrations
        // (already applied during app boot) are guaranteed present on it.
        $nullBroadcaster = $manager->driver($this->broadcastConnectionName);

        $channelsProp = new \ReflectionProperty($nullBroadcaster, 'channels');
        $channelsProp->setAccessible(true);

        $channelOptionsProp = new \ReflectionProperty($nullBroadcaster, 'channelOptions');
        $channelOptionsProp->setAccessible(true);

        $authCallbackProp = new \ReflectionProperty($nullBroadcaster, 'authenticatedUserCallback');
        $authCallbackProp->setAccessible(true);

        $bindingRegistrarProp = new \ReflectionProperty($nullBroadcaster, 'bindingRegistrar');
        $bindingRegistrarProp->setAccessible(true);

        $realBroadcaster = new \Illuminate\Broadcasting\Broadcasters\RedisBroadcaster(
            app('redis')
        );

        $channelsProp->setValue($realBroadcaster, $channelsProp->getValue($nullBroadcaster));
        $channelOptionsProp->setValue($realBroadcaster, $channelOptionsProp->getValue($nullBroadcaster));
        $authCallbackProp->setValue($realBroadcaster, $authCallbackProp->getValue($nullBroadcaster));
        $bindingRegistrarProp->setValue($realBroadcaster, $bindingRegistrarProp->getValue($nullBroadcaster));

        $driversProp = new \ReflectionProperty($manager, 'drivers');
        $driversProp->setAccessible(true);

        $this->originalBroadcasterDrivers = $driversProp->getValue($manager);

        $drivers = $this->originalBroadcasterDrivers;
        $drivers[$this->broadcastConnectionName] = $realBroadcaster;
        $driversProp->setValue($manager, $drivers);
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
