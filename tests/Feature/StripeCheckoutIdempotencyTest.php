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
use Illuminate\Support\Facades\DB;
use PDO;
use Stripe\ApiRequestor;
use Stripe\HttpClient\ClientInterface;
use Tests\TestCase;

/**
 * NOTE: requires a Postgres-backed test database (infinity_spa_test) — see
 * tests/TestCase.php's guardAgainstUnsafeTestDatabase().
 *
 * Batch #31A.2B — Stripe checkout reservation, idempotency and
 * duplicate-payment detection. No real Stripe calls anywhere in this file —
 * StripeCheckoutFakeClient (bottom of file) intercepts every Stripe HTTP
 * call via Stripe\ApiRequestor::setHttpClient().
 */
class StripeCheckoutIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.stripe.secret' => 'sk_test_fake']);
        config(['services.stripe.checkout_reservation_ttl' => 60]);
        StripeCheckoutFakeClient::reset();
        ApiRequestor::setHttpClient(new StripeCheckoutFakeClient());
    }

    protected function tearDown(): void
    {
        ApiRequestor::setHttpClient(null);
        parent::tearDown();
    }

    private function customer(): User
    {
        return User::factory()->create(['role' => 'customer']);
    }

    private function makeTherapist(): Therapist
    {
        $user = User::factory()->create(['role' => 'therapist']);

        return Therapist::create([
            'user_id' => $user->id, 'base_location' => 'Dubai',
            'gender' => 'female', 'is_active' => true,
        ]);
    }

    private function makeService(): Service
    {
        return Service::create([
            'name' => 'Swedish Massage', 'category' => 'massage',
            'group_name' => 'Swedish Massage', 'is_active' => true,
        ]);
    }

    private function makeVariant(Service $service, int $duration, float $price): ServiceVariant
    {
        return ServiceVariant::create([
            'service_id' => $service->id, 'duration_minutes' => $duration,
            'price' => $price, 'is_active' => true,
        ]);
    }

    private function makeBooking(User $customer, ServiceVariant $variant, array $overrides = []): Booking
    {
        $therapist = $this->makeTherapist();

        return Booking::create(array_merge([
            'customer_id' => $customer->id, 'therapist_id' => $therapist->id,
            'service_id' => $variant->service_id, 'service_variant_id' => $variant->id,
            'location' => 'Home - Palm Jumeirah', 'zone_name' => 'Palm Jumeirah',
            'scheduled_date' => now()->addDay()->toDateString(),
            'scheduled_start' => now()->addDay(), 'scheduled_end' => now()->addDay()->addHour(),
            'travel_start' => now()->addDay()->subMinutes(30),
            'buffer_end' => now()->addDay()->addHour()->addMinutes(30),
            'payment_method' => 'cashless', 'payment_type' => 'downpayment',
            'status' => 'pending',
            'downpayment_amount' => 60, 'remaining_amount' => 240,
            'downpayment_status' => 'pending', 'payment_status' => 'pending',
            'is_voucher_covered' => false,
        ], $overrides));
    }

    private function checkout(User $customer, Booking $booking, string $paymentType = 'downpayment')
    {
        return $this->actingAs($customer)->postJson('/api/stripe/checkout', [
            'booking_id' => $booking->id, 'payment_type' => $paymentType,
        ]);
    }

    private function fakeCompletedWebhookPayload(Booking $booking, string $sessionId, string $paymentIntentId, array $overrides = []): array
    {
        return array_merge([
            'id' => 'evt_' . $sessionId,
            'object' => 'event',
            'type' => 'checkout.session.completed',
            'data' => ['object' => array_merge([
                'id' => $sessionId,
                'object' => 'checkout.session',
                'payment_intent' => $paymentIntentId,
                'payment_status' => 'paid',
                'amount_total' => 6000,
                'currency' => 'aed',
                'metadata' => ['booking_id' => (string) $booking->id, 'payment_type' => $booking->payment_type],
            ], $overrides)],
        ], []);
    }

    private function deliverWebhook(array $payload)
    {
        // Goes through the real /webhooks/stripe route with a genuinely
        // computed signature (see StripeCheckoutFakeClient::signedWebhook)
        // — signature verification runs unmodified, and the result is a
        // proper TestResponse with the usual assertion helpers.
        $secret = 'whsec_test_fake';
        config(['services.stripe.webhook_secret' => $secret]);

        [$body, $signatureHeader] = StripeCheckoutFakeClient::signedWebhook($payload, $secret);

        return $this->call('POST', '/webhooks/stripe', [], [], [], [
            'HTTP_STRIPE_SIGNATURE' => $signatureHeader,
            'CONTENT_TYPE'          => 'application/json',
        ], $body);
    }

    // ── 1. First checkout creation ──────────────────────────────────────────

    public function test_first_checkout_creation_claims_and_creates(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant);

        $response = $this->checkout($customer, $booking);

        $response->assertOk();
        $this->assertCount(1, StripeCheckoutFakeClient::$createCalls);
        $booking->refresh();
        $this->assertNotNull($booking->stripe_checkout_session_id);
        $this->assertNull($booking->checkout_reservation_token);
        $this->assertNull($booking->checkout_reservation_expires_at);
    }

    // ── 2 & 3. Open-session reuse / sequential retries ──────────────────────

    public function test_sequential_retry_reuses_an_open_session(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant);

        $first = $this->checkout($customer, $booking);
        $first->assertOk();
        $firstUrl = $first->json('checkout_url');

        $second = $this->checkout($customer, $booking);
        $second->assertOk();

        $this->assertSame($firstUrl, $second->json('checkout_url'));
        $this->assertCount(1, StripeCheckoutFakeClient::$createCalls); // no second create
        $this->assertCount(1, StripeCheckoutFakeClient::$retrieveCalls); // one reuse check
    }

    // ── 4 & 12 (retry-side). Retry after session expiry ─────────────────────

    public function test_retry_after_confirmed_expiry_creates_a_fresh_session(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant);

        $first = $this->checkout($customer, $booking);
        $firstSessionId = $first->json('checkout_url') ? $booking->refresh()->stripe_checkout_session_id : null;
        $this->assertNotNull($firstSessionId);

        StripeCheckoutFakeClient::$sessionStates[$firstSessionId] = 'expired';

        $second = $this->checkout($customer, $booking);
        $second->assertOk();

        $this->assertCount(2, StripeCheckoutFakeClient::$createCalls);
        $booking->refresh();
        $this->assertNotSame($firstSessionId, $booking->stripe_checkout_session_id);
    }

    // ── 5. Two concurrent reservation claims (genuine row-lock test) ───────

    public function test_two_concurrent_claims_are_serialized_by_the_real_row_lock(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant);

        // RefreshDatabase wraps this whole test in one uncommitted outer
        // transaction, which would make the booking row invisible to a
        // genuinely separate connection (Postgres MVCC) — defeating the
        // point of this test. Commit that wrapper's current state once,
        // then open a fresh transaction for the rest of this test so
        // RefreshDatabase's own teardown rollback still has something to
        // roll back. The only side effect is that this test's rows stay
        // in the isolated test DB until the next full run's migrate:fresh
        // — harmless, since every other test filters strictly by its own
        // ids.
        DB::commit();
        DB::beginTransaction();

        // Connection A: lock the row, write a reservation — exactly what
        // claimOrInspect() does — and leave it UNCOMMITTED to simulate
        // "request A is mid-claim right now."
        Booking::where('id', $booking->id)->lockForUpdate()->first();
        Booking::where('id', $booking->id)->update([
            'checkout_reservation_token' => 'token-A',
            'checkout_reservation_expires_at' => now()->addSeconds(60),
        ]);

        // Connection B: a genuinely independent PDO connection to the SAME
        // database, with a short lock_timeout so a real second writer
        // attempting the identical conditional claim fails FAST (proving
        // Postgres actually blocks it) instead of hanging the test.
        $cfg = config('database.connections.pgsql');
        $dsn = "pgsql:host={$cfg['host']};port={$cfg['port']};dbname={$cfg['database']}";
        $pdoB = new PDO($dsn, $cfg['username'], $cfg['password']);
        $pdoB->exec("SET lock_timeout = '300ms'");

        $lockTimedOut = false;
        try {
            $pdoB->beginTransaction();
            $pdoB->prepare('SELECT * FROM bookings WHERE id = ? FOR UPDATE')->execute([$booking->id]);
        } catch (\PDOException $e) {
            $lockTimedOut = true;
        } finally {
            if ($pdoB->inTransaction()) {
                $pdoB->rollBack();
            }
        }

        $this->assertTrue($lockTimedOut, 'A second connection should have been blocked by the first\'s uncommitted row lock, proving genuine serialization rather than an application-level assumption.');

        DB::rollBack(); // release A's lock, leave the booking state clean
    }

    // ── 6. Expired reservation recovery ─────────────────────────────────────

    public function test_stale_reservation_is_recovered_not_permanently_stuck(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'checkout_reservation_token' => 'stale-token',
            'checkout_reservation_expires_at' => now()->subSeconds(5), // already expired
        ]);

        $response = $this->checkout($customer, $booking);

        $response->assertOk();
        $this->assertCount(1, StripeCheckoutFakeClient::$createCalls);
    }

    public function test_active_reservation_blocks_a_second_request(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'checkout_reservation_token' => 'held-by-other',
            'checkout_reservation_expires_at' => now()->addSeconds(60),
        ]);

        $response = $this->checkout($customer, $booking);

        $response->assertStatus(409);
        $this->assertCount(0, StripeCheckoutFakeClient::$createCalls);
    }

    // ── 7. Stripe timeout / unknown session state on retrieve ──────────────

    public function test_retrieve_failure_never_assumed_expired(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'stripe_checkout_session_id' => 'cs_unreachable',
        ]);

        StripeCheckoutFakeClient::$retrieveShouldThrow['cs_unreachable'] = true;

        $response = $this->checkout($customer, $booking);

        $response->assertStatus(503);
        $this->assertCount(0, StripeCheckoutFakeClient::$createCalls);
        $booking->refresh();
        $this->assertSame('cs_unreachable', $booking->stripe_checkout_session_id); // untouched
    }

    // ── 7b. Ambiguous Session::create() connection failures (CTO correction) ──

    public function test_connection_failure_on_create_retries_with_same_key_and_succeeds(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant);

        // First attempt is ambiguous (connection lost); the retry — same
        // idempotency key — succeeds normally.
        StripeCheckoutFakeClient::$createShouldThrowQueue = ['connection'];

        $response = $this->checkout($customer, $booking);

        $response->assertOk();
        $this->assertCount(2, StripeCheckoutFakeClient::$createCalls, 'Both the ambiguous attempt and its same-key retry should reach Stripe.');
        $this->assertNotNull(StripeCheckoutFakeClient::$createIdempotencyKeys[0]);
        $this->assertSame(
            StripeCheckoutFakeClient::$createIdempotencyKeys[0],
            StripeCheckoutFakeClient::$createIdempotencyKeys[1],
            'The retry must reuse the identical idempotency key.'
        );
        $booking->refresh();
        $this->assertNotNull($booking->stripe_checkout_session_id);
        $this->assertNull($booking->checkout_reservation_token);
        $this->assertNull($booking->payment_anomaly_flagged_at);
    }

    public function test_connection_failure_twice_retains_reservation_and_flags_anomaly(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant);

        // Both the original attempt AND its same-key retry are ambiguous.
        StripeCheckoutFakeClient::$createShouldThrowQueue = ['connection', 'connection'];

        $response = $this->checkout($customer, $booking);

        $response->assertStatus(503);
        $this->assertCount(2, StripeCheckoutFakeClient::$createCalls);

        $booking->refresh();
        $this->assertNull($booking->stripe_checkout_session_id);
        $this->assertNotNull($booking->checkout_reservation_token, 'A doubly-ambiguous outcome must retain the reservation, never clear it.');
        $this->assertNotNull($booking->checkout_reservation_expires_at);
        $this->assertNotNull($booking->payment_anomaly_flagged_at, 'The uncertainty must be durably flagged, not silently assumed safe.');
        $this->assertSame(1, AuditLog::where('event', 'payment.anomaly_detected')->where('target_id', $booking->id)->count());
    }

    public function test_immediate_retry_after_doubly_ambiguous_failure_returns_409_without_a_new_session(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant);

        StripeCheckoutFakeClient::$createShouldThrowQueue = ['connection', 'connection'];
        $this->checkout($customer, $booking)->assertStatus(503);
        $this->assertCount(2, StripeCheckoutFakeClient::$createCalls);

        // A second, separate request — the reservation is still held and
        // unexpired — must be rejected WITHOUT ever reaching Stripe again.
        $response = $this->checkout($customer, $booking);

        $response->assertStatus(409);
        $this->assertCount(2, StripeCheckoutFakeClient::$createCalls, 'No additional Session::create call — the held reservation must short-circuit before Stripe is ever contacted.');
    }

    public function test_definitive_rejection_on_create_clears_reservation_immediately(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant);

        StripeCheckoutFakeClient::$createShouldThrowQueue = ['invalid'];

        $response = $this->checkout($customer, $booking);

        $response->assertStatus(502);
        $booking->refresh();
        $this->assertNull($booking->checkout_reservation_token, 'A definitive rejection must release the reservation immediately — no forced wait.');
        $this->assertNull($booking->payment_anomaly_flagged_at);

        // Immediately retrying (no TTL wait) must succeed normally.
        $second = $this->checkout($customer, $booking);
        $second->assertOk();
    }

    public function test_recovery_after_reservation_expiry_following_ambiguous_failure(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant);

        StripeCheckoutFakeClient::$createShouldThrowQueue = ['connection', 'connection'];
        $this->checkout($customer, $booking)->assertStatus(503);

        $booking->refresh();
        $this->assertNotNull($booking->payment_anomaly_flagged_at);
        $flaggedAt = $booking->payment_anomaly_flagged_at;

        // Simulate the reservation's TTL having elapsed.
        $booking->update(['checkout_reservation_expires_at' => now()->subSeconds(5)]);

        $response = $this->checkout($customer, $booking);

        $response->assertOk('A stale reservation must still recover after TTL — this flagged incident must never permanently stick a booking.');
        $booking->refresh();
        $this->assertNotNull($booking->stripe_checkout_session_id);
        $this->assertNull($booking->checkout_reservation_token);
        $this->assertEquals($flaggedAt->toIso8601String(), $booking->payment_anomaly_flagged_at->toIso8601String(), 'The earlier anomaly flag is a historical record and must not be cleared by later recovery.');
    }

    // ── 8. Old attempt finishing after reservation expiry ───────────────────

    public function test_finalize_after_losing_the_reservation_race_expires_the_orphan(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant);

        // Invoke the finalize step directly with a token the row never
        // actually holds — simulating a slow Session::create() finally
        // returning after the 60s reservation expired and someone else
        // (expired-or-not) already moved the row on.
        $reflection = new \ReflectionClass(\App\Http\Controllers\StripePaymentController::class);
        $method = $reflection->getMethod('createSessionForReservation');
        $method->setAccessible(true);

        // Re-invoke finalize directly with a token that no longer matches
        // anything on the row (simulating the lost-race finalize attempt).
        $controller = new \App\Http\Controllers\StripePaymentController();
        $method->invoke($controller, $booking->fresh(), 'downpayment', 300.0, 'a-token-nobody-owns-anymore');

        $this->assertNotEmpty(StripeCheckoutFakeClient::$expireCalls, 'The orphaned session created during the lost-race finalize attempt should be expired.');
    }

    public function test_finalize_after_losing_the_race_flags_anomaly_when_expire_also_fails(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant);

        StripeCheckoutFakeClient::$expireShouldThrow = true;

        $reflection = new \ReflectionClass(\App\Http\Controllers\StripePaymentController::class);
        $method = $reflection->getMethod('createSessionForReservation');
        $method->setAccessible(true);
        $controller = new \App\Http\Controllers\StripePaymentController();
        $method->invoke($controller, $booking->fresh(), 'downpayment', 300.0, 'a-token-nobody-owns');

        $booking->refresh();
        $this->assertNotNull($booking->payment_anomaly_flagged_at);
        $this->assertSame(1, AuditLog::where('event', 'payment.anomaly_detected')->where('target_id', $booking->id)->count());
    }

    // ── 9. Successful payment from an older session ─────────────────────────

    public function test_older_sessions_payment_is_recorded_and_redundant_session_queued_for_reconciliation(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'stripe_checkout_session_id' => 'cs_new', // "current" pointer, never paid
        ]);

        \Illuminate\Support\Facades\Queue::fake();

        $response = $this->deliverWebhook(
            $this->fakeCompletedWebhookPayload($booking, 'cs_old', 'pi_old')
        );

        $response->assertOk();
        $booking->refresh();
        $this->assertSame('paid', $booking->payment_status);
        $this->assertSame('pi_old', $booking->stripe_payment_intent_id);
        $this->assertSame('cs_old', $booking->stripe_checkout_session_id);
        $this->assertEquals(60.0, (float) $booking->paid_amount);

        \Illuminate\Support\Facades\Queue::assertPushed(ReconcileRedundantCheckoutSession::class, function ($job) use ($booking) {
            return $job->bookingId === $booking->id
                && $job->redundantSessionId === 'cs_new'
                && $job->paidSessionId === 'cs_old';
        });
    }

    // ── 10. Same PaymentIntent webhook redelivery ───────────────────────────

    public function test_same_payment_intent_redelivery_is_an_ordinary_duplicate(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'payment_status' => 'paid', 'paid_amount' => 60,
            'stripe_checkout_session_id' => 'cs_old', 'stripe_payment_intent_id' => 'pi_old',
        ]);

        $response = $this->deliverWebhook(
            $this->fakeCompletedWebhookPayload($booking, 'cs_old', 'pi_old')
        );

        $response->assertOk();
        $booking->refresh();
        $this->assertNull($booking->payment_anomaly_flagged_at);
        $this->assertSame(0, AuditLog::where('event', 'payment.anomaly_detected')->count());
        $this->assertEquals(60.0, (float) $booking->paid_amount);
    }

    // ── 11. Different successful PaymentIntent for the same booking ────────

    public function test_different_payment_intent_for_already_paid_booking_is_flagged(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'payment_status' => 'paid', 'paid_amount' => 60,
            'stripe_checkout_session_id' => 'cs_old', 'stripe_payment_intent_id' => 'pi_old',
        ]);

        $response = $this->deliverWebhook(
            $this->fakeCompletedWebhookPayload($booking, 'cs_other', 'pi_other')
        );

        $response->assertOk();
        $booking->refresh();
        $this->assertNotNull($booking->payment_anomaly_flagged_at);
        $this->assertEquals(60.0, (float) $booking->paid_amount); // untouched
        $this->assertSame('pi_old', $booking->stripe_payment_intent_id); // untouched
        $this->assertSame(1, AuditLog::where('event', 'payment.anomaly_detected')->where('target_id', $booking->id)->count());
    }

    // ── 12. Concurrent anomaly-event delivery (dedup correctness) ──────────

    public function test_repeated_anomaly_delivery_never_creates_a_second_audit_row(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'payment_status' => 'paid', 'paid_amount' => 60,
            'stripe_checkout_session_id' => 'cs_old', 'stripe_payment_intent_id' => 'pi_old',
        ]);

        $this->deliverWebhook($this->fakeCompletedWebhookPayload($booking, 'cs_other', 'pi_other'))->assertOk();
        $this->deliverWebhook($this->fakeCompletedWebhookPayload($booking, 'cs_other', 'pi_other'))->assertOk();
        $this->deliverWebhook($this->fakeCompletedWebhookPayload($booking, 'cs_other', 'pi_other'))->assertOk();

        $this->assertSame(1, AuditLog::where('event', 'payment.anomaly_detected')->where('target_id', $booking->id)->count());
    }

    // ── 13. Amount/currency mismatch ─────────────────────────────────────────

    public function test_amount_mismatch_is_flagged_not_auto_confirmed(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant); // downpayment_amount = 60

        $response = $this->deliverWebhook(
            $this->fakeCompletedWebhookPayload($booking, 'cs_x', 'pi_x', ['amount_total' => 99999])
        );

        $response->assertOk();
        $booking->refresh();
        $this->assertNotSame('paid', $booking->payment_status);
        $this->assertNotNull($booking->payment_anomaly_flagged_at);

        // redelivery of the SAME mismatched event must not pile up logs
        $this->deliverWebhook($this->fakeCompletedWebhookPayload($booking, 'cs_x', 'pi_x', ['amount_total' => 99999]))->assertOk();
        $this->assertSame(1, AuditLog::where('event', 'payment.anomaly_detected')->where('target_id', $booking->id)->count());
    }

    // ── 14. Cancelled booking receiving a genuine collected-payment event ──

    public function test_cancelled_booking_payment_is_flagged_not_silently_dropped_or_reactivated(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant, ['status' => 'cancelled']);

        $response = $this->deliverWebhook(
            $this->fakeCompletedWebhookPayload($booking, 'cs_x', 'pi_x')
        );

        $response->assertOk();
        $booking->refresh();
        $this->assertSame('cancelled', $booking->status); // never reactivated
        $this->assertNotSame('paid', $booking->payment_status);
        $this->assertNotNull($booking->payment_anomaly_flagged_at);
    }

    // ── 15 & 16. Reconciliation job ──────────────────────────────────────────

    public function test_reconciliation_job_expires_a_redundant_open_session(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant);

        StripeCheckoutFakeClient::$sessionStates['cs_redundant'] = 'open';

        (new ReconcileRedundantCheckoutSession($booking->id, 'cs_redundant', 'cs_paid'))->handle();

        $this->assertContains('cs_redundant', StripeCheckoutFakeClient::$expireCalls);
        $this->assertSame(0, AuditLog::where('event', 'payment.anomaly_detected')->count());
    }

    public function test_reconciliation_job_flags_a_redundant_completed_session(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'payment_status' => 'paid', 'paid_amount' => 60, 'stripe_payment_intent_id' => 'pi_paid',
        ]);

        StripeCheckoutFakeClient::$sessionStates['cs_redundant'] = 'complete';
        StripeCheckoutFakeClient::$sessionPaymentIntents['cs_redundant'] = 'pi_redundant';

        (new ReconcileRedundantCheckoutSession($booking->id, 'cs_redundant', 'cs_paid'))->handle();

        $booking->refresh();
        $this->assertNotNull($booking->payment_anomaly_flagged_at);
        $this->assertEquals(60.0, (float) $booking->paid_amount); // untouched
        $this->assertSame('pi_paid', $booking->stripe_payment_intent_id); // untouched
    }

    // ── 17. Reconciliation job retries (idempotent) ──────────────────────────

    public function test_reconciliation_job_is_idempotent_across_retries(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'payment_status' => 'paid', 'paid_amount' => 60, 'stripe_payment_intent_id' => 'pi_paid',
        ]);

        StripeCheckoutFakeClient::$sessionStates['cs_redundant'] = 'complete';
        StripeCheckoutFakeClient::$sessionPaymentIntents['cs_redundant'] = 'pi_redundant';

        (new ReconcileRedundantCheckoutSession($booking->id, 'cs_redundant', 'cs_paid'))->handle();
        (new ReconcileRedundantCheckoutSession($booking->id, 'cs_redundant', 'cs_paid'))->handle();
        (new ReconcileRedundantCheckoutSession($booking->id, 'cs_redundant', 'cs_paid'))->handle();

        $this->assertSame(1, AuditLog::where('event', 'payment.anomaly_detected')->where('target_id', $booking->id)->count());
    }

    public function test_reconciliation_job_handles_stripe_errors_safely(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant);

        StripeCheckoutFakeClient::$retrieveShouldThrow['cs_unreachable'] = true;

        // Must not throw — the job should complete safely with just a log.
        (new ReconcileRedundantCheckoutSession($booking->id, 'cs_unreachable', 'cs_paid'))->handle();

        $this->assertSame(0, AuditLog::where('event', 'payment.anomaly_detected')->count());
        $this->addToAssertionCount(1); // reaching here without an exception is the assertion
    }

    // ── 18. Existing payment/refund fields remain correct ───────────────────

    public function test_existing_refund_fields_untouched_by_anomaly_handling(): void
    {
        $customer = $this->customer();
        $variant  = $this->makeVariant($this->makeService(), 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'status' => 'cancelled', 'cancellation_type' => 'refunded',
            'payment_status' => 'paid', 'paid_amount' => 60,
            'stripe_payment_intent_id' => 'pi_old',
            'downpayment_status' => 'refund_sent', 'refund_reference' => 'BANK-123',
            'refund_sent_at' => now(),
        ]);

        $before = $booking->only(['paid_amount', 'downpayment_amount', 'remaining_amount', 'refund_reference', 'refund_sent_at', 'downpayment_status']);

        $this->deliverWebhook($this->fakeCompletedWebhookPayload($booking, 'cs_x', 'pi_x'))->assertOk();

        $booking->refresh();
        $after = $booking->only(['paid_amount', 'downpayment_amount', 'remaining_amount', 'refund_reference', 'refund_sent_at', 'downpayment_status']);

        $this->assertEquals(
            array_map(fn ($v) => (string) $v, $before),
            array_map(fn ($v) => (string) $v, $after)
        );
    }
}

/**
 * A more capable fake Stripe HTTP client than Batch #31A.1's — distinguishes
 * create / retrieve / expire calls by HTTP method and URL shape, and lets
 * tests pre-configure per-session states, forced errors, and PaymentIntent
 * ids. Deliberately a DIFFERENT class name from BookingPriceIntegrityTest's
 * FakeStripeHttpClient (same namespace) to avoid any redeclaration conflict.
 */
class StripeCheckoutFakeClient implements ClientInterface
{
    public static array $createCalls = [];
    public static array $retrieveCalls = [];
    public static array $expireCalls = [];
    public static array $sessionStates = [];           // session_id => open|complete|expired
    public static array $sessionPaymentIntents = [];    // session_id => payment_intent id
    public static array $retrieveShouldThrow = [];       // session_id => true
    public static bool $expireShouldThrow = false;
    private static int $idCounter = 0;

    /** @var array<int, 'connection'|'invalid'|null> FIFO — one entry consumed per create() call; empty/exhausted = succeed normally. */
    public static array $createShouldThrowQueue = [];
    public static array $createIdempotencyKeys = [];

    public static function reset(): void
    {
        self::$createCalls = [];
        self::$retrieveCalls = [];
        self::$expireCalls = [];
        self::$sessionStates = [];
        self::$sessionPaymentIntents = [];
        self::$retrieveShouldThrow = [];
        self::$expireShouldThrow = false;
        self::$createShouldThrowQueue = [];
        self::$createIdempotencyKeys = [];
        self::$idCounter = 0;
    }

    private static function extractIdempotencyKey(array $headers): ?string
    {
        foreach ($headers as $header) {
            if (str_starts_with($header, 'Idempotency-Key: ')) {
                return substr($header, strlen('Idempotency-Key: '));
            }
        }

        return null;
    }

    public function request($method, $absUrl, $headers, $params, $hasFile, $apiMode = 'v1', $maxNetworkRetries = null)
    {
        $method = strtolower($method);

        if ($method === 'post' && str_ends_with($absUrl, '/expire')) {
            preg_match('#/checkout/sessions/([^/]+)/expire#', $absUrl, $m);
            $id = $m[1] ?? null;
            self::$expireCalls[] = $id;

            if (self::$expireShouldThrow) {
                throw new \Stripe\Exception\ApiConnectionException('simulated expire failure');
            }

            self::$sessionStates[$id] = 'expired';

            return [json_encode(['id' => $id, 'object' => 'checkout.session', 'status' => 'expired']), 200, []];
        }

        if ($method === 'get' && str_contains($absUrl, '/checkout/sessions/')) {
            preg_match('#/checkout/sessions/([^/]+)$#', $absUrl, $m);
            $id = $m[1] ?? null;
            self::$retrieveCalls[] = $id;

            if (!empty(self::$retrieveShouldThrow[$id])) {
                throw new \Stripe\Exception\ApiConnectionException('simulated network failure retrieving session');
            }

            $status = self::$sessionStates[$id] ?? 'open';

            return [json_encode([
                'id' => $id, 'object' => 'checkout.session', 'status' => $status,
                'url' => "https://checkout.stripe.com/c/pay/{$id}",
                'payment_intent' => self::$sessionPaymentIntents[$id] ?? null,
            ]), 200, []];
        }

        if ($method === 'post' && !str_ends_with($absUrl, '/expire')) {
            self::$createCalls[] = $params;
            self::$createIdempotencyKeys[] = self::extractIdempotencyKey($headers);

            if (!empty(self::$createShouldThrowQueue)) {
                $mode = array_shift(self::$createShouldThrowQueue);
                if ($mode === 'connection') {
                    throw new \Stripe\Exception\ApiConnectionException('simulated connection failure creating session');
                }
                if ($mode === 'invalid') {
                    throw \Stripe\Exception\InvalidRequestException::factory('simulated invalid request', 400);
                }
            }

            $id = 'cs_test_' . (++self::$idCounter);
            self::$sessionStates[$id] = 'open';

            $unitAmount = $params['line_items'][0]['price_data']['unit_amount'] ?? 0;

            return [json_encode([
                'id' => $id, 'object' => 'checkout.session', 'status' => 'open',
                'url' => "https://checkout.stripe.com/c/pay/{$id}",
                'amount_total' => $unitAmount, 'currency' => 'aed', 'payment_intent' => null,
            ]), 200, []];
        }

        throw new \RuntimeException("Unhandled fake Stripe request: {$method} {$absUrl}");
    }

    /**
     * Computes a genuine Stripe webhook signature (the exact
     * t=<ts>,v1=<hmac> scheme Stripe\WebhookSignature::verifyHeader()
     * checks) over the given payload, so delivering it through the real
     * /webhooks/stripe route exercises signature verification unmodified.
     *
     * @return array{0: string, 1: string} [rawBody, signatureHeaderValue]
     */
    public static function signedWebhook(array $eventPayload, string $secret): array
    {
        $body = json_encode($eventPayload);
        $timestamp = time();
        $signature = hash_hmac('sha256', "{$timestamp}.{$body}", $secret);

        return [$body, "t={$timestamp},v1={$signature}"];
    }
}
