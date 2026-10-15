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
use Stripe\WebhookSignature;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/BookingApprovalFlowTest.php. Run with DB_CONNECTION=
 * pgsql pointed at a disposable test database, not sqlite (phpunit.xml's
 * default) and never the real dev database.
 *
 * Covers the new customer payment success/failure in-app + email
 * notifications, triggered from StripePaymentController::handleWebhook():
 *   - checkout.session.completed  → payment_succeeded (the only success
 *     event the existing webhook already handles)
 *   - checkout.session.expired    → payment_failed (the only failure/
 *     abandonment event the existing webhook already handles — no
 *     payment_intent.payment_failed / async_payment_failed handling exists
 *     in this codebase, and adding a new Stripe event type was out of scope)
 *
 * Both handlers already had a payment_status/status guard to make a retried
 * webhook a no-op; that guard now runs inside DB::transaction()+
 * lockForUpdate() so a duplicate/near-simultaneous delivery can't slip past
 * it before the first commits — same existing mechanism, race-hardened,
 * no parallel event-tracking system introduced. notify() only runs on the
 * branch that actually performed the state-changing update.
 */
class PaymentNotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;
    private User $therapistUser;
    private Therapist $therapist;
    private Service $service;
    private ServiceVariant $variant;

    private const WEBHOOK_SECRET = 'whsec_test_secret';

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.stripe.webhook_secret' => self::WEBHOOK_SECRET]);

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
            'status'             => 'pending_payment',
            'payment_status'     => 'pending',
            'scheduled_start'    => now()->addDay(),
            'scheduled_end'      => now()->addDay()->addHour(),
        ], $overrides));
    }

    private function postSignedWebhook(array $eventPayload): \Illuminate\Testing\TestResponse
    {
        $payload = json_encode($eventPayload);
        $header  = WebhookSignature::generateSignatureHeader($payload, self::WEBHOOK_SECRET);

        return $this->call(
            'POST',
            '/webhooks/stripe',
            [],
            [],
            [],
            ['HTTP_Stripe-Signature' => $header, 'CONTENT_TYPE' => 'application/json'],
            $payload
        );
    }

    private function completedEventPayload(Booking $booking, string $eventId = 'evt_completed_1'): array
    {
        return [
            'id'   => $eventId,
            'type' => 'checkout.session.completed',
            'data' => [
                'object' => [
                    'id'             => $booking->stripe_checkout_session_id,
                    'amount_total'   => 30000,
                    'payment_intent' => 'pi_test_' . $booking->id,
                    'metadata'       => [
                        'booking_id'   => (string) $booking->id,
                        'payment_type' => 'full',
                    ],
                ],
            ],
        ];
    }

    private function expiredEventPayload(Booking $booking, string $eventId = 'evt_expired_1'): array
    {
        return [
            'id'   => $eventId,
            'type' => 'checkout.session.expired',
            'data' => [
                'object' => [
                    'id'       => $booking->stripe_checkout_session_id,
                    'metadata' => [
                        'booking_id' => (string) $booking->id,
                    ],
                ],
            ],
        ];
    }

    // ── 1, 2: successful payment → exactly 1 in-app + 1 email ────────────────

    public function test_successful_payment_sends_exactly_one_notification_with_database_and_mail_channels(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking(['stripe_checkout_session_id' => 'cs_test_success_1']);

        $response = $this->postSignedWebhook($this->completedEventPayload($booking));
        $response->assertOk();

        NotificationFacade::assertSentTimes(BookingNotification::class, 1);
        NotificationFacade::assertSentTo(
            $this->customer,
            BookingNotification::class,
            function ($notification, $channels) use ($booking) {
                return $notification->type === 'payment_succeeded'
                    && $notification->booking->id === $booking->id
                    && in_array('database', $channels, true)
                    && in_array('mail', $channels, true);
            }
        );
    }

    public function test_successful_payment_notification_content_is_correct(): void
    {
        $booking = $this->makeBooking(['stripe_checkout_session_id' => 'cs_test_success_content']);

        $this->postSignedWebhook($this->completedEventPayload($booking))->assertOk();

        $response = $this->actingAs($this->customer)->getJson('/api/notifications');
        $response->assertOk();

        $payload = $response->json('notifications');
        $this->assertCount(1, $payload);
        $this->assertSame('payment_succeeded', $payload[0]['type']);
        $this->assertSame('Payment Successful', $payload[0]['title']);
        $this->assertSame($booking->id, $payload[0]['booking_id']);
        $this->assertSame('/my-bookings', $payload[0]['url']);
        $this->assertStringContainsString('300.00', $payload[0]['message']);
        $this->assertStringContainsString('Swedish Massage', $payload[0]['message']);
    }

    // ── 3, 4: failed payment → exactly 1 in-app + 1 email ─────────────────────

    public function test_failed_payment_sends_exactly_one_notification_with_database_and_mail_channels(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking(['stripe_checkout_session_id' => 'cs_test_expired_1']);

        $response = $this->postSignedWebhook($this->expiredEventPayload($booking));
        $response->assertOk();

        NotificationFacade::assertSentTimes(BookingNotification::class, 1);
        NotificationFacade::assertSentTo(
            $this->customer,
            BookingNotification::class,
            function ($notification, $channels) use ($booking) {
                return $notification->type === 'payment_failed'
                    && $notification->booking->id === $booking->id
                    && in_array('database', $channels, true)
                    && in_array('mail', $channels, true);
            }
        );
    }

    public function test_failed_payment_notification_content_is_correct(): void
    {
        $booking = $this->makeBooking(['stripe_checkout_session_id' => 'cs_test_expired_content']);

        $this->postSignedWebhook($this->expiredEventPayload($booking))->assertOk();

        $response = $this->actingAs($this->customer)->getJson('/api/notifications');
        $response->assertOk();

        $payload = $response->json('notifications');
        $this->assertCount(1, $payload);
        $this->assertSame('payment_failed', $payload[0]['type']);
        $this->assertSame('Payment Failed', $payload[0]['title']);
        $this->assertSame($booking->id, $payload[0]['booking_id']);
        $this->assertStringContainsString('Swedish Massage', $payload[0]['message']);
        $this->assertStringContainsString('could not be completed', $payload[0]['message']);
    }

    // ── 5: repeated successful webhook → no duplicate ────────────────────────

    public function test_repeated_successful_webhook_sends_no_duplicate_notification(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking(['stripe_checkout_session_id' => 'cs_test_success_retry']);

        $this->postSignedWebhook($this->completedEventPayload($booking, 'evt_completed_a'))->assertOk();
        // Stripe retries redeliver the same (or a follow-up) event for an
        // already-'paid' booking — simulate with a second delivery.
        $this->postSignedWebhook($this->completedEventPayload($booking, 'evt_completed_b'))->assertOk();

        $booking->refresh();
        $this->assertSame('paid', $booking->payment_status);

        NotificationFacade::assertSentTimes(BookingNotification::class, 1);
    }

    // ── 6: repeated failed webhook → no duplicate ─────────────────────────────

    public function test_repeated_expired_webhook_sends_no_duplicate_notification(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking(['stripe_checkout_session_id' => 'cs_test_expired_retry']);

        $this->postSignedWebhook($this->expiredEventPayload($booking, 'evt_expired_a'))->assertOk();
        $this->postSignedWebhook($this->expiredEventPayload($booking, 'evt_expired_b'))->assertOk();

        $booking->refresh();
        $this->assertSame('cancelled', $booking->status);
        $this->assertSame('expired', $booking->cancellation_type);

        NotificationFacade::assertSentTimes(BookingNotification::class, 1);
    }

    // ── 7: notification belongs only to the correct customer ─────────────────

    public function test_notification_is_scoped_to_the_owning_customer_only(): void
    {
        NotificationFacade::fake();

        $otherCustomer = User::factory()->create(['role' => 'customer']);
        $booking = $this->makeBooking(['stripe_checkout_session_id' => 'cs_test_scope_1']);

        $this->postSignedWebhook($this->completedEventPayload($booking))->assertOk();

        NotificationFacade::assertSentTo(
            $this->customer,
            BookingNotification::class,
            fn($n) => $n->type === 'payment_succeeded'
        );
        NotificationFacade::assertNothingSentTo($otherCustomer);
        NotificationFacade::assertNothingSentTo($this->therapistUser);
    }

    // ── 8: existing booking/payment state transitions are unchanged ──────────

    public function test_existing_payment_success_state_transition_is_unchanged(): void
    {
        $booking = $this->makeBooking([
            'stripe_checkout_session_id' => 'cs_test_state_1',
            'status'                     => 'pending_payment',
        ]);

        $this->postSignedWebhook($this->completedEventPayload($booking))->assertOk();

        $booking->refresh();
        $this->assertSame('pending', $booking->status, 'Payment confirmation still only advances to pending, never accepted.');
        $this->assertSame('paid', $booking->payment_status);
        $this->assertSame('300.00', $booking->paid_amount);
    }

    public function test_existing_payment_success_does_not_clobber_a_therapist_decision_made_before_payment(): void
    {
        $booking = $this->makeBooking([
            'stripe_checkout_session_id' => 'cs_test_state_2',
            'status'                     => 'accepted',
        ]);

        $this->postSignedWebhook($this->completedEventPayload($booking))->assertOk();

        $booking->refresh();
        $this->assertSame('accepted', $booking->status);
        $this->assertSame('paid', $booking->payment_status);
    }

    public function test_existing_payment_success_does_not_resurrect_a_cancelled_booking(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking([
            'stripe_checkout_session_id' => 'cs_test_state_3',
            'status'                     => 'cancelled',
            'cancellation_type'          => 'expired',
            'cancelled_at'               => now(),
        ]);

        $this->postSignedWebhook($this->completedEventPayload($booking))->assertOk();

        $booking->refresh();
        $this->assertSame('cancelled', $booking->status);
        $this->assertSame('pending', $booking->payment_status, 'Still unpaid — the guard must ignore this late event.');

        NotificationFacade::assertNothingSent();
    }

    public function test_existing_expired_webhook_state_transition_is_unchanged(): void
    {
        $booking = $this->makeBooking(['stripe_checkout_session_id' => 'cs_test_state_4']);

        $this->postSignedWebhook($this->expiredEventPayload($booking))->assertOk();

        $booking->refresh();
        $this->assertSame('cancelled', $booking->status);
        $this->assertSame('expired', $booking->cancellation_type);
    }

    public function test_existing_expired_webhook_does_not_touch_an_already_accepted_booking(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking([
            'stripe_checkout_session_id' => 'cs_test_state_5',
            'status'                     => 'accepted',
            'payment_status'             => 'paid',
        ]);

        $this->postSignedWebhook($this->expiredEventPayload($booking))->assertOk();

        $booking->refresh();
        $this->assertSame('accepted', $booking->status);

        NotificationFacade::assertNothingSent();
    }

    // ── 9: existing customer booking notifications still work ────────────────

    public function test_existing_customer_accept_notification_still_works_after_payment(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking(['stripe_checkout_session_id' => 'cs_test_accept_flow']);

        $this->postSignedWebhook($this->completedEventPayload($booking))->assertOk();
        $booking->refresh();
        $this->assertSame('pending', $booking->status);

        $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/accept")
            ->assertOk();

        NotificationFacade::assertSentTimes(BookingNotification::class, 2); // payment_succeeded + accepted
        NotificationFacade::assertSentTo(
            $this->customer,
            BookingNotification::class,
            fn($n) => $n->type === 'accepted'
        );
    }

    // ── 10: existing therapist notifications still work ──────────────────────

    public function test_existing_therapist_new_booking_notification_still_works(): void
    {
        NotificationFacade::fake();

        $response = $this->actingAs($this->customer)->postJson('/api/bookings', [
            'service_id'     => $this->variant->id,
            'therapist_id'   => $this->therapist->id,
            'zone_name'      => 'Test Zone',
            'location'       => 'Test location',
            'datetime'       => now()->addDay()->toDateTimeString(),
            'payment_type'   => 'full',
            'payment_method' => 'cashless',
        ]);
        $response->assertCreated();

        NotificationFacade::assertSentTo(
            $this->therapistUser,
            BookingNotification::class,
            fn($n) => $n->type === 'booking_pending'
        );
    }
}
