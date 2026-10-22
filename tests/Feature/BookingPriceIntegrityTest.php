<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Stripe\ApiRequestor;
use Stripe\HttpClient\ClientInterface;
use Tests\TestCase;

/**
 * NOTE: requires a Postgres-backed test database (infinity_spa_test) — see
 * tests/TestCase.php's guardAgainstUnsafeTestDatabase().
 *
 * Batch #31A.1 — historical booking price & Stripe checkout integrity:
 *   - StripePaymentController::createCheckoutSession() must charge the
 *     booking's own persisted amount, never the live serviceVariant price.
 *   - BookingController::myBookings() and AdminBookingController::
 *     formatBooking() must display the persisted historical total, never
 *     the live catalog price.
 *
 * No real Stripe calls are made anywhere in this file — FakeStripeHttpClient
 * below is installed via Stripe\ApiRequestor::setHttpClient() so every
 * Session::create() call is intercepted and answered locally.
 */
class BookingPriceIntegrityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.stripe.secret' => 'sk_test_fake']);
        FakeStripeHttpClient::$capturedParams = null;
        ApiRequestor::setHttpClient(new FakeStripeHttpClient());
    }

    protected function tearDown(): void
    {
        ApiRequestor::setHttpClient(null);
        parent::tearDown();
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function customer(): User
    {
        return User::factory()->create(['role' => 'customer']);
    }

    private function makeTherapist(): Therapist
    {
        $user = User::factory()->create(['role' => 'therapist']);

        return Therapist::create([
            'user_id'       => $user->id,
            'base_location' => 'Dubai',
            'gender'        => 'female',
            'is_active'     => true,
        ]);
    }

    private function makeService(string $name = 'Swedish Massage'): Service
    {
        return Service::create([
            'name'       => $name,
            'category'   => 'massage',
            'group_name' => $name,
            'is_active'  => true,
        ]);
    }

    private function makeVariant(Service $service, int $duration, float $price): ServiceVariant
    {
        return ServiceVariant::create([
            'service_id'       => $service->id,
            'duration_minutes' => $duration,
            'price'            => $price,
            'is_active'        => true,
        ]);
    }

    /**
     * @param array<string, mixed> $overrides
     */
    private function makeBooking(User $customer, ServiceVariant $variant, array $overrides = []): Booking
    {
        $therapist = $this->makeTherapist();

        return Booking::create(array_merge([
            'customer_id'         => $customer->id,
            'therapist_id'        => $therapist->id,
            'service_id'          => $variant->service_id,
            'service_variant_id'  => $variant->id,
            'location'            => 'Home - Palm Jumeirah',
            'zone_name'           => 'Palm Jumeirah',
            'scheduled_date'      => now()->addDay()->toDateString(),
            'scheduled_start'     => now()->addDay(),
            'scheduled_end'       => now()->addDay()->addHour(),
            'travel_start'        => now()->addDay()->subMinutes(30),
            'buffer_end'          => now()->addDay()->addHour()->addMinutes(30),
            'payment_method'      => 'cashless',
            'payment_type'        => 'downpayment',
            'status'              => 'pending',
            'downpayment_amount'  => round($variant->price * 0.20, 2),
            'remaining_amount'    => round($variant->price * 0.80, 2),
            'downpayment_status'  => 'pending',
            'payment_status'      => 'pending',
            'is_voucher_covered'  => false,
        ], $overrides));
    }

    // ── Task E.1 / Task D: customer display frozen against a price edit ────

    public function test_customer_booking_total_does_not_change_after_variant_price_edit(): void
    {
        $customer = $this->customer();
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'downpayment_amount' => 60,
            'remaining_amount'   => 240,
        ]);

        // Admin raises the catalog price after the booking already exists.
        $variant->update(['price' => 500]);

        $response = $this->actingAs($customer)->getJson('/api/my-bookings');

        $response->assertOk();
        $all = collect($response->json('pending'))->merge($response->json('upcoming'));
        $row = $all->firstWhere('id', $booking->id);

        $this->assertNotNull($row);
        $this->assertEquals(300, $row['price']); // 60 + 240, the ORIGINAL total — not 500
    }

    // ── Task E.2 / Task D: admin display frozen against a price edit ───────

    public function test_admin_booking_total_does_not_change_after_variant_price_edit(): void
    {
        $customer = $this->customer();
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'downpayment_amount' => 60,
            'remaining_amount'   => 240,
        ]);

        $variant->update(['price' => 500]);

        $response = $this->actingAs($this->admin())->getJson('/admin/api/bookings');

        $response->assertOk();
        $row = collect($response->json())->firstWhere('id', $booking->id);

        $this->assertNotNull($row);
        $this->assertEquals(300, $row['service_price']);
    }

    // ── Task D: remaining_amount itself is frozen at the row level ─────────

    public function test_remaining_amount_column_is_never_recomputed_after_a_price_edit(): void
    {
        $customer = $this->customer();
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'downpayment_amount' => 60,
            'remaining_amount'   => 240,
        ]);

        $variant->update(['price' => 1000]);

        $booking->refresh();
        $this->assertEquals(60, (float) $booking->downpayment_amount);
        $this->assertEquals(240, (float) $booking->remaining_amount);
    }

    // ── Task E.3: full-payment Stripe checkout uses the persisted amount ───

    public function test_full_payment_checkout_uses_original_persisted_amount_not_live_price(): void
    {
        $customer = $this->customer();
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 90, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'payment_type'       => 'full',
            'downpayment_amount' => 300, // full price at creation time
            'remaining_amount'   => 0,
        ]);

        // Admin raises the price AFTER the booking's "amount due" was fixed.
        $variant->update(['price' => 549]);

        $response = $this->actingAs($customer)->postJson('/api/stripe/checkout', [
            'booking_id'   => $booking->id,
            'payment_type' => 'full',
        ]);

        $response->assertOk();
        $this->assertNotNull(FakeStripeHttpClient::$capturedParams);
        $unitAmount = FakeStripeHttpClient::$capturedParams['line_items'][0]['price_data']['unit_amount'];
        $this->assertSame(30000, $unitAmount); // 300 * 100 fils — NOT 549 * 100
    }

    // ── Task E.4: downpayment checkout keeps its own original amount ───────

    public function test_downpayment_checkout_uses_original_persisted_amount_not_live_price(): void
    {
        $customer = $this->customer();
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'downpayment_amount' => 60,
            'remaining_amount'   => 240,
        ]);

        $variant->update(['price' => 800]);

        $response = $this->actingAs($customer)->postJson('/api/stripe/checkout', [
            'booking_id'   => $booking->id,
            'payment_type' => 'downpayment',
        ]);

        $response->assertOk();
        $unitAmount = FakeStripeHttpClient::$capturedParams['line_items'][0]['price_data']['unit_amount'];
        $this->assertSame(6000, $unitAmount); // 60 * 100 — NOT 20% of 800
    }

    public function test_checkout_payment_type_must_match_the_bookings_original_plan(): void
    {
        $customer = $this->customer();
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300);
        $booking  = $this->makeBooking($customer, $variant); // created as 'downpayment'

        $response = $this->actingAs($customer)->postJson('/api/stripe/checkout', [
            'booking_id'   => $booking->id,
            'payment_type' => 'full', // mismatched
        ]);

        $response->assertStatus(422);
        $this->assertNull(FakeStripeHttpClient::$capturedParams);
    }

    // ── Task E.5: voucher-covered booking stays AED 0 ───────────────────────

    public function test_voucher_covered_booking_total_stays_zero_not_live_catalog_price(): void
    {
        $customer = $this->customer();
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'downpayment_amount' => 0,
            'remaining_amount'   => 0,
            'is_voucher_covered' => true,
            'payment_status'     => 'paid',
            'paid_amount'        => 0,
            'status'             => 'pending',
        ]);

        $variant->update(['price' => 999]);

        $response = $this->actingAs($customer)->getJson('/api/my-bookings');
        $response->assertOk();
        $all = collect($response->json('pending'))->merge($response->json('upcoming'));
        $row = $all->firstWhere('id', $booking->id);

        $this->assertEquals(0, $row['price']);
    }

    public function test_voucher_covered_booking_cannot_create_a_checkout_charge(): void
    {
        $customer = $this->customer();
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'downpayment_amount' => 0,
            'remaining_amount'   => 0,
            'is_voucher_covered' => true,
            'payment_status'     => 'pending',
        ]);

        $response = $this->actingAs($customer)->postJson('/api/stripe/checkout', [
            'booking_id'   => $booking->id,
            'payment_type' => 'downpayment',
        ]);

        $response->assertStatus(422);
        $this->assertNull(FakeStripeHttpClient::$capturedParams);
    }

    // ── Task E.6: missing legacy amount never becomes an invented price ────

    public function test_legacy_booking_with_null_amounts_reports_null_not_a_live_price(): void
    {
        $customer = $this->customer();
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'downpayment_amount' => null,
            'remaining_amount'   => null,
            'payment_type'       => null,
            'payment_method'     => 'cash',
            'status'             => 'completed',
        ]);

        $response = $this->actingAs($customer)->getJson('/api/my-bookings');
        $response->assertOk();
        $row = collect($response->json('completed'))->firstWhere('id', $booking->id);

        $this->assertNotNull($row);
        $this->assertNull($row['price']);
    }

    public function test_guest_shaped_booking_with_no_variant_or_snapshot_is_handled_safely_in_admin_view(): void
    {
        $service = $this->makeService();
        $this->makeVariant($service, 60, 300); // live catalog price exists, but must not be substituted

        // Mirrors GuestBookingController::store()'s exact shape: no
        // customer_id, no service_variant_id, no downpayment/remaining.
        $booking = Booking::create([
            'service_id'     => $service->id,
            'location'       => '123 Main St',
            'zone_name'      => 'TBD',
            'scheduled_start'=> now()->addDay(),
            'payment_method' => 'cash',
            'status'         => 'pending',
            'guest_name'     => 'Jane Guest',
            'guest_email'    => 'jane@example.com',
            'guest_phone'    => '0500000000',
        ]);

        $response = $this->actingAs($this->admin())->getJson('/admin/api/bookings');
        $response->assertOk();
        $row = collect($response->json())->firstWhere('id', $booking->id);

        $this->assertNotNull($row);
        $this->assertNull($row['service_price']);
    }

    public function test_legacy_null_amount_booking_cannot_be_charged_via_checkout(): void
    {
        $customer = $this->customer();
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'downpayment_amount' => null,
            'remaining_amount'   => null,
            'payment_type'       => null,
        ]);

        $response = $this->actingAs($customer)->postJson('/api/stripe/checkout', [
            'booking_id'   => $booking->id,
            'payment_type' => 'downpayment',
        ]);

        $response->assertStatus(422);
        $this->assertNull(FakeStripeHttpClient::$capturedParams);
    }

    // ── Task E.7: already-paid / ineligible bookings cannot be re-charged ──

    public function test_already_paid_booking_cannot_create_a_new_checkout_charge(): void
    {
        $customer = $this->customer();
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'payment_status' => 'paid',
            'paid_amount'    => 60,
            'status'         => 'accepted',
        ]);

        $response = $this->actingAs($customer)->postJson('/api/stripe/checkout', [
            'booking_id'   => $booking->id,
            'payment_type' => 'downpayment',
        ]);

        $response->assertStatus(422);
        $this->assertNull(FakeStripeHttpClient::$capturedParams);
    }

    #[DataProvider('ineligibleStatusProvider')]
    public function test_ineligible_booking_status_cannot_create_a_new_checkout_charge(string $status): void
    {
        $customer = $this->customer();
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'status' => $status,
        ]);

        $response = $this->actingAs($customer)->postJson('/api/stripe/checkout', [
            'booking_id'   => $booking->id,
            'payment_type' => 'downpayment',
        ]);

        $response->assertStatus(422);
        $this->assertNull(FakeStripeHttpClient::$capturedParams);
    }

    public static function ineligibleStatusProvider(): array
    {
        return [
            'cancelled' => ['cancelled'],
            'rejected'  => ['rejected'],
            'completed' => ['completed'],
        ];
    }

    public function test_pending_payment_booking_can_still_create_its_first_checkout(): void
    {
        $customer = $this->customer();
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'status'         => 'pending_payment',
            'payment_status' => 'pending',
        ]);

        $response = $this->actingAs($customer)->postJson('/api/stripe/checkout', [
            'booking_id'   => $booking->id,
            'payment_type' => 'downpayment',
        ]);

        $response->assertOk();
        $this->assertNotNull(FakeStripeHttpClient::$capturedParams);
    }

    // ── Task E.8: existing payment/refund records are never touched ────────

    public function test_existing_payment_and_refund_records_remain_unchanged_after_price_edit_and_display_reads(): void
    {
        $customer = $this->customer();
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300);
        $booking  = $this->makeBooking($customer, $variant, [
            'status'             => 'cancelled',
            'cancellation_type'  => 'refunded',
            'downpayment_status' => 'refund_sent',
            'payment_status'     => 'paid',
            'paid_amount'        => 60,
            'refund_reference'   => 'BANK-REF-123',
            'refund_sent_at'     => now(),
        ]);

        $before = $booking->only([
            'paid_amount', 'downpayment_amount', 'remaining_amount',
            'downpayment_status', 'refund_reference', 'refund_sent_at', 'cancellation_type',
        ]);

        $variant->update(['price' => 777]);

        $this->actingAs($customer)->getJson('/api/my-bookings')->assertOk();
        $this->actingAs($this->admin())->getJson('/admin/api/bookings')->assertOk();

        $booking->refresh();
        $after = $booking->only([
            'paid_amount', 'downpayment_amount', 'remaining_amount',
            'downpayment_status', 'refund_reference', 'refund_sent_at', 'cancellation_type',
        ]);

        $this->assertEquals(
            array_map(fn ($v) => (string) $v, $before),
            array_map(fn ($v) => (string) $v, $after)
        );
    }
}

/**
 * Intercepts every Stripe HTTP call at the SDK's own client boundary
 * (Stripe\ApiRequestor::setHttpClient) so Session::create() runs its real
 * param-building logic but never reaches the network. $capturedParams holds
 * exactly what the controller asked Stripe to charge, for assertion.
 */
class FakeStripeHttpClient implements ClientInterface
{
    public static ?array $capturedParams = null;

    public function request($method, $absUrl, $headers, $params, $hasFile, $apiMode = 'v1', $maxNetworkRetries = null)
    {
        self::$capturedParams = $params;

        $body = json_encode([
            'id'     => 'cs_test_fake_123',
            'object' => 'checkout.session',
            'url'    => 'https://checkout.stripe.com/c/pay/cs_test_fake_123',
        ]);

        return [$body, 200, []];
    }
}
