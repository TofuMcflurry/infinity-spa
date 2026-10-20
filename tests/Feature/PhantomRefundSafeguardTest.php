<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use App\Services\BookingCancellationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/TherapistCancellationConstraintTest.php. Run with
 * DB_CONNECTION=pgsql pointed at a disposable test database (infinity_spa_
 * test), never sqlite and never the real dev/production database.
 *
 * Batch #28.1 — supersedes the deleted CustomerCancellationPhantomRefundDefectTest
 * (which asserted the BUG existed; this file asserts the FIX). Covers
 * BookingCancellationService::hasConfirmedCollection() — the combined
 * evidence rule approved by the CTO after a confirmed-live audit of the dev
 * database found:
 *
 *   - 2 genuinely admin-verified legacy bank-transfer bookings (downpayment_
 *     verified_at set, payment_status/paid_amount never populated — those
 *     Stripe columns didn't exist when that flow ran) that a naive
 *     Stripe-only check would have wrongly excluded from ever being
 *     refundable.
 *   - 6 already-mislabeled rows (downpayment_status='refunded' with no
 *     real evidence under either source) proving the original defect is
 *     live, not theoretical.
 *
 * hasConfirmedCollection() = (payment_status='paid' AND paid_amount>0)
 *                         OR (downpayment_verified_at IS NOT NULL)
 *
 * — deliberately NOT downpayment_status==='verified' (that value is
 * overwritten to 'refunded'/'forfeited'/'refund_sent' the moment this exact
 * cancellation runs, which would erase the evidence for every legacy
 * booking this check exists to protect), and deliberately NOT
 * downpayment_status==='submitted' or payment_status='paid' with a NULL
 * paid_amount (both ambiguous, not confirmations).
 */
class PhantomRefundSafeguardTest extends TestCase
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
            'payment_type'       => 'downpayment',
            'status'             => 'pending_payment',
            'payment_status'     => 'pending',
            'paid_amount'        => null,
            'downpayment_amount' => 60,
            'remaining_amount'   => 240,
            'downpayment_status' => 'pending',
        ], $overrides));
    }

    private function cancelAsCustomer(Booking $booking, string $reason = 'Change of plans'): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->customer)->postJson('/api/downpayment/cancel', [
            'booking_id'          => $booking->id,
            'cancellation_reason' => $reason,
        ]);
    }

    // ── 1: unpaid Stripe booking cancellation produces no monetary refund ────

    public function test_customer_cancels_unpaid_pending_payment_booking_produces_no_monetary_refund(): void
    {
        $booking = $this->makeBooking(['scheduled_start' => now()->addDays(5), 'scheduled_end' => now()->addDays(5)->addHour()]);

        $response = $this->cancelAsCustomer($booking);

        $response->assertOk();
        $response->assertJsonPath('cancellation_type', null);
        $booking->refresh();
        $this->assertSame('cancelled', $booking->status);
        $this->assertNull($booking->cancellation_type);
        $this->assertSame('pending', $booking->downpayment_status, 'Must be left untouched, not forced to refunded or forfeited.');
        $this->assertStringContainsString('nothing to refund', strtolower($response->json('downpayment')));
    }

    // ── 2: unpaid booking never appears in Admin pending refunds ──────────────

    public function test_unpaid_booking_never_appears_in_admin_pending_refunds(): void
    {
        $booking = $this->makeBooking(['scheduled_start' => now()->addDays(5), 'scheduled_end' => now()->addDays(5)->addHour()]);
        $this->cancelAsCustomer($booking)->assertOk();

        $response = $this->actingAs($this->admin)->getJson('/admin/api/bookings/pending-refunds');
        $response->assertOk();

        $this->assertNotContains($booking->id, collect($response->json())->pluck('id'));
    }

    // ── 3: Admin cannot mark unpaid booking as refund sent, even if the ──────
    //      status column was already incorrectly stored as 'refunded'
    //      (mirrors dev-data rows #179/#174/#10/#3/#24 exactly)

    public function test_admin_cannot_mark_an_incorrectly_labeled_unpaid_booking_as_refund_sent(): void
    {
        $booking = $this->makeBooking([
            'status'             => 'cancelled',
            'cancelled_at'       => now(),
            'cancellation_type'  => 'refunded',
            'downpayment_status' => 'refunded',
            'payment_status'     => 'pending',
            'paid_amount'        => null,
        ]);

        // It would still surface as a candidate by the shallow filter...
        $queue = $this->actingAs($this->admin)->getJson('/admin/api/bookings/pending-refunds');
        $queue->assertOk();
        $this->assertNotContains($booking->id, collect($queue->json())->pluck('id'), 'hasConfirmedCollection() must exclude it despite the stored status.');

        // ...and markRefundSent() must independently refuse it too.
        $response = $this->actingAs($this->admin)->postJson('/admin/api/bookings/mark-refund-sent', [
            'booking_id'     => $booking->id,
            'bank_reference' => 'WOULD-BE-A-REAL-WIRE-TRANSFER',
        ]);
        $response->assertStatus(422);

        $booking->refresh();
        $this->assertSame('refunded', $booking->downpayment_status, 'Must stay exactly as it was — not advanced to refund_sent.');
        $this->assertNull($booking->refund_sent_at);
    }

    // ── 4: payment_status='paid' with paid_amount=NULL is ambiguous, not ─────
    //      verified collection (mirrors dev-data row #147 exactly)

    public function test_paid_status_with_null_amount_is_not_sufficient_evidence(): void
    {
        $booking = $this->makeBooking([
            'status'             => 'cancelled',
            'cancelled_at'       => now(),
            'cancellation_type'  => 'no_show',
            'downpayment_status' => 'refunded',
            'payment_status'     => 'paid',
            'paid_amount'        => null,
        ]);

        $this->assertFalse(BookingCancellationService::hasConfirmedCollection($booking->fresh()));

        $queue = $this->actingAs($this->admin)->getJson('/admin/api/bookings/pending-refunds');
        $this->assertNotContains($booking->id, collect($queue->json())->pluck('id'));

        $this->actingAs($this->admin)->postJson('/admin/api/bookings/mark-refund-sent', [
            'booking_id'     => $booking->id,
            'bank_reference' => 'SHOULD-NOT-PROCESS',
        ])->assertStatus(422);
    }

    // ── 5: Stripe-confirmed paid booking outside 24h — legitimate refund ─────

    public function test_stripe_confirmed_paid_booking_cancelled_outside_24h_remains_refund_eligible(): void
    {
        $booking = $this->makeBooking([
            'status'          => 'accepted',
            'payment_status'  => 'paid',
            'paid_amount'     => 60,
            'scheduled_start' => now()->addDays(5),
            'scheduled_end'   => now()->addDays(5)->addHour(),
        ]);

        $response = $this->cancelAsCustomer($booking);

        $response->assertOk();
        $response->assertJsonPath('cancellation_type', 'refunded');
        $booking->refresh();
        $this->assertSame('refunded', $booking->downpayment_status);
    }

    // ── 6: Stripe-confirmed paid booking inside 24h — forfeiture preserved ───

    public function test_stripe_confirmed_paid_booking_cancelled_inside_24h_retains_forfeiture(): void
    {
        $booking = $this->makeBooking([
            'status'          => 'accepted',
            'payment_status'  => 'paid',
            'paid_amount'     => 60,
            'scheduled_start' => now()->addHours(5),
            'scheduled_end'   => now()->addHours(6),
        ]);

        $response = $this->cancelAsCustomer($booking);

        $response->assertOk();
        $response->assertJsonPath('cancellation_type', 'forfeited');
        $booking->refresh();
        $this->assertSame('forfeited', $booking->downpayment_status);
    }

    // ── 7: paid booking with an existing refund_forfeited_at lock ────────────

    public function test_paid_booking_with_refund_forfeited_at_preserves_forfeiture(): void
    {
        $booking = $this->makeBooking([
            'status'              => 'accepted',
            'payment_status'      => 'paid',
            'paid_amount'         => 60,
            'refund_forfeited_at' => now()->subDay(),
            // Looks "safe" (a week away) — the lock must still win.
            'scheduled_start'     => now()->addDays(7),
            'scheduled_end'       => now()->addDays(7)->addHour(),
        ]);

        $response = $this->cancelAsCustomer($booking);

        $response->assertJsonPath('cancellation_type', 'forfeited');
        $booking->refresh();
        $this->assertSame('forfeited', $booking->downpayment_status);
        $this->assertNotNull($booking->refund_forfeited_at, 'Must never be cleared.');
    }

    // ── 8: historical verified bank-transfer booking remains refundable ──────

    public function test_legacy_verified_booking_remains_refundable_when_policy_permits(): void
    {
        $booking = $this->makeBooking([
            'status'                   => 'accepted',
            'payment_status'           => 'pending', // Stripe columns never populated for this era
            'paid_amount'              => null,
            'downpayment_status'       => 'verified',
            'downpayment_submitted_at' => now()->subDays(2),
            'downpayment_verified_at'  => now()->subDay(),
            'scheduled_start'          => now()->addDays(5),
            'scheduled_end'            => now()->addDays(5)->addHour(),
        ]);

        $response = $this->cancelAsCustomer($booking);

        $response->assertOk();
        $response->assertJsonPath('cancellation_type', 'refunded');
        $booking->refresh();
        $this->assertSame('refunded', $booking->downpayment_status);
    }

    // ── 9: historical verified booking remains recognizable as collected ────
    //      AFTER cancellation — the core durability requirement: evidence
    //      must survive downpayment_status being overwritten to 'refunded'.

    public function test_legacy_verified_booking_remains_recognizable_as_collected_after_cancellation(): void
    {
        $booking = $this->makeBooking([
            'status'                  => 'accepted',
            'payment_status'          => 'pending',
            'paid_amount'             => null,
            'downpayment_status'      => 'verified',
            'downpayment_verified_at' => now()->subDay(),
            'scheduled_start'         => now()->addDays(5),
            'scheduled_end'           => now()->addDays(5)->addHour(),
        ]);

        $this->cancelAsCustomer($booking)->assertOk();
        $booking->refresh();

        // downpayment_status no longer says 'verified' — it says 'refunded'
        // now — but the durable timestamp must still prove collection.
        $this->assertSame('refunded', $booking->downpayment_status);
        $this->assertNotNull($booking->downpayment_verified_at);
        $this->assertTrue(BookingCancellationService::hasConfirmedCollection($booking));

        $queue = $this->actingAs($this->admin)->getJson('/admin/api/bookings/pending-refunds');
        $this->assertContains($booking->id, collect($queue->json())->pluck('id'));
    }

    // ── 10: submitted-only legacy booking is NOT treated as verified ─────────

    public function test_submitted_only_legacy_booking_is_not_treated_as_verified(): void
    {
        $booking = $this->makeBooking([
            'status'                   => 'accepted',
            'payment_status'           => 'pending',
            'paid_amount'              => null,
            'downpayment_status'       => 'submitted',
            'downpayment_submitted_at' => now()->subHours(2),
            'downpayment_verified_at'  => null,
            'scheduled_start'          => now()->addDays(5),
            'scheduled_end'            => now()->addDays(5)->addHour(),
        ]);

        $response = $this->cancelAsCustomer($booking);

        $response->assertOk();
        $booking->refresh();
        $this->assertNull($booking->cancellation_type);
        $this->assertSame('submitted', $booking->downpayment_status, 'Must be left untouched — "submitted" alone is not evidence of collection.');

        $queue = $this->actingAs($this->admin)->getJson('/admin/api/bookings/pending-refunds');
        $this->assertNotContains($booking->id, collect($queue->json())->pluck('id'));
    }

    // ── 11: therapist-caused cancellation of a legacy-verified booking ───────
    //      remains customer-protective (refund_due true) even with no
    //      Stripe trace at all

    public function test_therapist_cancellation_of_legacy_verified_booking_remains_refund_due(): void
    {
        $booking = $this->makeBooking([
            'status'                  => 'accepted',
            'payment_status'          => 'pending',
            'paid_amount'             => null,
            'downpayment_status'      => 'verified',
            'downpayment_verified_at' => now()->subDay(),
            'scheduled_start'         => now()->addDays(5),
            'scheduled_end'           => now()->addDays(5)->addHour(),
        ]);

        $outcome = BookingCancellationService::cancelByTherapist($booking, 'Unavailable');

        $this->assertTrue($outcome['refund_due']);
        $this->assertNull($outcome['refund_amount'], 'No Stripe amount exists to report — must not invent one.');
        $booking->refresh();
        $this->assertSame('therapist', $booking->cancellation_type);
        $this->assertSame('refunded', $booking->downpayment_status);
    }

    // ── 12: Admin refund counter must agree with the eligible queue exactly ──

    public function test_refund_stats_agree_with_the_eligible_queue(): void
    {
        // Eligible: Stripe-confirmed.
        $this->cancelAsCustomer($this->makeBooking([
            'status' => 'accepted', 'payment_status' => 'paid', 'paid_amount' => 60,
            'scheduled_start' => now()->addDays(5), 'scheduled_end' => now()->addDays(5)->addHour(),
        ]))->assertOk();

        // Eligible: legacy-verified.
        $this->cancelAsCustomer($this->makeBooking([
            'status' => 'accepted', 'payment_status' => 'pending', 'paid_amount' => null,
            'downpayment_status' => 'verified', 'downpayment_verified_at' => now()->subDay(),
            'scheduled_start' => now()->addDays(5), 'scheduled_end' => now()->addDays(5)->addHour(),
        ]))->assertOk();

        // Ineligible: stale mislabeled row, no real evidence.
        $this->makeBooking([
            'status' => 'cancelled', 'cancelled_at' => now(), 'cancellation_type' => 'refunded',
            'downpayment_status' => 'refunded', 'payment_status' => 'pending', 'paid_amount' => null,
        ]);

        // Ineligible: unpaid, never even reached a 'refunded' label.
        $this->cancelAsCustomer($this->makeBooking([
            'scheduled_start' => now()->addDays(5), 'scheduled_end' => now()->addDays(5)->addHour(),
        ]))->assertOk();

        $queue = $this->actingAs($this->admin)->getJson('/admin/api/bookings/pending-refunds')->json();
        $stats = $this->actingAs($this->admin)->getJson('/admin/api/bookings/stats')->json();

        $this->assertCount(2, $queue);
        $this->assertSame(2, $stats['pending_refunds']);
        $this->assertSame(count($queue), $stats['pending_refunds']);
    }

    // ── 14: unpaid cancelled bookings appear in cancelledHistory() (Batch ────
    //       #28 follow-up) but never in the refund queue

    public function test_unpaid_cancelled_booking_appears_in_history_but_never_in_refund_queue(): void
    {
        $booking = $this->makeBooking(['scheduled_start' => now()->addDays(5), 'scheduled_end' => now()->addDays(5)->addHour()]);
        $this->cancelAsCustomer($booking)->assertOk();
        $booking->refresh();
        $this->assertNull($booking->cancellation_type);

        $history = $this->actingAs($this->admin)->getJson('/admin/api/bookings/cancelled-history');
        $history->assertOk();
        $this->assertContains($booking->id, collect($history->json())->pluck('id'), 'Must not silently disappear from history just because it has no financial outcome.');

        $queue = $this->actingAs($this->admin)->getJson('/admin/api/bookings/pending-refunds');
        $this->assertNotContains($booking->id, collect($queue->json())->pluck('id'));
    }

    public function test_cancelled_history_still_includes_every_other_existing_cancellation_type(): void
    {
        $refunded = $this->makeBooking([
            'status' => 'accepted', 'payment_status' => 'paid', 'paid_amount' => 60,
            'scheduled_start' => now()->addDays(5), 'scheduled_end' => now()->addDays(5)->addHour(),
        ]);
        $this->cancelAsCustomer($refunded)->assertOk();

        $forfeited = $this->makeBooking([
            'status' => 'accepted', 'payment_status' => 'paid', 'paid_amount' => 60,
            'scheduled_start' => now()->addHours(5), 'scheduled_end' => now()->addHours(6),
        ]);
        $this->cancelAsCustomer($forfeited)->assertOk();

        $therapistCancelled = $this->makeBooking([
            'status' => 'accepted', 'payment_status' => 'paid', 'paid_amount' => 60,
            'scheduled_start' => now()->addDays(5), 'scheduled_end' => now()->addDays(5)->addHour(),
        ]);
        BookingCancellationService::cancelByTherapist($therapistCancelled, 'Unavailable');

        $history = collect($this->actingAs($this->admin)->getJson('/admin/api/bookings/cancelled-history')->json())->pluck('id');

        $this->assertContains($refunded->id, $history);
        $this->assertContains($forfeited->id, $history);
        $this->assertContains($therapistCancelled->id, $history);
    }

    // ── 13: a legacy-verified refund's exact amount is never independently ───
    //       confirmed, so markRefundSent() must now reject it outright — a
    //       correction to the prior assumption (Batch #28.1) that any
    //       hasConfirmedCollection()===true booking could be marked sent.
    //       CTO policy (final): "Prevent Mark Refund Sent for an unverified
    //       legacy refund amount... Enforce this in the BACKEND."

    public function test_legacy_verified_booking_cannot_be_marked_refund_sent(): void
    {
        $booking = $this->makeBooking([
            'status' => 'accepted', 'payment_status' => 'pending', 'paid_amount' => null,
            'downpayment_status' => 'verified', 'downpayment_verified_at' => now()->subDay(),
            'scheduled_start' => now()->addDays(5), 'scheduled_end' => now()->addDays(5)->addHour(),
        ]);
        $this->cancelAsCustomer($booking)->assertOk();
        $booking->refresh();

        // Still visible/eligible for review — just not sendable.
        $this->assertTrue(BookingCancellationService::hasConfirmedCollection($booking));
        $this->assertFalse(BookingCancellationService::hasVerifiedAmount($booking));

        $queue = $this->actingAs($this->admin)->getJson('/admin/api/bookings/pending-refunds');
        $this->assertContains($booking->id, collect($queue->json())->pluck('id'), 'Must stay visible for admin review (requirement 9).');

        $response = $this->actingAs($this->admin)->postJson('/admin/api/bookings/mark-refund-sent', [
            'booking_id' => $booking->id, 'bank_reference' => 'SHOULD-NOT-BE-ACCEPTED',
        ]);
        $response->assertStatus(422);

        $reloaded = Booking::find($booking->id);
        $this->assertSame('refunded', $reloaded->downpayment_status, 'Must stay exactly as it was — never advanced to refund_sent.');
        $this->assertNull($reloaded->refund_sent_at);
        $this->assertNull($reloaded->refund_reference);
        $this->assertNull($reloaded->paid_amount, 'Must never be backfilled/invented from downpayment_amount.');
    }

    // ── 15: the Admin UI payload distinguishes verified vs. unverified ───────

    public function test_formatted_booking_exposes_refund_amount_verified_flag_correctly(): void
    {
        $verified = $this->makeBooking([
            'status' => 'accepted', 'payment_status' => 'paid', 'paid_amount' => 60,
            'scheduled_start' => now()->addDays(5), 'scheduled_end' => now()->addDays(5)->addHour(),
        ]);
        $this->cancelAsCustomer($verified)->assertOk();

        $unverified = $this->makeBooking([
            'status' => 'accepted', 'payment_status' => 'pending', 'paid_amount' => null,
            'downpayment_status' => 'verified', 'downpayment_verified_at' => now()->subDay(),
            'scheduled_start' => now()->addDays(5), 'scheduled_end' => now()->addDays(5)->addHour(),
        ]);
        $this->cancelAsCustomer($unverified)->assertOk();

        $queue = collect($this->actingAs($this->admin)->getJson('/admin/api/bookings/pending-refunds')->json());

        $this->assertTrue($queue->firstWhere('id', $verified->id)['refund_amount_verified']);
        $this->assertFalse($queue->firstWhere('id', $unverified->id)['refund_amount_verified']);
    }

    // ── Stripe-confirmed refunds keep their existing authorized workflow,
    //    including duplicate-send rejection — regression for requirement 8.

    public function test_stripe_confirmed_refund_can_still_be_marked_sent_and_duplicate_is_rejected(): void
    {
        $booking = $this->makeBooking([
            'status' => 'accepted', 'payment_status' => 'paid', 'paid_amount' => 60,
            'scheduled_start' => now()->addDays(5), 'scheduled_end' => now()->addDays(5)->addHour(),
        ]);
        $this->cancelAsCustomer($booking)->assertOk();

        $this->actingAs($this->admin)->postJson('/admin/api/bookings/mark-refund-sent', [
            'booking_id' => $booking->id, 'bank_reference' => 'BANKREF-STRIPE-ORIGINAL',
        ])->assertOk();

        $second = $this->actingAs($this->admin)->postJson('/admin/api/bookings/mark-refund-sent', [
            'booking_id' => $booking->id, 'bank_reference' => 'BANKREF-OVERWRITE-ATTEMPT',
        ]);
        $second->assertStatus(422);

        $reloaded = Booking::find($booking->id);
        $this->assertSame('BANKREF-STRIPE-ORIGINAL', $reloaded->refund_reference);
        $this->assertSame('refund_sent', $reloaded->downpayment_status);
    }

    // ── Admin-only authorization still enforced for the stricter check too ───

    public function test_unauthorized_user_cannot_mark_a_legacy_refund_sent_either(): void
    {
        $booking = $this->makeBooking([
            'status' => 'accepted', 'payment_status' => 'pending', 'paid_amount' => null,
            'downpayment_status' => 'verified', 'downpayment_verified_at' => now()->subDay(),
            'scheduled_start' => now()->addDays(5), 'scheduled_end' => now()->addDays(5)->addHour(),
        ]);
        $this->cancelAsCustomer($booking)->assertOk();

        $response = $this->actingAs($this->customer)->postJson('/admin/api/bookings/mark-refund-sent', [
            'booking_id' => $booking->id, 'bank_reference' => 'SHOULD-NOT-PROCESS',
        ]);
        $response->assertStatus(302);
    }
}
