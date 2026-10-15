<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification as NotificationFacade;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/StaleActiveSessionTest.php. Run with DB_CONNECTION=
 * pgsql pointed at a disposable test database, not sqlite (phpunit.xml's
 * default) and never the real dev database.
 *
 * GPS foundation step: TherapistBookingController::arrived() previously had
 * neither a row lock nor a re-checked ownership guard inside a transaction —
 * unlike accept()/reject()/start(). This suite locks in the hardened
 * behavior: arrived() now only succeeds from en_route, row-locks the same
 * way start() does, and re-verifies therapist ownership on the locked row.
 */
class TherapistArrivedGuardTest extends TestCase
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

    private function arrive(Booking $booking, ?User $as = null): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($as ?? $this->therapistUser)->postJson(
            "/therapist/api/bookings/{$booking->id}/arrived"
        );
    }

    // ── Existing behavior preserved ──────────────────────────────────────────

    public function test_arrived_still_succeeds_from_en_route(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking(['status' => 'en_route']);

        $this->arrive($booking)->assertOk();

        $booking->refresh();
        $this->assertSame('arrived', $booking->status);
    }

    public function test_arrived_sends_the_existing_arrived_notification(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking(['status' => 'en_route']);

        $this->arrive($booking)->assertOk();

        NotificationFacade::assertSentTo(
            $this->customer,
            \App\Notifications\BookingNotification::class,
            fn ($n) => $n->type === 'arrived' && $n->booking->id === $booking->id
        );
    }

    // ── New guard: only en_route is a valid starting state ───────────────────

    public function test_arrived_is_blocked_for_non_en_route_statuses(): void
    {
        foreach (['pending', 'accepted', 'arrived', 'completed', 'cancelled', 'rejected'] as $status) {
            $booking = $this->makeBooking(['status' => $status]);

            $response = $this->arrive($booking);
            $response->assertStatus(422, "Status '{$status}' must not allow arrived.");
            $response->assertJsonPath('message', 'Therapist must be en route first.');

            $booking->refresh();
            $this->assertSame($status, $booking->status, "A blocked arrived call must not change the booking's status.");
        }
    }

    public function test_blocked_arrived_does_not_send_a_notification(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking(['status' => 'completed']);

        $this->arrive($booking)->assertStatus(422);

        NotificationFacade::assertNothingSent();
    }

    // ── Row locking: only one transition can win ─────────────────────────────
    // PHPUnit is synchronous, so — mirroring TherapistRejectGuardTest's
    // "sequential duplicate requests" test — two back-to-back calls exercise
    // the exact same lockForUpdate()-guarded path a real concurrent request
    // would hit.

    public function test_sequential_arrived_attempts_only_the_first_succeeds(): void
    {
        $booking = $this->makeBooking(['status' => 'en_route']);

        $first  = $this->arrive($booking);
        $second = $this->arrive($booking);

        $first->assertOk();
        $second->assertStatus(422);

        $booking->refresh();
        $this->assertSame('arrived', $booking->status);
    }

    // ── Role/ownership boundary unchanged, now also re-checked inside the lock ─

    public function test_a_different_therapist_cannot_mark_this_booking_arrived(): void
    {
        $booking = $this->makeBooking(['status' => 'en_route']);

        $this->arrive($booking, $this->otherTherapistUser)->assertStatus(403);

        $booking->refresh();
        $this->assertSame('en_route', $booking->status);
    }
}
