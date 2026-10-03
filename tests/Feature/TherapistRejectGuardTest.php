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
 * Covers audit finding B1: TherapistBookingController::reject() previously
 * had neither a status guard nor a row lock — unlike every sibling
 * transition (accept/start/cancel) — so it could flip an en_route/arrived/
 * completed/already-terminal booking back to 'rejected' via a stale client,
 * a replayed request, or a direct API call. This suite locks in the fix:
 * reject() now only succeeds from pending/pending_payment/accepted (the
 * exact set the frontend's own Reject button already assumes), and
 * row-locks the same way accept()/start() do.
 */
class TherapistRejectGuardTest extends TestCase
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
            'status'             => 'pending',
            'scheduled_start'    => now()->addDays(3),
            'scheduled_end'      => now()->addDays(3)->addHour(),
        ], $overrides));
    }

    private function reject(Booking $booking, ?string $reason = null, ?User $as = null): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($as ?? $this->therapistUser)->postJson(
            "/therapist/api/bookings/{$booking->id}/reject",
            array_filter(['reason' => $reason], fn ($v) => $v !== null)
        );
    }

    // ── Existing behavior preserved for every status the frontend already
    // allows Reject from ─────────────────────────────────────────────────────

    public function test_reject_still_succeeds_from_pending(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking(['status' => 'pending']);

        $this->reject($booking, 'Not available')->assertOk();

        $booking->refresh();
        $this->assertSame('rejected', $booking->status);
        $this->assertSame('Not available', $booking->rejection_reason);
    }

    public function test_reject_still_succeeds_from_pending_payment(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking(['status' => 'pending_payment', 'payment_status' => 'pending']);

        $this->reject($booking)->assertOk();

        $booking->refresh();
        $this->assertSame('rejected', $booking->status);
    }

    public function test_reject_still_succeeds_from_accepted(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking(['status' => 'accepted']);

        $this->reject($booking)->assertOk();

        $booking->refresh();
        $this->assertSame('rejected', $booking->status);
    }

    public function test_reject_sends_the_existing_rejected_notification(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking(['status' => 'pending']);

        $this->reject($booking)->assertOk();

        NotificationFacade::assertSentTo(
            $this->customer,
            \App\Notifications\BookingNotification::class,
            fn ($n) => $n->type === 'rejected' && $n->booking->id === $booking->id
        );
    }

    // ── New guard: terminal / already-active statuses are rejected ──────────

    public function test_reject_is_blocked_for_non_rejectable_statuses(): void
    {
        foreach (['en_route', 'arrived', 'completed', 'cancelled', 'rejected'] as $status) {
            $booking = $this->makeBooking(['status' => $status]);

            $response = $this->reject($booking);
            $response->assertStatus(422, "Status '{$status}' must not be rejectable.");
            $response->assertJsonPath('message', 'This booking can no longer be rejected.');

            $booking->refresh();
            $this->assertSame($status, $booking->status, "A blocked reject must not change the booking's status.");
        }
    }

    public function test_blocked_reject_does_not_send_a_notification(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking(['status' => 'completed']);

        $this->reject($booking)->assertStatus(422);

        NotificationFacade::assertNothingSent();
    }

    // ── Row locking: only one terminal decision can win ─────────────────────
    // PHPUnit is synchronous, so — mirroring the existing precedent in this
    // codebase (e.g. RescheduleRequestTest's "sequential duplicate requests"
    // test) — two back-to-back calls exercise the exact same
    // lockForUpdate()-guarded path a real concurrent request would hit.

    public function test_sequential_reject_attempts_only_the_first_succeeds(): void
    {
        $booking = $this->makeBooking(['status' => 'pending']);

        $first  = $this->reject($booking, 'First reason');
        $second = $this->reject($booking, 'Second reason');

        $first->assertOk();
        $second->assertStatus(422);

        $booking->refresh();
        $this->assertSame('rejected', $booking->status);
        $this->assertSame('First reason', $booking->rejection_reason, 'The second, blocked attempt must not overwrite the first rejection reason.');
    }

    // ── Role/ownership boundary unchanged ────────────────────────────────────

    public function test_a_different_therapist_cannot_reject_this_booking(): void
    {
        $booking = $this->makeBooking(['status' => 'pending']);

        $this->reject($booking, null, $this->otherTherapistUser)->assertStatus(403);

        $booking->refresh();
        $this->assertSame('pending', $booking->status);
    }
}
