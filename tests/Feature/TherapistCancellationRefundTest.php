<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\LoyaltyReward;
use App\Models\LoyaltyVoucher;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use App\Notifications\BookingNotification;
use App\Services\BookingCancellationService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification as NotificationFacade;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/TherapistCancellationConstraintTest.php. Run with
 * DB_CONNECTION=pgsql pointed at a disposable test database (infinity_spa_
 * test), never sqlite and never the real dev/production database.
 *
 * Batch #28 — CTO-approved customer-protective handling of therapist-caused
 * cancellations:
 *   - a downpayment actually collected (payment_status='paid' AND a
 *     non-null, >0 paid_amount — the one signal that's true regardless of
 *     payment_method/payment_type, see BookingCancellationService::
 *     cancelByTherapist()'s docblock) is always refund-due, bypassing the
 *     customer's 24-hour grace/forfeiture rule and any refund_forfeited_at
 *     lock entirely;
 *   - an unpaid/not-yet-collected booking never gets a phantom refund;
 *   - an eligible used voucher is always restored, once;
 *   - cancellation_type stays 'therapist' for truthful history — the admin
 *     refund queue (AdminBookingController::pendingRefunds()) was widened to
 *     also admit it, instead of relabeling it 'refunded'.
 */
class TherapistCancellationRefundTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $customer;
    private User $therapistUser;
    private Therapist $therapist;
    private Service $service;
    private ServiceVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin    = User::factory()->create(['role' => 'admin']);
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
            'paid_amount'        => 300,
            'downpayment_status' => 'pending',
            'scheduled_start'    => now()->addDays(3),
            'scheduled_end'      => now()->addDays(3)->addHour(),
        ], $overrides));
    }

    private function makeVoucherBooking(array $overrides = []): array
    {
        $reward = LoyaltyReward::create([
            'customer_id'     => $this->customer->id,
            'completed_count' => 5,
            'status'          => 'voucher_issued',
            'reward_cycle'    => 1,
            'total_completed' => 5,
        ]);

        $booking = $this->makeBooking(array_merge([
            'payment_status'     => 'paid',
            'paid_amount'        => 0,
            'downpayment_status' => 'pending',
            'is_voucher_covered' => true,
            'voucher_code'       => 'IHS-FREE-TEST',
        ], $overrides));

        $voucher = LoyaltyVoucher::create([
            'customer_id'        => $this->customer->id,
            'loyalty_reward_id'  => $reward->id,
            'code'               => 'IHS-FREE-TEST',
            'status'             => 'used',
            'expires_at'         => now()->addDays(30),
            'used_at'            => now(),
            'used_in_booking_id' => $booking->id,
        ]);

        return [$booking, $voucher];
    }

    // ── 1: collected-payment booking refunds regardless of time window ───────

    public function test_therapist_cancels_collected_payment_booking_refunds_regardless_of_window(): void
    {
        // Scheduled in 2 hours — well inside the customer's 24h grace
        // window, proving that rule is never applied to therapist fault.
        $booking = $this->makeBooking(['scheduled_start' => now()->addHours(2), 'scheduled_end' => now()->addHours(3)]);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/cancel", ['reason' => 'Emergency']);

        $response->assertOk();
        $booking->refresh();
        $this->assertSame('cancelled', $booking->status);
        $this->assertSame('therapist', $booking->cancellation_type, 'cancellation_type must stay truthful, never relabeled refunded.');
        $this->assertSame('refunded', $booking->downpayment_status);
    }

    // ── 2: refund_forfeited_at does not block, and is not cleared ────────────

    public function test_therapist_cancels_booking_with_existing_refund_forfeited_at(): void
    {
        $forfeitedAt = now()->subDay();
        $booking = $this->makeBooking(['refund_forfeited_at' => $forfeitedAt]);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/cancel", ['reason' => 'Unavailable']);

        $response->assertOk();
        $booking->refresh();
        $this->assertSame('refunded', $booking->downpayment_status, 'Therapist fault must override the forfeiture lock.');
        $this->assertNotNull($booking->refund_forfeited_at, 'refund_forfeited_at must never be cleared.');
        $this->assertEquals($forfeitedAt->toDateTimeString(), $booking->refund_forfeited_at->toDateTimeString());
    }

    // ── 3: unpaid/unverified booking never gets a phantom refund ─────────────

    public function test_therapist_cancels_unpaid_booking_creates_no_phantom_refund(): void
    {
        $booking = $this->makeBooking([
            'payment_status'     => 'pending',
            'paid_amount'        => null,
            'downpayment_status' => 'pending',
        ]);

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/cancel", ['reason' => 'Unavailable']);

        $response->assertOk();
        $booking->refresh();
        $this->assertSame('therapist', $booking->cancellation_type);
        $this->assertSame('pending', $booking->downpayment_status, 'No collected payment means no refund outcome.');
        $this->assertNotContains($booking->downpayment_status, ['refunded', 'refund_sent']);
    }

    // ── 4: eligible voucher restored exactly once ─────────────────────────────

    public function test_therapist_cancels_voucher_booking_restores_voucher(): void
    {
        [$booking, $voucher] = $this->makeVoucherBooking();

        $response = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/cancel", ['reason' => 'Unavailable']);

        $response->assertOk();
        $voucher->refresh();
        $this->assertSame('unused', $voucher->status);
        $this->assertNull($voucher->used_in_booking_id);
        $this->assertNull($voucher->used_at);

        $booking->refresh();
        $this->assertSame('therapist', $booking->cancellation_type);
        // Voucher-covered bookings never carry a monetary downpayment outcome.
        $this->assertSame('pending', $booking->downpayment_status);
    }

    // ── 5: repeat cancellation cannot double-refund or double-restore ────────

    public function test_repeat_cancellation_cannot_create_another_refund_or_restoration(): void
    {
        $booking = $this->makeBooking();

        $first = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/cancel", ['reason' => 'Unavailable']);
        $first->assertOk();

        $second = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/cancel", ['reason' => 'Trying again']);
        $second->assertStatus(422);

        $booking->refresh();
        $this->assertSame('refunded', $booking->downpayment_status, 'Still exactly the one outcome from the first call.');
    }

    public function test_repeat_cancellation_cannot_double_restore_voucher(): void
    {
        [$booking] = $this->makeVoucherBooking();

        $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/cancel", ['reason' => 'Unavailable'])
            ->assertOk();

        $second = $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/cancel", ['reason' => 'Trying again']);
        $second->assertStatus(422);
    }

    // ── 6 & 7: admin refund queue — therapist-caused and customer-caused ─────

    public function test_therapist_caused_eligible_refund_appears_in_admin_queue(): void
    {
        $booking = $this->makeBooking();
        BookingCancellationService::cancelByTherapist($booking, 'Unavailable');

        $response = $this->actingAs($this->admin)->getJson('/admin/api/bookings/pending-refunds');
        $response->assertOk();

        $ids = collect($response->json())->pluck('id');
        $this->assertContains($booking->id, $ids);

        $row = collect($response->json())->firstWhere('id', $booking->id);
        $this->assertSame('therapist', $row['cancellation_type'], 'Must not be relabeled refunded.');
    }

    public function test_existing_customer_caused_refund_still_appears_in_admin_queue(): void
    {
        $booking = $this->makeBooking(['scheduled_start' => now()->addDays(5), 'scheduled_end' => now()->addDays(5)->addHour()]);
        BookingCancellationService::cancel($booking, 'Change of plans');

        $booking->refresh();
        $this->assertSame('refunded', $booking->cancellation_type);

        $response = $this->actingAs($this->admin)->getJson('/admin/api/bookings/pending-refunds');
        $response->assertOk();

        $ids = collect($response->json())->pluck('id');
        $this->assertContains($booking->id, $ids);
    }

    // ── 8: unauthorized user cannot mark refunds sent ─────────────────────────

    public function test_unauthorized_user_cannot_mark_refund_sent(): void
    {
        $booking = $this->makeBooking();
        BookingCancellationService::cancelByTherapist($booking, 'Unavailable');

        $response = $this->actingAs($this->customer)->postJson('/admin/api/bookings/mark-refund-sent', [
            'booking_id'     => $booking->id,
            'bank_reference' => 'BANKREF-1',
        ]);

        $response->assertStatus(302);
        $booking->refresh();
        $this->assertNull($booking->refund_sent_at);
        $this->assertSame('refunded', $booking->downpayment_status);
    }

    // ── 9: admin marks refund sent — reference/timestamp persist ─────────────

    public function test_admin_mark_refund_sent_persists_reference_and_timestamp(): void
    {
        $booking = $this->makeBooking();
        BookingCancellationService::cancelByTherapist($booking, 'Unavailable');

        $response = $this->actingAs($this->admin)->postJson('/admin/api/bookings/mark-refund-sent', [
            'booking_id'     => $booking->id,
            'bank_reference' => 'BANKREF-42',
        ]);

        $response->assertOk();

        $reloaded = Booking::find($booking->id);
        $this->assertSame('refund_sent', $reloaded->downpayment_status);
        $this->assertSame('BANKREF-42', $reloaded->refund_reference);
        $this->assertNotNull($reloaded->refund_sent_at);
    }

    // ── 10: duplicate mark-sent cannot change the original record ────────────

    public function test_duplicate_mark_refund_sent_cannot_overwrite_original(): void
    {
        $booking = $this->makeBooking();
        BookingCancellationService::cancelByTherapist($booking, 'Unavailable');

        $this->actingAs($this->admin)->postJson('/admin/api/bookings/mark-refund-sent', [
            'booking_id'     => $booking->id,
            'bank_reference' => 'BANKREF-ORIGINAL',
        ])->assertOk();

        $second = $this->actingAs($this->admin)->postJson('/admin/api/bookings/mark-refund-sent', [
            'booking_id'     => $booking->id,
            'bank_reference' => 'BANKREF-OVERWRITE-ATTEMPT',
        ]);
        $second->assertStatus(422);

        $reloaded = Booking::find($booking->id);
        $this->assertSame('BANKREF-ORIGINAL', $reloaded->refund_reference);
    }

    // ── 11: notification accurately describes payment state ──────────────────

    public function test_notification_describes_refund_due_state_accurately(): void
    {
        $booking = $this->makeBooking()->load('customer', 'service', 'serviceVariant', 'therapist.user');
        $outcome = ['cancellation_type' => 'therapist', 'refund_due' => true, 'refund_amount' => 300.0, 'voucher_restored' => false];

        $notification = new BookingNotification($booking, 'cancelled', null, null, $outcome);
        $data = $notification->toDatabase($this->customer);

        $this->assertStringContainsString('is being processed', $data['message']);
        $this->assertStringNotContainsString('has been refunded', $data['message']);

        $mail = $notification->toMail($this->customer);
        $rendered = collect($mail->introLines)->implode(' ');
        $this->assertStringContainsString('is being processed', $rendered);
    }

    public function test_notification_does_not_promise_refund_when_unpaid(): void
    {
        $booking = $this->makeBooking()->load('customer', 'service', 'serviceVariant', 'therapist.user');
        $outcome = ['cancellation_type' => 'therapist', 'refund_due' => false, 'refund_amount' => null, 'voucher_restored' => false];

        $notification = new BookingNotification($booking, 'cancelled', null, null, $outcome);
        $data = $notification->toDatabase($this->customer);

        $this->assertStringNotContainsStringIgnoringCase('refund', $data['message']);
        $this->assertStringNotContainsString('AED', $data['message']);
    }

    public function test_existing_cancelled_notification_without_outcome_context_is_unchanged(): void
    {
        $booking = $this->makeBooking()->load('customer', 'service', 'serviceVariant', 'therapist.user');

        $notification = new BookingNotification($booking, 'cancelled');
        $data = $notification->toDatabase($this->customer);

        $this->assertSame("Your Swedish Massage booking for " . Carbon::parse($booking->scheduled_start)->timezone('Asia/Dubai')->format('M j \a\t g:i A') . " has been cancelled.", $data['message']);
    }

    // ── 12: existing customer late-cancellation forfeiture remains intact ────

    public function test_existing_customer_late_cancellation_forfeiture_remains_intact(): void
    {
        NotificationFacade::fake();

        // Within 24h of the session. downpayment_status is deliberately not
        // 'pending' here — BookingCancellationService::cancel()'s own first
        // branch treats a still-'pending' downpayment_status as an
        // automatic refund regardless of the grace window (see
        // RescheduleRefundForfeitureTest's makeBooking(), which sets
        // 'submitted' for the same reason) — 'verified' lets the real
        // $withinGrace computation this test is actually about decide the
        // outcome.
        $booking = $this->makeBooking([
            'downpayment_status' => 'verified',
            'scheduled_start'    => now()->addHours(5),
            'scheduled_end'      => now()->addHours(6),
        ]);

        $response = $this->actingAs($this->customer)->postJson('/api/downpayment/cancel', [
            'booking_id'          => $booking->id,
            'cancellation_reason' => 'Change of plans',
        ]);

        $response->assertOk();
        $booking->refresh();
        $this->assertSame('forfeited', $booking->cancellation_type);
        $this->assertSame('forfeited', $booking->downpayment_status);
    }
}
