<?php

namespace Tests\Feature;

use App\Jobs\ReconcileRedundantCheckoutSession;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use PHPUnit\Framework\Attributes\DataProvider;
use Stripe\ApiRequestor;
use Stripe\HttpClient\ClientInterface;
use Tests\TestCase;

class StripePaymentAuditTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'whsec_audit_fixture';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.stripe.webhook_secret' => self::SECRET, 'services.stripe.secret' => 'sk_test_fake']);
        Notification::fake();
        Queue::fake();
        // No test in this class may reach Stripe, including an unexpected branch.
        $this->fakeStripe(false);
    }

    protected function tearDown(): void
    {
        ApiRequestor::setHttpClient(null);
        parent::tearDown();
    }

    private function fakeStripe(bool $completedSession): void
    {
        ApiRequestor::setHttpClient(new class($completedSession) implements ClientInterface {
            public function __construct(private bool $completedSession) {}

            public function request($method, $absUrl, $headers, $params, $hasFile, $apiMode = 'v1', $maxNetworkRetries = null)
            {
                if ($this->completedSession && strtolower($method) === 'get' && str_ends_with($absUrl, '/cs_redundant')) {
                    return [json_encode([
                        'id' => 'cs_redundant', 'object' => 'checkout.session', 'status' => 'complete',
                        'payment_intent' => 'pi_extra', 'amount_total' => 6000, 'currency' => 'aed',
                    ]), 200, []];
                }
                throw new \Stripe\Exception\ApiConnectionException('Local Stripe fixture failure');
            }
        });
    }

    private function booking(array $overrides = []): Booking
    {
        $service = Service::create(['name' => 'Audit fixture', 'is_active' => true]);
        $variant = ServiceVariant::create(['service_id' => $service->id, 'duration_minutes' => 60, 'price' => 300, 'is_active' => true]);
        $therapist = Therapist::create([
            'user_id' => User::factory()->create(['role' => 'therapist'])->id,
            'base_location' => 'Dubai', 'gender' => 'female', 'is_active' => true,
        ]);

        return Booking::create(array_merge([
            'customer_id' => User::factory()->create(['role' => 'customer'])->id,
            'therapist_id' => $therapist->id, 'service_id' => $service->id, 'service_variant_id' => $variant->id,
            'location' => 'Test location', 'zone_name' => 'Test zone',
            'scheduled_start' => now()->addDay(), 'scheduled_end' => now()->addDay()->addHour(),
            'payment_method' => 'cashless', 'payment_type' => 'downpayment', 'status' => 'pending_payment',
            'downpayment_amount' => 60, 'remaining_amount' => 240, 'downpayment_status' => 'pending',
            'payment_status' => 'pending', 'stripe_checkout_session_id' => 'cs_current',
            'is_voucher_covered' => false,
        ], $overrides));
    }

    private function payload(Booking $booking, bool $expired = false, array $changes = []): array
    {
        return [
            'id' => 'evt_fixture', 'object' => 'event',
            'type' => $expired ? 'checkout.session.expired' : 'checkout.session.completed',
            'data' => ['object' => array_replace([
                'id' => 'cs_current', 'object' => 'checkout.session', 'payment_intent' => 'pi_first',
                'payment_status' => 'paid', 'amount_total' => 6000, 'currency' => 'aed',
                'metadata' => ['booking_id' => (string) $booking->id, 'untrusted' => 'must-not-be-copied'],
            ], $changes)],
        ];
    }

    private function deliver(array $payload, bool $validSignature = true)
    {
        $body = json_encode($payload);
        $timestamp = time();
        $signature = hash_hmac('sha256', $timestamp.'.'.$body, $validSignature ? self::SECRET : 'wrong_secret');

        return $this->call('POST', '/webhooks/stripe', [], [], [], [
            'HTTP_STRIPE_SIGNATURE' => "t={$timestamp},v1={$signature}", 'CONTENT_TYPE' => 'application/json',
        ], $body);
    }

    private function assertSystemAudit(string $event, Booking $booking, array $metadata): void
    {
        $rows = AuditLog::where('event', $event)->get();
        $this->assertCount(1, $rows);
        $row = $rows->first();
        $this->assertNull($row->user_id);
        $this->assertNull($row->user_name);
        $this->assertNull($row->user_role);
        $this->assertSame('Booking', $row->target_type);
        $this->assertEquals($booking->id, $row->target_id);
        $this->assertSame($metadata, $row->metadata);
    }

    public function test_first_verified_payment_is_system_audited_once_despite_ambient_admin_and_redelivery(): void
    {
        $booking = $this->booking(['checkout_reservation_token' => 'reservation', 'checkout_reservation_expires_at' => now()->addMinute()]);
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $payload = $this->payload($booking);
        $this->deliver($payload)->assertOk();
        $payload['id'] = 'evt_redelivery';
        $this->deliver($payload)->assertOk();
        $this->assertSystemAudit('payment.confirmed', $booking, [
            'stripe_event_id' => 'evt_fixture', 'session_id' => 'cs_current', 'payment_intent_id' => 'pi_first',
            'amount_total' => 6000, 'currency' => 'aed', 'payment_type' => 'downpayment',
        ]);
        $booking->refresh();
        $this->assertSame('paid', $booking->payment_status);
        $this->assertSame('pending', $booking->status);
        $this->assertEquals(60, $booking->paid_amount);
        $this->assertNull($booking->checkout_reservation_token);
        $this->assertNull($booking->checkout_reservation_expires_at);
        Notification::assertSentToTimes($booking->customer, \App\Notifications\BookingNotification::class, 1);
    }

    public function test_valid_older_session_payment_is_confirmed_and_reconciliation_is_preserved(): void
    {
        $booking = $this->booking();
        $this->deliver($this->payload($booking, changes: ['id' => 'cs_older']))->assertOk();
        $this->assertSame('cs_older', $booking->fresh()->stripe_checkout_session_id);
        $this->assertDatabaseCount('audit_logs', 1);
        $this->assertDatabaseHas('audit_logs', ['event' => 'payment.confirmed', 'target_id' => $booking->id]);
        Queue::assertPushed(ReconcileRedundantCheckoutSession::class, fn ($job) => $job->redundantSessionId === 'cs_current' && $job->paidSessionId === 'cs_older');
    }

    public function test_legacy_nullable_payment_type_does_not_prevent_verified_payment(): void
    {
        $booking = $this->booking(['payment_type' => null]);
        $this->deliver($this->payload($booking))->assertOk();
        $this->assertSame('paid', $booking->fresh()->payment_status);
        $this->assertNull(AuditLog::where('event', 'payment.confirmed')->sole()->metadata['payment_type']);
    }

    public static function invalidPayments(): array
    {
        return [
            'unpaid' => [['payment_status' => 'unpaid']],
            'missing intent' => [['payment_intent' => null]],
            'missing booking' => [['metadata' => []]],
            'unknown booking' => [['metadata' => ['booking_id' => '99999999']]],
            'amount mismatch' => [['amount_total' => 6001]],
            'currency mismatch' => [['currency' => 'usd']],
        ];
    }

    #[DataProvider('invalidPayments')]
    public function test_invalid_or_unconfirmed_payment_never_gets_confirmation(array $changes): void
    {
        $booking = $this->booking();
        $this->deliver($this->payload($booking, changes: $changes))->assertOk();
        $this->assertDatabaseMissing('audit_logs', ['event' => 'payment.confirmed']);
        $this->assertSame('pending', $booking->fresh()->payment_status);
        Notification::assertNothingSent();
    }

    public function test_invalid_signature_has_no_mutation_or_audit(): void
    {
        $booking = $this->booking();
        $this->deliver($this->payload($booking), false)->assertStatus(400);
        $this->assertDatabaseCount('audit_logs', 0);
        $this->assertSame('pending', $booking->fresh()->payment_status);
    }

    public static function anomalyBranches(): array
    {
        return [
            'cancelled booking' => [['status' => 'cancelled'], [], 'payment_for_cancelled_booking'],
            'amount mismatch' => [[], ['amount_total' => 7000], 'amount_or_currency_mismatch'],
            'second payment' => [['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_original', 'paid_amount' => 60], [], 'second_successful_payment'],
        ];
    }

    #[DataProvider('anomalyBranches')]
    public function test_webhook_anomaly_is_system_attributed_and_still_deduplicated(array $bookingChanges, array $sessionChanges, string $kind): void
    {
        $booking = $this->booking($bookingChanges);
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $payload = $this->payload($booking, changes: $sessionChanges);
        $this->deliver($payload)->assertOk();
        $this->deliver($payload)->assertOk();
        $row = AuditLog::where('event', 'payment.anomaly_detected')->sole();
        $this->assertNull($row->user_id);
        $this->assertNull($row->user_name);
        $this->assertNull($row->user_role);
        $this->assertSame($kind, $row->metadata['kind']);
        $this->assertEquals($booking->id, $row->target_id);
        $this->assertDatabaseMissing('audit_logs', ['event' => 'payment.confirmed']);
        $this->assertDatabaseCount('audit_logs', 1);
        Notification::assertNothingSent();
    }

    public function test_matching_checkout_expiry_is_system_audited_once(): void
    {
        $booking = $this->booking();
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $payload = $this->payload($booking, true);
        $this->deliver($payload)->assertOk();
        $this->deliver($payload)->assertOk();
        $this->assertSystemAudit('payment.checkout_expired', $booking, ['stripe_event_id' => 'evt_fixture', 'session_id' => 'cs_current']);
        $this->assertSame('cancelled', $booking->fresh()->status);
        $this->assertSame('expired', $booking->fresh()->cancellation_type);
        Notification::assertSentToTimes($booking->customer, \App\Notifications\BookingNotification::class, 1);
    }

    public static function ignoredExpirations(): array
    {
        return [
            'stale session' => [[], ['id' => 'cs_stale']],
            'already paid' => [['status' => 'pending', 'payment_status' => 'paid'], []],
            'cancelled' => [['status' => 'cancelled'], []],
            'accepted' => [['status' => 'accepted'], []],
            'missing booking' => [[], ['metadata' => []]],
        ];
    }

    #[DataProvider('ignoredExpirations')]
    public function test_stale_or_resolved_expiry_has_no_new_audit_or_mutation(array $bookingChanges, array $sessionChanges): void
    {
        $booking = $this->booking($bookingChanges);
        $before = $booking->fresh()->getRawOriginal();
        $this->deliver($this->payload($booking, true, $sessionChanges))->assertOk();
        $this->assertSame($before, $booking->fresh()->getRawOriginal());
        $this->assertDatabaseCount('audit_logs', 0);
        Notification::assertNothingSent();
    }

    public static function auditFailures(): array
    {
        return ['confirmation' => [false, 'payment.confirmed'], 'expiry' => [true, 'payment.checkout_expired']];
    }

    #[DataProvider('auditFailures')]
    public function test_audit_failure_rolls_back_the_entire_mutation_and_redelivery_can_retry(bool $expired, string $event): void
    {
        $booking = $this->booking(['checkout_reservation_token' => 'reservation', 'checkout_reservation_expires_at' => now()->addMinute()]);
        $before = $booking->fresh()->getRawOriginal();
        $listener = 'eloquent.created: '.AuditLog::class;
        Event::listen($listener, function (AuditLog $row) use ($event) {
            if ($row->event === $event) {
                throw new \RuntimeException('Simulated audit persistence failure');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->deliver($this->payload($booking, $expired));
            $this->fail('Audit failure must propagate');
        } catch (\RuntimeException $exception) {
            $this->assertSame('Simulated audit persistence failure', $exception->getMessage());
        } finally {
            Event::forget($listener);
        }
        $this->assertSame($before, $booking->fresh()->getRawOriginal());
        $this->assertDatabaseCount('audit_logs', 0);
        Notification::assertNothingSent();
        Queue::assertNothingPushed();
        $this->deliver($this->payload($booking, $expired))->assertOk();
        $this->deliver($this->payload($booking, $expired))->assertOk();
        $this->assertDatabaseCount('audit_logs', 1);
        $this->assertDatabaseHas('audit_logs', ['event' => $event, 'target_id' => $booking->id]);
    }

    public function test_reconciliation_job_is_system_attributed_and_deduplicates_against_webhook(): void
    {
        $booking = $this->booking(['payment_status' => 'paid', 'paid_amount' => 60, 'stripe_payment_intent_id' => 'pi_original']);
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $this->fakeStripe(true);
        $job = new ReconcileRedundantCheckoutSession($booking->id, 'cs_redundant', 'cs_current');
        $job->handle();
        $job->handle();
        $this->deliver($this->payload($booking, changes: ['id' => 'cs_redundant', 'payment_intent' => 'pi_extra']))->assertOk();
        $row = AuditLog::where('event', 'payment.anomaly_detected')->sole();
        $this->assertNull($row->user_id);
        $this->assertNull($row->user_name);
        $this->assertNull($row->user_role);
        $this->assertSame('pi_extra', $row->metadata['identity']);
        $this->assertDatabaseCount('audit_logs', 1);
        $this->assertSame('pi_original', $booking->fresh()->stripe_payment_intent_id);
    }

    public function test_customer_checkout_anomaly_preserves_customer_actor(): void
    {
        $booking = $this->booking(['status' => 'pending', 'stripe_checkout_session_id' => null]);
        $this->actingAs($booking->customer)->postJson('/api/stripe/checkout', [
            'booking_id' => $booking->id, 'payment_type' => 'downpayment',
        ])->assertStatus(503);
        $row = AuditLog::where('event', 'payment.anomaly_detected')->sole();
        $this->assertEquals($booking->customer_id, $row->user_id);
        $this->assertSame($booking->customer->name, $row->user_name);
        $this->assertSame('customer', $row->user_role);
        $this->assertSame('unconfirmed_session_creation', $row->metadata['kind']);
        $this->assertDatabaseMissing('audit_logs', ['event' => 'payment.confirmed']);
    }
}
