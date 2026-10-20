<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\RescheduleRequest;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\TherapistZone;
use App\Models\User;
use App\Services\BookingCancellationService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/AdminBookingRescheduleTest.php. Run with
 * DB_CONNECTION=pgsql pointed at a disposable test database, never sqlite
 * and never the real dev database.
 *
 * Covers Batch #26's two policy fixes:
 *
 * A. RescheduleRequestService::CUSTOMER_ELIGIBLE_STATUSES — a customer may
 *    only request a reschedule once the booking is 'accepted'; the
 *    therapist/legacy path (ELIGIBLE_STATUSES) is unchanged.
 *
 * B. refund_forfeited_at — once a reschedule moves a booking away from an
 *    appointment that was already inside BookingCancellationService's
 *    24-hour non-refundable window, cancellation must honor that
 *    forfeiture regardless of how far away the booking's CURRENT
 *    scheduled_start looks. Set only inside
 *    BookingRescheduleService::reschedule() (the one chokepoint every
 *    reschedule path — direct admin reschedule, an approved request, an
 *    accepted proposal — funnels through), never at request-submission or
 *    rejection time.
 *
 * Carbon::setTestNow() freezes "now" so the 24-hour computation and the
 * shift/day-off validation (therapist works 16:00-04:00, off Tuesdays) are
 * both deterministic — "now" is frozen at Monday 2026-12-07 10:00, a
 * working day, well before the therapist's own 16:00-04:00 shift.
 */
class RescheduleRefundForfeitureTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $customer;
    private User $therapistUser;
    private Therapist $therapist;
    private Service $service;
    private ServiceVariant $variant;

    private const FROZEN_NOW = '2026-12-07 10:00:00';

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(self::FROZEN_NOW);

        $this->admin    = User::factory()->create(['role' => 'admin']);
        $this->customer = User::factory()->create(['role' => 'customer']);

        $this->therapistUser = User::factory()->create(['role' => 'therapist']);
        $this->therapist = Therapist::create([
            'user_id'          => $this->therapistUser->id,
            'base_location'    => 'Dubai',
            'gender'           => 'female',
            'is_active'        => true,
            'day_off'          => 'Tuesday',
            'shift_start'      => '16:00',
            'shift_end'        => '04:00',
            'crosses_midnight' => true,
        ]);

        TherapistZone::create([
            'therapist_id'   => $this->therapist->id,
            'zone_name'      => 'Test Zone',
            'travel_minutes' => 30,
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

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function makeBooking(array $overrides = []): Booking
    {
        $start  = Carbon::parse($overrides['scheduled_start'] ?? '2026-12-07 20:00:00');
        $blocks = Booking::computeTimeBlocks($start->toDateTimeString(), 60, 30);

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
            // Batch #28.1: hasConfirmedCollection() requires a real
            // paid_amount, not just payment_status/downpayment_status —
            // this suite is explicitly about paid-booking forfeiture
            // policy, so its fixture must carry real collection evidence
            // under the corrected rule (previously relied on
            // downpayment_status='submitted' merely not being 'pending',
            // which no longer implies anything was collected).
            'paid_amount'        => 300,
            'downpayment_status' => 'submitted',
            'scheduled_start'    => $start,
            'scheduled_end'      => $blocks['scheduled_end'],
            'travel_start'       => $blocks['travel_start'],
            'buffer_end'         => $blocks['buffer_end'],
        ], $overrides));
    }

    private function submitCustomerRequest(Booking $booking, string $requestedStartAt): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->customer)->postJson(
            "/api/bookings/{$booking->id}/reschedule-request",
            ['requested_start_at' => $requestedStartAt]
        );
    }

    private function approveRequest(RescheduleRequest $request, string $finalStart): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->admin)->postJson(
            "/admin/api/bookings/reschedule-requests/{$request->id}/approve",
            ['final_scheduled_start' => $finalStart]
        );
    }

    private function cancel(Booking $booking): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->customer)->postJson('/api/downpayment/cancel', [
            'booking_id'          => $booking->id,
            'cancellation_reason' => 'Change of plans',
        ]);
    }

    // ── A.1/A.2: customer reschedule eligibility ──────────────────────────

    public function test_pending_customer_reschedule_is_rejected(): void
    {
        $booking = $this->makeBooking(['status' => 'pending']);

        $response = $this->submitCustomerRequest($booking, '2026-12-14 20:00:00');

        $response->assertStatus(422);
        $response->assertJsonPath('message', 'This booking is not eligible for a reschedule request.');
    }

    public function test_accepted_customer_reschedule_is_permitted(): void
    {
        $booking = $this->makeBooking(['status' => 'accepted']);

        $response = $this->submitCustomerRequest($booking, '2026-12-14 20:00:00');

        $response->assertCreated();
    }

    public function test_every_other_ineligible_status_rejects_a_customer_request(): void
    {
        $ineligible = [
            ['status' => 'pending_payment'],
            ['status' => 'en_route'],
            ['status' => 'arrived'],
            ['status' => 'completed'],
            ['status' => 'rejected'],
            ['status' => 'cancelled'],
            ['status' => 'cancelled', 'cancellation_type' => 'no_show'],
        ];

        foreach ($ineligible as $overrides) {
            $booking = $this->makeBooking($overrides);

            $response = $this->submitCustomerRequest($booking, '2026-12-14 20:00:00');

            $response->assertStatus(422, "Status '{$overrides['status']}' must reject a customer reschedule request.");
        }
    }

    // ── A.5/A.6: therapist-initiated workflow preserved ───────────────────

    public function test_existing_therapist_initiated_workflow_is_preserved_for_a_pending_booking(): void
    {
        $booking = $this->makeBooking(['status' => 'pending']);

        $response = $this->actingAs($this->therapistUser)->postJson('/therapist/api/reschedule-request', [
            'booking_id'     => $booking->id,
            'requested_date' => '2026-12-14',
            'requested_time' => '20:00',
        ]);

        $response->assertCreated();
    }

    // ── B: durable refund-forfeiture protection ───────────────────────────

    public function test_request_submitted_within_24h_approved_later_then_cancelled_forfeits(): void
    {
        // 2026-12-07 20:00 is 10 hours from the frozen "now" (10:00) — inside
        // the 24-hour window both now and at approval below.
        $booking = $this->makeBooking(['scheduled_start' => '2026-12-07 20:00:00']);

        $this->submitCustomerRequest($booking, '2026-12-14 20:00:00')->assertCreated();
        $requestRow = RescheduleRequest::where('booking_id', $booking->id)->first();

        $this->approveRequest($requestRow, '2026-12-14 20:00:00')->assertOk();

        $booking->refresh();
        $this->assertNotNull($booking->refund_forfeited_at, 'Approving a reschedule of an already-within-24h booking must lock forfeiture.');
        $this->assertSame('2026-12-14 20:00:00', $booking->scheduled_start->toDateTimeString());

        // Cancelling now, with the booking looking a week away, must still forfeit.
        $response = $this->cancel($booking);
        $response->assertOk();
        $response->assertJsonPath('cancellation_type', 'forfeited');

        $booking->refresh();
        $this->assertSame('forfeited', $booking->downpayment_status);
    }

    public function test_request_made_outside_24h_but_approved_inside_24h_then_cancelled_forfeits(): void
    {
        // Wednesday 2026-12-09 20:00 is ~58 hours from the frozen "now"
        // (Monday 10:00) — outside the 24-hour window at request time.
        $booking = $this->makeBooking(['scheduled_start' => '2026-12-09 20:00:00']);

        $this->submitCustomerRequest($booking, '2026-12-16 20:00:00')->assertCreated();
        $requestRow = RescheduleRequest::where('booking_id', $booking->id)->first();

        // Time passes — "now" advances to Tuesday 22:00, only 22 hours
        // before the booking's still-unchanged 2026-12-09 20:00 appointment.
        Carbon::setTestNow('2026-12-08 22:00:00');

        $this->approveRequest($requestRow, '2026-12-16 20:00:00')->assertOk();

        $booking->refresh();
        $this->assertNotNull(
            $booking->refund_forfeited_at,
            'Approval must re-evaluate against the CURRENT appointment at approval time, not whatever was true when the request was submitted.'
        );

        $response = $this->cancel($booking);
        $response->assertJsonPath('cancellation_type', 'forfeited');
    }

    public function test_repeated_approved_reschedules_preserve_forfeiture(): void
    {
        $booking = $this->makeBooking(['scheduled_start' => '2026-12-07 20:00:00']);

        $this->submitCustomerRequest($booking, '2026-12-14 20:00:00')->assertCreated();
        $firstRequest = RescheduleRequest::where('booking_id', $booking->id)->first();
        $this->approveRequest($firstRequest, '2026-12-14 20:00:00')->assertOk();

        $booking->refresh();
        $lockedAt = $booking->refund_forfeited_at;
        $this->assertNotNull($lockedAt);

        // Second reschedule, now from a date that itself looks "safe"
        // (a week away) — must NOT look like a fresh forfeiture trigger,
        // and must not clear the existing lock.
        $this->submitCustomerRequest($booking, '2026-12-21 20:00:00')->assertCreated();
        $secondRequest = RescheduleRequest::where('booking_id', $booking->id)->where('status', 'pending')->first();
        $this->approveRequest($secondRequest, '2026-12-21 20:00:00')->assertOk();

        $booking->refresh();
        $this->assertNotNull($booking->refund_forfeited_at);
        $this->assertTrue($lockedAt->equalTo($booking->refund_forfeited_at), 'The original lock timestamp must never be overwritten by a later reschedule.');

        $response = $this->cancel($booking);
        $response->assertJsonPath('cancellation_type', 'forfeited');
    }

    public function test_legitimate_refund_remains_eligible_when_no_forfeiture_was_triggered(): void
    {
        // Both the original and the new appointment are comfortably more
        // than 24 hours from the frozen "now" — forfeiture must never
        // trigger.
        $booking = $this->makeBooking(['scheduled_start' => '2026-12-10 20:00:00']);

        $this->submitCustomerRequest($booking, '2026-12-14 20:00:00')->assertCreated();
        $requestRow = RescheduleRequest::where('booking_id', $booking->id)->first();
        $this->approveRequest($requestRow, '2026-12-14 20:00:00')->assertOk();

        $booking->refresh();
        $this->assertNull($booking->refund_forfeited_at);

        $response = $this->cancel($booking);
        $response->assertOk();
        $response->assertJsonPath('cancellation_type', 'refunded');
    }

    public function test_rejected_request_does_not_incorrectly_change_financial_state(): void
    {
        // Outside 24h at the time of the (never-approved) request.
        $booking = $this->makeBooking(['scheduled_start' => '2026-12-10 20:00:00']);

        $this->submitCustomerRequest($booking, '2026-12-14 20:00:00')->assertCreated();
        $requestRow = RescheduleRequest::where('booking_id', $booking->id)->first();

        $this->actingAs($this->admin)
            ->postJson("/admin/api/bookings/reschedule-requests/{$requestRow->id}/reject", [])
            ->assertOk();

        $booking->refresh();
        $this->assertNull($booking->refund_forfeited_at, 'A rejected request must never set a forfeiture lock.');
        $this->assertSame('2026-12-10 20:00:00', $booking->scheduled_start->toDateTimeString(), 'A rejected request must never change the schedule.');

        // Still more than 24h away — cancelling now must still refund normally.
        $response = $this->cancel($booking);
        $response->assertJsonPath('cancellation_type', 'refunded');
    }

    public function test_authorized_admin_no_show_exception_remains_functional(): void
    {
        // Lock already set (as if a prior reschedule had triggered it), but
        // the booking's current scheduled_start is comfortably in the past
        // relative to "now" being irrelevant here — this directly exercises
        // BookingCancellationService::cancel()'s $forcedType path.
        $booking = $this->makeBooking([
            'scheduled_start'      => '2026-12-14 20:00:00',
            'refund_forfeited_at'  => Carbon::parse(self::FROZEN_NOW),
        ]);

        $result = BookingCancellationService::cancel($booking, 'No-show, resolved by admin', 'no_show');

        $this->assertSame('no_show', $result['cancellation_type'], 'forcedType must still control the cancellation_type label.');

        $booking->refresh();
        $this->assertSame('forfeited', $booking->downpayment_status, 'The forfeiture lock must still force downpayment_status regardless of the forced label.');
    }

    public function test_reschedule_audit_log_records_the_forfeiture_determination(): void
    {
        $booking = $this->makeBooking(['scheduled_start' => '2026-12-07 20:00:00']);

        $this->submitCustomerRequest($booking, '2026-12-14 20:00:00')->assertCreated();
        $requestRow = RescheduleRequest::where('booking_id', $booking->id)->first();
        $this->approveRequest($requestRow, '2026-12-14 20:00:00')->assertOk();

        $booking->refresh();
        $log = AuditLog::where('event', 'booking.rescheduled')->where('target_id', $booking->id)->first();

        $this->assertNotNull($log);
        $this->assertSame($this->admin->id, $log->user_id);
        // Pre-existing fields (Checkpoint-era audit trail) remain intact.
        $this->assertSame('2026-12-07 20:00:00', $log->metadata['previous_scheduled_start']);
        $this->assertSame('2026-12-14 20:00:00', $log->metadata['new_scheduled_start']);
        // New forfeiture-determination fields.
        $this->assertTrue($log->metadata['forfeiture_newly_triggered']);
        $this->assertSame(
            $booking->refund_forfeited_at->toDateTimeString(),
            $log->metadata['refund_forfeited_at']
        );
    }
}
