<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\RescheduleRequest;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/StaleActiveSessionTest.php. Run with DB_CONNECTION=
 * pgsql pointed at a disposable test database, not sqlite (phpunit.xml's
 * default) and never the real dev database.
 *
 * Covers the generalized reschedule_requests system:
 * - POST /api/bookings/{booking}/reschedule-request (new customer path)
 * - POST /therapist/api/reschedule-request (legacy path, now routed
 *   through the same RescheduleRequestService and so now also enforcing
 *   the booking-state eligibility it previously lacked entirely)
 *
 * This step only ever creates a *request* row — it must never touch the
 * booking's own schedule/status, and never trigger the final "rescheduled"
 * notification (that only happens via BookingRescheduleService, through
 * the admin approval step this step explicitly does not build).
 */
class RescheduleRequestTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;
    private User $otherCustomer;
    private User $therapistUser;
    private Therapist $therapist;
    private Service $service;
    private ServiceVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customer      = User::factory()->create(['role' => 'customer']);
        $this->otherCustomer = User::factory()->create(['role' => 'customer']);

        $this->therapistUser = User::factory()->create(['role' => 'therapist']);
        $this->therapist = Therapist::create([
            'user_id'       => $this->therapistUser->id,
            'base_location' => 'Dubai',
            'gender'        => 'female',
            'is_active'     => true,
        ]);

        $this->service = Service::create([
            'name' => 'Swedish Massage', 'duration_minutes' => 60, 'price' => 300, 'is_active' => true,
        ]);
        $this->variant = ServiceVariant::create([
            'service_id' => $this->service->id, 'duration_minutes' => 60, 'price' => 300,
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
            'payment_method'     => 'cash',
            'payment_type'       => 'full',
            'status'             => 'accepted',
            'scheduled_start'    => now()->addDays(3),
            'scheduled_end'      => now()->addDays(3)->addHour(),
        ], $overrides));
    }

    private function postRequest(Booking $booking, ?string $requestedStartAt = null, ?string $reason = null, ?User $as = null): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($as ?? $this->customer)->postJson(
            "/api/bookings/{$booking->id}/reschedule-request",
            array_filter([
                'requested_start_at' => $requestedStartAt ?? now()->addDays(5)->toDateTimeString(),
                'reason'             => $reason,
            ], fn ($v) => $v !== null)
        );
    }

    // ── 1, 2: eligible statuses succeed ──────────────────────────────────────

    public function test_customer_can_create_request_for_pending_booking(): void
    {
        $booking = $this->makeBooking(['status' => 'pending']);

        $response = $this->postRequest($booking);
        $response->assertCreated();
        $response->assertJsonPath('request.status', 'pending');
        $response->assertJsonPath('request.booking_ref', 'IHS-' . str_pad($booking->id, 5, '0', STR_PAD_LEFT));

        $this->assertDatabaseHas('reschedule_requests', [
            'booking_id' => $booking->id,
            'status'     => 'pending',
        ]);
    }

    public function test_customer_can_create_request_for_accepted_booking(): void
    {
        $booking = $this->makeBooking(['status' => 'accepted']);

        $this->postRequest($booking)->assertCreated();
    }

    // ── 3-8: ineligible statuses are rejected ────────────────────────────────

    public function test_customer_cannot_request_for_ineligible_booking_states(): void
    {
        foreach (['pending_payment', 'en_route', 'arrived', 'completed', 'rejected', 'cancelled'] as $status) {
            $booking = $this->makeBooking(['status' => $status]);

            $response = $this->postRequest($booking);
            $response->assertStatus(422, "status '{$status}' must not be eligible for a reschedule request.");

            $this->assertDatabaseMissing('reschedule_requests', ['booking_id' => $booking->id]);
        }
    }

    // ── 9: ownership ──────────────────────────────────────────────────────────

    public function test_customer_cannot_request_for_another_customers_booking(): void
    {
        $booking = $this->makeBooking(['status' => 'accepted']);

        $response = $this->postRequest($booking, null, null, $this->otherCustomer);
        $response->assertStatus(403);

        $this->assertDatabaseMissing('reschedule_requests', ['booking_id' => $booking->id]);
    }

    // ── 10: requested time must be future ────────────────────────────────────

    public function test_requested_time_must_be_future(): void
    {
        $booking = $this->makeBooking(['status' => 'accepted']);

        $response = $this->postRequest($booking, now()->subDay()->toDateTimeString());
        $response->assertStatus(422);
        $response->assertJsonValidationErrors('requested_start_at');
    }

    // ── 11: duplicate pending request ────────────────────────────────────────

    public function test_duplicate_pending_request_is_rejected(): void
    {
        $booking = $this->makeBooking(['status' => 'accepted']);

        $this->postRequest($booking)->assertCreated();

        $second = $this->postRequest($booking, now()->addDays(6)->toDateTimeString());
        $second->assertStatus(409);

        $this->assertSame(1, RescheduleRequest::where('booking_id', $booking->id)->count());
    }

    // ── Cross-flow guard: a pending admin proposal blocks a new request ─────

    public function test_request_creation_is_blocked_while_a_reschedule_proposal_is_pending(): void
    {
        $booking = $this->makeBooking(['status' => 'accepted']);
        $admin   = \App\Models\User::factory()->create(['role' => 'admin']);

        // This fixture's therapist has no shift configured (unlike
        // RescheduleProposalTest's), so RescheduleProposalService::create()'s
        // own validateCandidate() call needs an explicit shift to validate
        // a candidate time against — only relevant to proposal creation,
        // not to this suite's other tests (which never reach that check).
        $this->therapist->update(['shift_start' => '16:00', 'shift_end' => '04:00', 'crosses_midnight' => true]);

        \App\Services\RescheduleProposalService::create($booking, $admin, \Carbon\Carbon::parse('2026-12-09 20:00:00'));

        $response = $this->postRequest($booking);
        $response->assertStatus(409);

        $this->assertDatabaseMissing('reschedule_requests', ['booking_id' => $booking->id]);
    }

    // ── 12, 13: the booking itself is never touched ──────────────────────────

    public function test_booking_schedule_remains_unchanged(): void
    {
        $booking = $this->makeBooking(['status' => 'accepted']);
        $originalStart = $booking->scheduled_start->toDateTimeString();
        $originalEnd   = $booking->scheduled_end->toDateTimeString();

        $this->postRequest($booking)->assertCreated();

        $booking->refresh();
        $this->assertSame($originalStart, $booking->scheduled_start->toDateTimeString());
        $this->assertSame($originalEnd, $booking->scheduled_end->toDateTimeString());
    }

    public function test_booking_status_remains_unchanged(): void
    {
        $booking = $this->makeBooking(['status' => 'pending']);

        $this->postRequest($booking)->assertCreated();

        $booking->refresh();
        $this->assertSame('pending', $booking->status);
    }

    // ── 14, 15: requester identity comes only from the session ──────────────

    public function test_authenticated_requester_identity_is_stored_correctly_with_customer_role(): void
    {
        $booking  = $this->makeBooking(['status' => 'accepted']);
        $response = $this->postRequest($booking);
        $response->assertCreated();

        $row = RescheduleRequest::find($response->json('request.id'));
        $this->assertSame($this->customer->id, $row->requested_by_user_id);
        $this->assertSame('customer', $row->requested_by_role);
    }

    // Explicit security check: REQUESTER SECURITY says requested_by_user_id
    // / requested_by_role must never come from the client — confirm a
    // client attempt to spoof them is simply ignored.
    public function test_client_supplied_requester_identity_is_ignored(): void
    {
        $booking = $this->makeBooking(['status' => 'accepted']);

        $response = $this->actingAs($this->customer)->postJson("/api/bookings/{$booking->id}/reschedule-request", [
            'requested_start_at'   => now()->addDays(5)->toDateTimeString(),
            'requested_by_user_id' => $this->otherCustomer->id,
            'requested_by_role'    => 'therapist',
        ]);
        $response->assertCreated();

        $row = RescheduleRequest::find($response->json('request.id'));
        $this->assertSame($this->customer->id, $row->requested_by_user_id);
        $this->assertSame('customer', $row->requested_by_role);
    }

    // ── 16: legacy therapist flow still works, now with the generalized columns ──

    public function test_existing_therapist_request_flow_still_works_with_role_therapist(): void
    {
        $booking = $this->makeBooking(['status' => 'accepted']);

        $response = $this->actingAs($this->therapistUser)->postJson('/therapist/api/reschedule-request', [
            'booking_id'     => $booking->id,
            'requested_date' => now()->addDays(5)->toDateString(),
            'requested_time' => '14:00',
            'reason'         => 'Schedule conflict',
        ]);
        $response->assertCreated();
        $response->assertJsonStructure(['message', 'id']);

        $row = RescheduleRequest::find($response->json('id'));
        $this->assertSame($this->therapistUser->id, $row->requested_by_user_id);
        $this->assertSame('therapist', $row->requested_by_role);
        $this->assertNotNull($row->requested_start_at);
    }

    // Intentional behavior change flagged in the audit: the legacy path
    // previously accepted a request for a booking in ANY status. Routing
    // it through RescheduleRequestService now enforces the same eligibility
    // rule the customer path uses.
    public function test_legacy_therapist_flow_now_rejects_ineligible_booking_state(): void
    {
        $booking = $this->makeBooking(['status' => 'completed']);

        $response = $this->actingAs($this->therapistUser)->postJson('/therapist/api/reschedule-request', [
            'booking_id'     => $booking->id,
            'requested_date' => now()->addDays(5)->toDateString(),
            'requested_time' => '14:00',
        ]);
        $response->assertStatus(422);
    }

    public function test_therapist_cannot_request_for_a_booking_assigned_to_another_therapist(): void
    {
        $otherTherapistUser = User::factory()->create(['role' => 'therapist']);
        Therapist::create(['user_id' => $otherTherapistUser->id, 'base_location' => 'Dubai', 'gender' => 'female', 'is_active' => true]);

        $booking = $this->makeBooking(['status' => 'accepted']);

        $response = $this->actingAs($otherTherapistUser)->postJson('/therapist/api/reschedule-request', [
            'booking_id'     => $booking->id,
            'requested_date' => now()->addDays(5)->toDateString(),
            'requested_time' => '14:00',
        ]);
        $response->assertStatus(403);
    }

    // ── 17: duplicate-protection under concurrency ───────────────────────────
    // PHPUnit is synchronous, so — mirroring the existing precedent in this
    // codebase (TherapistBookingNotificationIdempotencyTest's "concurrent
    // duplicate start requests" test) — two back-to-back calls exercise the
    // exact same lockForUpdate()-guarded path real concurrent requests
    // would hit, and only one may ever land.
    public function test_sequential_duplicate_requests_only_the_first_succeeds(): void
    {
        $booking = $this->makeBooking(['status' => 'accepted']);

        $first  = $this->postRequest($booking);
        $second = $this->postRequest($booking, now()->addDays(7)->toDateTimeString());

        $first->assertCreated();
        $second->assertStatus(409);

        $this->assertSame(
            1,
            RescheduleRequest::where('booking_id', $booking->id)->where('status', 'pending')->count()
        );
    }

    // ── Explicit non-mutation / no-notification checks ───────────────────────

    public function test_creating_a_request_sends_no_notification(): void
    {
        \Illuminate\Support\Facades\Notification::fake();
        $booking = $this->makeBooking(['status' => 'accepted']);

        $this->postRequest($booking)->assertCreated();

        \Illuminate\Support\Facades\Notification::assertNothingSent();
    }

    public function test_creating_a_request_dispatches_no_reschedule_audit_event(): void
    {
        $booking = $this->makeBooking(['status' => 'accepted']);

        $this->postRequest($booking)->assertCreated();

        $this->assertSame(
            0,
            \App\Models\AuditLog::where('event', 'booking.rescheduled')->where('target_id', $booking->id)->count()
        );
    }
}
