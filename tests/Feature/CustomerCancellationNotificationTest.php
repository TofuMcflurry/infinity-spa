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
 * default) and never the real dev database.
 *
 * Covers the new "Booking Cancelled" customer in-app notification, triggered
 * from DownpaymentController::cancel() — the single customer-initiated
 * cancellation entry point (BookingCancellationService is also called by
 * AdminBookingController's stale-session resolution and by
 * TherapistBookingController::cancel(), neither of which is touched here or
 * should emit this notification). Row lock + status re-check inside the
 * transaction (same pattern as Step 1's accept()/start() fix) ensures a
 * retried/double-submitted cancel can't run the flow — or notify — twice.
 */
class CustomerCancellationNotificationTest extends TestCase
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

    // ── 1, 2, 3: success → exactly 1 notification, correct customer + content ──

    public function test_successful_cancellation_notifies_the_owning_customer_exactly_once(): void
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

        NotificationFacade::assertSentTimes(BookingNotification::class, 1);
        NotificationFacade::assertSentTo(
            $this->customer,
            BookingNotification::class,
            function ($notification) use ($booking) {
                $data = $notification->toDatabase($this->customer);

                return $notification->type === 'customer_cancelled'
                    && $data['booking_id'] === $booking->id
                    && $data['booking_ref'] === 'IHS-' . str_pad($booking->id, 5, '0', STR_PAD_LEFT)
                    && $data['title'] === 'Booking Cancelled'
                    && str_contains($data['message'], 'Swedish Massage')
                    && str_contains($data['message'], 'cancelled')
                    && $data['url'] === '/my-bookings';
            }
        );
    }

    public function test_cancellation_notification_is_readable_through_existing_notifications_endpoint(): void
    {
        $booking = $this->makeBooking();

        $this->actingAs($this->customer)->postJson('/api/downpayment/cancel', [
            'booking_id'          => $booking->id,
            'cancellation_reason' => 'Change of plans',
        ])->assertOk();

        $response = $this->actingAs($this->customer)->getJson('/api/notifications');
        $response->assertOk();

        $payload = $response->json('notifications');
        $this->assertCount(1, $payload);
        $this->assertSame('customer_cancelled', $payload[0]['type']);
        $this->assertSame('Booking Cancelled', $payload[0]['title']);
        $this->assertSame($booking->id, $payload[0]['booking_id']);
        $this->assertSame('/my-bookings', $payload[0]['url']);
        $this->assertFalse($payload[0]['read']);
    }

    // ── 4: repeated / already-cancelled request → no duplicate ──────────────

    public function test_repeated_cancellation_request_sends_no_duplicate_notification(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking();

        $first = $this->actingAs($this->customer)->postJson('/api/downpayment/cancel', [
            'booking_id'          => $booking->id,
            'cancellation_reason' => 'Change of plans',
        ]);
        $first->assertOk();

        // Simulate a double-submit / retried request against the
        // already-cancelled booking.
        $second = $this->actingAs($this->customer)->postJson('/api/downpayment/cancel', [
            'booking_id'          => $booking->id,
            'cancellation_reason' => 'Change of plans',
        ]);
        $second->assertStatus(422);

        $booking->refresh();
        $this->assertSame('cancelled', $booking->status);

        NotificationFacade::assertSentTimes(BookingNotification::class, 1);
    }

    // ── 5: failed cancellation → zero notifications ──────────────────────────

    public function test_validation_failure_sends_no_notification(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking();

        $response = $this->actingAs($this->customer)->postJson('/api/downpayment/cancel', [
            'booking_id' => $booking->id,
            // missing cancellation_reason
        ]);

        $response->assertStatus(422);
        $booking->refresh();
        $this->assertSame('accepted', $booking->status);

        NotificationFacade::assertNothingSent();
    }

    public function test_cancelling_a_booking_in_a_non_cancellable_state_sends_no_notification(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking(['status' => 'completed']);

        $response = $this->actingAs($this->customer)->postJson('/api/downpayment/cancel', [
            'booking_id'          => $booking->id,
            'cancellation_reason' => 'Change of plans',
        ]);

        $response->assertStatus(422);
        $booking->refresh();
        $this->assertSame('completed', $booking->status);

        NotificationFacade::assertNothingSent();
    }

    public function test_cancelling_another_customers_booking_sends_no_notification(): void
    {
        NotificationFacade::fake();

        $otherCustomer = User::factory()->create(['role' => 'customer']);
        $booking = $this->makeBooking();

        $response = $this->actingAs($otherCustomer)->postJson('/api/downpayment/cancel', [
            'booking_id'          => $booking->id,
            'cancellation_reason' => 'Not mine',
        ]);

        $response->assertStatus(404);
        $booking->refresh();
        $this->assertSame('accepted', $booking->status);

        NotificationFacade::assertNothingSent();
    }

    // ── 6: existing therapist/admin cancellation behavior is unchanged ──────

    public function test_therapist_initiated_cancellation_does_not_send_the_new_customer_cancelled_type(): void
    {
        // NOTE: TherapistBookingController::cancel() — untouched by this
        // step — currently fails independently of this change: it sets
        // cancellation_type => 'therapist', but the DB's
        // bookings_cancellation_type_check constraint only allows
        // 'refunded'|'forfeited'|'no_show'|'expired'. Confirmed pre-existing
        // by reproducing it on the unmodified branch. Fixing it is out of
        // scope here ("existing therapist ... cancellation behavior remains
        // unchanged" / "DO NOT implement ... therapist cancellation
        // notifications"), so this test only asserts what's in this step's
        // scope — that this code path never emits the new customer_cancelled
        // type — regardless of that unrelated failure.
        NotificationFacade::fake();

        $booking = $this->makeBooking();

        $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/cancel", [
                'reason' => 'Unavailable',
            ]);

        NotificationFacade::assertNotSentTo(
            $this->customer,
            BookingNotification::class,
            fn($notification) => $notification->type === 'customer_cancelled'
        );
    }

    public function test_admin_stale_resolution_cancel_still_sends_no_booking_notification(): void
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

        // Admin-triggered cancellation is explicitly out of scope for this
        // step and must not gain a notification as a side effect.
        NotificationFacade::assertNothingSent();
    }
}
