<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification as NotificationFacade;
use Stripe\WebhookSignature;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/StaleActiveSessionTest.php. Run with DB_CONNECTION=
 * pgsql pointed at a disposable test database, not sqlite (phpunit.xml's
 * default) and never the real dev database.
 *
 * Covers the payment-confirmation → therapist-approval flow:
 * pending_payment -> (Stripe paid / voucher redeemed) -> pending
 *   -> therapist accept/reject -> accepted / rejected
 *
 * Payment or voucher confirmation must land on 'pending', never 'accepted' —
 * therapist approval is a separate, required step.
 */
class BookingApprovalFlowTest extends TestCase
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
            'service_id'        => $this->service->id,
            'duration_minutes'  => 60,
            'price'             => 300,
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

    // ── Stripe webhook: checkout.session.completed ──────────────────────────

    public function test_stripe_payment_confirmation_moves_booking_to_pending_not_accepted(): void
    {
        $booking = $this->makeBooking([
            'stripe_checkout_session_id' => 'cs_test_123',
        ]);

        $response = $this->postSignedWebhook([
            'id'   => 'evt_test_1',
            'type' => 'checkout.session.completed',
            'data' => [
                'object' => [
                    'id'             => 'cs_test_123',
                    'amount_total'   => 30000,
                    'payment_intent' => 'pi_test_123',
                    'metadata'       => [
                        'booking_id'   => (string) $booking->id,
                        'payment_type' => 'full',
                    ],
                ],
            ],
        ]);

        $response->assertOk();

        $booking->refresh();
        $this->assertSame('pending', $booking->status, 'Payment confirmation must set pending, awaiting therapist approval — not accepted.');
        $this->assertSame('paid', $booking->payment_status);
    }

    public function test_stripe_webhook_does_not_resurrect_a_cancelled_booking(): void
    {
        $booking = $this->makeBooking([
            'stripe_checkout_session_id' => 'cs_test_456',
            'status'                     => 'cancelled',
            'cancellation_type'          => 'expired',
            'cancelled_at'               => now(),
        ]);

        $response = $this->postSignedWebhook([
            'id'   => 'evt_test_2',
            'type' => 'checkout.session.completed',
            'data' => [
                'object' => [
                    'id'             => 'cs_test_456',
                    'amount_total'   => 30000,
                    'payment_intent' => 'pi_test_456',
                    'metadata'       => [
                        'booking_id'   => (string) $booking->id,
                        'payment_type' => 'full',
                    ],
                ],
            ],
        ]);

        $response->assertOk();

        $booking->refresh();
        $this->assertSame('cancelled', $booking->status, 'A late payment event must not resurrect an already-cancelled booking.');
    }

    public function test_stripe_webhook_does_not_downgrade_a_booking_the_therapist_already_accepted(): void
    {
        // A therapist can accept/reject a 'pending_payment' booking before
        // Stripe confirms payment (see Therapist/Bookings.jsx accept-button
        // eligibility). If payment then confirms, it must not clobber that
        // decision back down to 'pending'.
        $booking = $this->makeBooking([
            'stripe_checkout_session_id' => 'cs_test_789',
            'status'                     => 'accepted',
        ]);

        $response = $this->postSignedWebhook([
            'id'   => 'evt_test_3',
            'type' => 'checkout.session.completed',
            'data' => [
                'object' => [
                    'id'             => 'cs_test_789',
                    'amount_total'   => 30000,
                    'payment_intent' => 'pi_test_789',
                    'metadata'       => [
                        'booking_id'   => (string) $booking->id,
                        'payment_type' => 'full',
                    ],
                ],
            ],
        ]);

        $response->assertOk();

        $booking->refresh();
        $this->assertSame('accepted', $booking->status, 'A therapist decision made before payment confirmed must not be overwritten.');
        $this->assertSame('paid', $booking->payment_status);
    }

    // ── Voucher-covered booking creation ─────────────────────────────────────

    public function test_voucher_covered_booking_is_created_pending_not_accepted(): void
    {
        $this->actingAs($this->customer);

        $response = $this->postJson('/api/bookings', [
            'service_id'         => $this->variant->id,
            'therapist_id'       => $this->therapist->id,
            'zone_name'          => 'Test Zone',
            'location'           => 'Test location',
            'datetime'           => now()->addDay()->toDateTimeString(),
            'is_voucher_covered' => true,
            'voucher_code'       => 'TESTVOUCHER',
        ]);

        $response->assertCreated();

        $booking = Booking::latest('id')->first();
        $this->assertSame('pending', $booking->status, 'A voucher-covered booking must still await therapist approval, not skip straight to accepted.');
        $this->assertSame('paid', $booking->payment_status);
        $this->assertTrue((bool) $booking->is_voucher_covered);
    }

    // ── Therapist accept/reject is unchanged ─────────────────────────────────

    public function test_therapist_can_still_accept_a_pending_booking(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking([
            'status'         => 'pending',
            'payment_status' => 'paid',
        ]);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/accept");

        $response->assertOk();

        $booking->refresh();
        $this->assertSame('accepted', $booking->status);
    }

    public function test_therapist_can_still_reject_a_pending_booking(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking([
            'status'         => 'pending',
            'payment_status' => 'paid',
        ]);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/reject", [
                'reason' => 'Not available',
            ]);

        $response->assertOk();

        $booking->refresh();
        $this->assertSame('rejected', $booking->status);
    }

    // ── My Bookings grouping matches the corrected semantics ────────────────

    public function test_my_bookings_groups_paid_but_unapproved_booking_under_pending_not_upcoming(): void
    {
        $paidAwaitingTherapist = $this->makeBooking([
            'status'         => 'pending',
            'payment_status' => 'paid',
        ]);
        $awaitingPayment = $this->makeBooking([
            'status'         => 'pending_payment',
            'payment_status' => 'pending',
        ]);
        $confirmed = $this->makeBooking([
            'status'         => 'accepted',
            'payment_status' => 'paid',
        ]);

        $response = $this->actingAs($this->customer)->getJson('/api/my-bookings');
        $response->assertOk();

        $pendingIds  = collect($response->json('pending'))->pluck('id')->all();
        $upcomingIds = collect($response->json('upcoming'))->pluck('id')->all();

        $this->assertContains($paidAwaitingTherapist->id, $pendingIds, 'A paid booking still awaiting therapist approval belongs in the Pending tab.');
        $this->assertContains($awaitingPayment->id, $pendingIds);
        $this->assertContains($confirmed->id, $upcomingIds, 'Only a therapist-accepted booking belongs in the Upcoming tab.');
        $this->assertNotContains($paidAwaitingTherapist->id, $upcomingIds);
    }
}
