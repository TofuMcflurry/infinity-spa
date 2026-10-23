<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use PHPUnit\Framework\Attributes\DataProvider;
use Stripe\ApiRequestor;
use Stripe\HttpClient\ClientInterface;
use Tests\TestCase;

class StalePaymentAuditIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private const COMMAND = 'bookings:expire-stale-pending-payment';
    private const EVENT = 'booking.payment_expired';
    private const SENSITIVE = 'SECRET_FIXTURE sk_test_PRIVATE card_fixture raw_provider_payload';

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->startOfSecond());
        Notification::fake();
        Queue::fake();
        config(['services.stripe.secret' => 'sk_test_fake']);
        $this->stripe(fn () => throw new \RuntimeException('Unexpected local Stripe fixture call'));
    }

    protected function tearDown(): void
    {
        ApiRequestor::setHttpClient(null);
        parent::tearDown();
    }

    private function booking(array $overrides = []): Booking
    {
        $service = Service::create(['name' => 'Audit fixture', 'is_active' => true]);
        $variant = ServiceVariant::create(['service_id' => $service->id, 'duration_minutes' => 60, 'price' => 300, 'is_active' => true]);
        $therapist = Therapist::create([
            'user_id' => User::factory()->create(['role' => 'therapist'])->id,
            'base_location' => 'Dubai', 'gender' => 'female', 'is_active' => true,
        ]);
        $booking = Booking::create(array_merge([
            'customer_id' => User::factory()->create(['role' => 'customer'])->id,
            'therapist_id' => $therapist->id, 'service_id' => $service->id, 'service_variant_id' => $variant->id,
            'location' => 'Test location', 'zone_name' => 'Test zone',
            'scheduled_start' => now()->addDay(), 'scheduled_end' => now()->addDay()->addHour(),
            'payment_method' => 'cashless', 'payment_type' => 'downpayment', 'status' => 'pending_payment',
            'payment_status' => 'pending', 'downpayment_status' => 'pending',
            'downpayment_amount' => 60, 'remaining_amount' => 240, 'is_voucher_covered' => false,
            'created_at' => now()->subMinutes(21),
        ], $overrides));
        // created_at is intentionally guarded by the production model.
        $booking->created_at = $overrides['created_at'] ?? now()->subMinutes(21);
        $booking->save();
        return $booking;
    }

    private function runScheduler(int $expected): void
    {
        $this->artisan(self::COMMAND)->expectsOutput("Expired {$expected} stale pending_payment booking(s).")
            ->assertExitCode(0);
    }

    private function stripe(callable $handler): void
    {
        ApiRequestor::setHttpClient(new class($handler) implements ClientInterface {
            public function __construct(private $handler) {}
            public function request($method, $absUrl, $headers, $params, $hasFile, $apiMode = 'v1', $maxNetworkRetries = null)
            {
                return ($this->handler)($method, $absUrl, $headers, $params);
            }
        });
    }

    public function test_stale_unpaid_cancellation_is_system_audited_once_without_other_side_effects(): void
    {
        $booking = $this->booking([
            'stripe_checkout_session_id' => 'cs_retained', 'checkout_reservation_token' => 'reservation-retained',
            'checkout_reservation_expires_at' => now()->addMinute(),
        ]);
        $before = $booking->fresh()->getRawOriginal();
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $this->runScheduler(1);
        $after = $booking->fresh();
        $this->assertSame('cancelled', $after->status);
        $this->assertSame('expired', $after->cancellation_type);
        $this->assertNotNull($after->cancelled_at);
        foreach (['payment_status', 'paid_amount', 'downpayment_status', 'downpayment_amount', 'remaining_amount', 'stripe_checkout_session_id', 'checkout_reservation_token', 'checkout_reservation_expires_at'] as $field) {
            $this->assertSame($before[$field], $after->getRawOriginal($field));
        }
        $audit = AuditLog::where('event', self::EVENT)->sole();
        $this->assertSame('Booking', $audit->target_type);
        $this->assertEquals($booking->id, $audit->target_id);
        $this->assertNull($audit->user_id);
        $this->assertNull($audit->user_name);
        $this->assertNull($audit->user_role);
        $this->assertSame(['source' => 'scheduler', 'stale_after_minutes' => 20], $audit->metadata);
        $this->runScheduler(0);
        $this->assertDatabaseCount('audit_logs', 1);
        Notification::assertNothingSent();
        Queue::assertNothingPushed();
    }

    public static function ineligibleBookings(): array
    {
        return [
            'paid' => ['pending_payment', 'paid', 21],
            'refunded' => ['pending_payment', 'refunded', 21],
            'partially refunded' => ['pending_payment', 'partially_refunded', 21],
            'not stale' => ['pending_payment', 'pending', 19],
            'exact cutoff' => ['pending_payment', 'pending', 20],
            'pending approval' => ['pending', 'pending', 21],
            'accepted' => ['accepted', 'pending', 21],
            'cancelled' => ['cancelled', 'pending', 21],
        ];
    }

    #[DataProvider('ineligibleBookings')]
    public function test_ineligible_booking_is_untouched(string $status, string $paymentStatus, int $age): void
    {
        $booking = $this->booking(['status' => $status, 'payment_status' => $paymentStatus, 'created_at' => now()->subMinutes($age)]);
        $before = $booking->fresh()->getRawOriginal();
        $this->runScheduler(0);
        $this->assertSame($before, $booking->fresh()->getRawOriginal());
        $this->assertDatabaseCount('audit_logs', 0);
        Notification::assertNothingSent();
    }

    public static function unsupportedSnapshots(): array
    {
        return ['null' => [null], 'unknown' => ['unsupported_payment_state']];
    }

    #[DataProvider('unsupportedSnapshots')]
    public function test_null_or_unknown_locked_payment_snapshot_is_never_treated_as_unpaid(?string $state): void
    {
        $booking = $this->booking();
        $before = $booking->fresh()->getRawOriginal();
        // PostgreSQL currently rejects persisted null/unknown values. Exercise
        // the fail-closed guard without weakening those schema constraints.
        $listener = 'eloquent.retrieved: '.Booking::class;
        Event::listen($listener, function (Booking $snapshot) use ($state) { $snapshot->payment_status = $state; });
        try {
            $this->runScheduler(0);
        } finally {
            Event::forget($listener);
        }
        $this->assertSame($before, $booking->fresh()->getRawOriginal());
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public static function concurrentChanges(): array
    {
        return ['payment completes' => [['payment_status' => 'paid']], 'status resolves' => [['status' => 'pending']], 'deadline changes' => [['recent' => true]]];
    }

    #[DataProvider('concurrentChanges')]
    public function test_eligibility_is_rechecked_under_real_row_lock_after_candidate_selection(array $changes): void
    {
        $booking = $this->booking();
        if (isset($changes['recent'])) { $changes = ['created_at' => now()->toDateTimeString()]; }
        $changed = false;
        $locked = false;
        // Inject the intervening committed-state equivalent between selection
        // and locking, within RefreshDatabase. No independent fixture commits.
        Event::listen(QueryExecuted::class, function (QueryExecuted $query) use ($booking, $changes, &$changed, &$locked) {
            if (!str_contains($query->sql, 'from "bookings"') || !str_starts_with($query->sql, 'select')) { return; }
            if (!$changed) {
                $changed = true;
                DB::table('bookings')->where('id', $booking->id)->update($changes);
            } elseif (str_contains($query->sql, 'for update')) {
                $locked = true;
                $this->assertGreaterThan(1, DB::transactionLevel());
            }
        });
        try {
            $this->runScheduler(0);
        } finally {
            Event::forget(QueryExecuted::class);
        }
        $this->assertTrue($changed);
        $this->assertTrue($locked);
        $after = $booking->fresh();
        foreach ($changes as $field => $expected) {
            $this->assertSame($expected, $after->getRawOriginal($field));
        }
        $this->assertNotSame('cancelled', $after->status);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_audit_failure_rolls_back_cancellation_and_next_run_retries_once(): void
    {
        $booking = $this->booking();
        $before = $booking->fresh()->getRawOriginal();
        $listener = 'eloquent.created: '.AuditLog::class;
        Event::listen($listener, fn () => throw new \RuntimeException('Audit failure'));
        try {
            Artisan::call(self::COMMAND);
            $this->fail('Expected audit failure');
        } catch (\RuntimeException $e) {
            $this->assertSame('Audit failure', $e->getMessage());
        } finally {
            Event::forget($listener);
        }
        $this->assertSame($before, $booking->fresh()->getRawOriginal());
        $this->assertDatabaseCount('audit_logs', 0);
        $this->runScheduler(1);
        $this->runScheduler(0);
        $this->assertDatabaseCount('audit_logs', 1);
    }

    public function test_processing_is_bounded_and_later_runs_handle_backlog_without_duplicates(): void
    {
        $booking = $this->booking();
        $row = $booking->fresh()->getRawOriginal();
        unset($row['id']);
        Booking::insert(array_fill(0, 100, $row));
        $this->runScheduler(100);
        $this->assertSame(1, Booking::where('status', 'pending_payment')->count());
        $this->assertDatabaseCount('audit_logs', 100);
        $this->runScheduler(1);
        $this->runScheduler(0);
        $this->assertDatabaseCount('audit_logs', 101);
    }

    public function test_ambiguous_checkout_creation_audit_excludes_sensitive_exception_text(): void
    {
        $booking = $this->booking();
        $calls = 0;
        $this->stripe(function () use (&$calls) {
            $calls++;
            throw new \Stripe\Exception\ApiConnectionException(self::SENSITIVE);
        });
        Log::spy();
        $this->actingAs($booking->customer)->postJson('/api/stripe/checkout', ['booking_id' => $booking->id, 'payment_type' => 'downpayment'])->assertStatus(503);
        $this->assertSame(2, $calls);
        $audit = AuditLog::where('event', 'payment.anomaly_detected')->sole();
        $this->assertSame('unconfirmed_session_creation', $audit->metadata['kind']);
        $this->assertSame('checkout_creation_unconfirmed_after_retry', $audit->metadata['diagnostic_code']);
        $this->assertSame($audit->metadata['idempotency_key'], $audit->metadata['identity']);
        $this->assertStringNotContainsString('SECRET_FIXTURE', json_encode($audit->metadata));
        $this->assertArrayNotHasKey('reason', $audit->metadata);
        $this->assertEquals($booking->customer_id, $audit->user_id);
        $this->assertSame('pending', $booking->fresh()->payment_status);
        $this->postJson('/api/stripe/checkout', ['booking_id' => $booking->id, 'payment_type' => 'downpayment'])->assertStatus(409);
        $this->assertDatabaseCount('audit_logs', 1);
        Log::shouldHaveReceived('error')->withArgs(fn ($message, $context) => ($context['error'] ?? null) === self::SENSITIVE)->once();
    }

    public function test_orphaned_checkout_expiry_audit_excludes_sensitive_exception_and_preserves_deduplication(): void
    {
        $booking = $this->booking();
        $calls = 0;
        $this->stripe(function ($method, $url) use ($booking, &$calls) {
            $calls++;
            if (str_ends_with($url, '/expire')) {
                throw \Stripe\Exception\InvalidRequestException::factory(self::SENSITIVE, 400);
            }
            // Simulate a newer reservation taking ownership during Stripe I/O.
            DB::table('bookings')->where('id', $booking->id)->update(['checkout_reservation_token' => 'newer-reservation']);
            return [json_encode(['id' => 'cs_orphan', 'object' => 'checkout.session', 'status' => 'open', 'url' => 'https://checkout.stripe.com/local-fixture']), 200, []];
        });
        Log::spy();
        $this->actingAs($booking->customer)->postJson('/api/stripe/checkout', ['booking_id' => $booking->id, 'payment_type' => 'downpayment'])->assertStatus(409);
        $audit = AuditLog::where('event', 'payment.anomaly_detected')->sole();
        $this->assertSame('unconfirmed_expiry', $audit->metadata['kind']);
        $this->assertSame('cs_orphan', $audit->metadata['identity']);
        $this->assertSame('orphaned_checkout_expiry_unconfirmed', $audit->metadata['diagnostic_code']);
        $this->assertStringNotContainsString('SECRET_FIXTURE', json_encode($audit->metadata));
        $this->assertArrayNotHasKey('reason', $audit->metadata);
        $this->assertSame('newer-reservation', $booking->fresh()->checkout_reservation_token);
        $this->assertSame('pending', $booking->fresh()->payment_status);
        $this->assertEquals($booking->customer_id, $audit->user_id);
        $this->postJson('/api/stripe/checkout', ['booking_id' => $booking->id, 'payment_type' => 'downpayment'])->assertStatus(409);
        $this->assertSame(2, $calls);
        $this->assertDatabaseCount('audit_logs', 1);
        Log::shouldHaveReceived('warning')->withArgs(fn ($message, $context) => ($context['error'] ?? null) === self::SENSITIVE)->once();
    }
}
