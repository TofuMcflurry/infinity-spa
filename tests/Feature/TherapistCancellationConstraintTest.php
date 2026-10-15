<?php

namespace Tests\Feature;

use App\Models\Booking;
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
 * note in tests/Feature/BookingApprovalFlowTest.php. Run with DB_CONNECTION=
 * pgsql pointed at a disposable test database, not sqlite (phpunit.xml's
 * default) and never the real dev database — this suite exists specifically
 * to exercise the real bookings_cancellation_type_check constraint, which
 * sqlite doesn't have.
 *
 * Regression coverage for the bookings_cancellation_type_check fix
 * (2026_09_29_180000_add_therapist_to_cancellation_type_check.php):
 * TherapistBookingController::cancel() has always written
 * cancellation_type = 'therapist', but the constraint never allowed it,
 * so the action 500'd. This only proves the constraint now accepts the
 * value the app already writes — no business logic changed.
 */
class TherapistCancellationConstraintTest extends TestCase
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
            'status'             => 'accepted',
            'payment_status'     => 'paid',
            'downpayment_status' => 'pending',
            'scheduled_start'    => now()->addDays(3),
            'scheduled_end'      => now()->addDays(3)->addHour(),
        ], $overrides));
    }

    // ── The fix itself: therapist cancellation now succeeds ──────────────────

    public function test_therapist_cancellation_succeeds_and_stores_cancellation_type_therapist(): void
    {
        $booking = $this->makeBooking();

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/cancel", [
                'reason' => 'Unavailable',
            ]);

        $response->assertOk();

        $booking->refresh();
        $this->assertSame('cancelled', $booking->status, 'Existing status behavior must be unchanged.');
        $this->assertSame('therapist', $booking->cancellation_type, 'This is the value the controller has always written.');
        $this->assertSame('Unavailable', $booking->rejection_reason, 'Existing reason-storage field must be unchanged.');
        $this->assertNotNull($booking->cancelled_at);
    }

    public function test_therapist_cancellation_still_rejects_a_completed_or_already_cancelled_booking(): void
    {
        // Pre-existing status guard in TherapistBookingController::cancel(),
        // untouched by this fix — still enforced exactly as before.
        $booking = $this->makeBooking(['status' => 'completed']);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/cancel", [
                'reason' => 'Too late',
            ]);

        $response->assertStatus(422);
        $booking->refresh();
        $this->assertSame('completed', $booking->status);
    }

    // ── Existing allowed values remain valid (constraint widened, not narrowed) ──

    public function test_all_previously_allowed_cancellation_types_still_pass_the_constraint(): void
    {
        foreach (['refunded', 'forfeited', 'no_show', 'expired'] as $type) {
            $booking = $this->makeBooking();
            $booking->update([
                'status'             => 'cancelled',
                'cancelled_at'       => now(),
                'cancellation_type'  => $type,
            ]);

            $this->assertSame($type, $booking->fresh()->cancellation_type);
        }
    }

    public function test_null_cancellation_type_still_passes_the_constraint(): void
    {
        $booking = $this->makeBooking();
        $this->assertNull($booking->fresh()->cancellation_type);
    }

    public function test_an_invalid_cancellation_type_is_still_rejected_by_the_constraint(): void
    {
        $booking = $this->makeBooking();

        $this->expectException(\Illuminate\Database\QueryException::class);
        $booking->update(['cancellation_type' => 'not_a_real_value']);
    }

    // ── Existing customer cancellation flow (Step 3) still works ─────────────

    public function test_existing_customer_cancellation_flow_still_works(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking();

        $response = $this->actingAs($this->customer)->postJson('/api/downpayment/cancel', [
            'booking_id'          => $booking->id,
            'cancellation_reason' => 'Change of plans',
        ]);

        $response->assertOk();
        $booking->refresh();
        $this->assertSame('cancelled', $booking->status);
        $this->assertContains($booking->cancellation_type, ['refunded', 'forfeited']);

        NotificationFacade::assertSentTo(
            $this->customer,
            BookingNotification::class,
            fn($n) => $n->type === 'customer_cancelled'
        );
    }

    // ── Existing admin stale-resolution cancellation flow still works ────────

    public function test_existing_admin_stale_cancellation_flow_still_works(): void
    {
        NotificationFacade::fake();

        $admin = User::factory()->create(['role' => 'admin']);
        $booking = $this->makeBooking([
            'status'     => 'accepted',
            'flagged_at' => now()->subHour(),
        ]);

        $response = $this->actingAs($admin)->postJson(
            "/admin/api/bookings/stale/{$booking->id}/cancel",
            ['reason' => 'Stuck session, resolved by admin']
        );

        $response->assertOk();
        $booking->refresh();
        $this->assertSame('cancelled', $booking->status);
        $this->assertContains($booking->cancellation_type, ['refunded', 'forfeited']);

        // Admin-triggered cancellation still sends no BookingNotification.
        NotificationFacade::assertNothingSent();
    }
}
