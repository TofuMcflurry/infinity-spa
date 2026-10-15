<?php

namespace Tests\Feature;

use App\Events\Audit\BookingRescheduled;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\RescheduleRequest;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\TherapistUnavailableSlot;
use App\Models\TherapistZone;
use App\Models\User;
use App\Notifications\BookingNotification;
use App\Services\RescheduleRequestService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification as NotificationFacade;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/StaleActiveSessionTest.php. Run with DB_CONNECTION=
 * pgsql pointed at a disposable test database, not sqlite (phpunit.xml's
 * default) and never the real dev database.
 *
 * Covers the admin review/approval/rejection backend for reschedule_requests:
 * - GET  /admin/api/bookings/reschedule-requests
 * - POST /admin/api/bookings/reschedule-requests/{reschedule_request}/approve
 * - POST /admin/api/bookings/reschedule-requests/{reschedule_request}/reject
 *
 * Same fixed calendar as AdminBookingRescheduleTest: therapist works
 * 16:00 -> 04:00 (next day), is off on Tuesdays, travel to "Test Zone" is
 * 30 minutes, service is 60 minutes.
 */
class AdminRescheduleRequestReviewTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $customer;
    private User $therapistUser;
    private Therapist $therapist;
    private Service $service;
    private ServiceVariant $variant;

    private const ORIGINAL_START = '2026-12-07 20:00:00'; // Monday

    protected function setUp(): void
    {
        parent::setUp();

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

    private function makeBooking(array $overrides = []): Booking
    {
        $start  = Carbon::parse($overrides['scheduled_start'] ?? self::ORIGINAL_START);
        $blocks = Booking::computeTimeBlocks($start->toDateTimeString(), 60, 30);

        return Booking::create(array_merge([
            'customer_id'        => $this->customer->id,
            'therapist_id'       => $this->therapist->id,
            'service_id'         => $this->service->id,
            'service_variant_id' => $this->variant->id,
            'location'           => 'Test location',
            'zone_name'          => 'Test Zone',
            'status'             => 'accepted',
            'scheduled_start'    => $start,
            'scheduled_end'      => $blocks['scheduled_end'],
            'travel_start'       => $blocks['travel_start'],
            'buffer_end'         => $blocks['buffer_end'],
        ], $overrides));
    }

    private function makeRequest(Booking $booking, string $requestedStartAt, ?string $reason = null): RescheduleRequest
    {
        return RescheduleRequestService::create(
            $booking,
            $this->customer,
            RescheduleRequestService::ROLE_CUSTOMER,
            Carbon::parse($requestedStartAt),
            $reason
        );
    }

    private function list(array $query = []): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->admin)->getJson('/admin/api/bookings/reschedule-requests' . (empty($query) ? '' : '?' . http_build_query($query)));
    }

    private function approve(RescheduleRequest $r, string $finalStart, ?string $adminNotes = null, ?User $as = null): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($as ?? $this->admin)->postJson(
            "/admin/api/bookings/reschedule-requests/{$r->id}/approve",
            array_filter([
                'final_scheduled_start' => $finalStart,
                'admin_notes'           => $adminNotes,
            ], fn ($v) => $v !== null)
        );
    }

    private function reject(RescheduleRequest $r, ?string $adminNotes = null, ?User $as = null): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($as ?? $this->admin)->postJson(
            "/admin/api/bookings/reschedule-requests/{$r->id}/reject",
            array_filter(['admin_notes' => $adminNotes], fn ($v) => $v !== null)
        );
    }

    // BookingController::myBookings() groups its response into
    // upcoming/pending/completed/cancelled buckets by booking status, not a
    // single flat list — flatten across all of them to find one booking by id.
    private function findMyBooking(\Illuminate\Testing\TestResponse $response, int $bookingId): ?array
    {
        $groups = $response->json();
        foreach ($groups as $group) {
            $found = collect($group)->firstWhere('id', $bookingId);
            if ($found) return $found;
        }
        return null;
    }

    // ── REQUEST LIST ──────────────────────────────────────────────────────

    public function test_admin_can_list_pending_requests(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00', 'Need a later day');

        $response = $this->list();
        $response->assertOk();
        $response->assertJsonPath('0.id', $req->id);
        $response->assertJsonPath('0.status', 'pending');
    }

    public function test_non_admin_cannot_access_request_list(): void
    {
        $booking = $this->makeBooking();
        $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->actingAs($this->customer)
            ->getJson('/admin/api/bookings/reschedule-requests')
            ->assertRedirect('/');
    }

    public function test_list_includes_current_booking_and_requested_schedule_data(): void
    {
        $booking = $this->makeBooking();
        $this->makeRequest($booking, '2026-12-09 18:00:00', 'Schedule conflict');

        $response = $this->list();
        $response->assertOk();

        $row = $response->json('0');
        $this->assertSame('Schedule conflict', $row['reason']);
        $this->assertSame('customer', $row['requested_by_role']);
        $this->assertNotNull($row['requested_start_at']);
        $this->assertSame($booking->id, $row['booking']['id']);
        $this->assertSame('accepted', $row['booking']['status']);
        $this->assertNotNull($row['booking']['scheduled_start']);
        $this->assertSame($this->customer->name, $row['booking']['customer_name']);
        $this->assertSame($this->therapistUser->name, $row['booking']['therapist_name']);
        $this->assertSame('Swedish Massage', $row['booking']['service_name']);
    }

    public function test_list_defaults_to_pending_and_excludes_resolved_requests(): void
    {
        $bookingA = $this->makeBooking();
        $bookingB = $this->makeBooking(['scheduled_start' => '2026-12-14 20:00:00']);

        $pending = $this->makeRequest($bookingA, '2026-12-09 18:00:00');
        $approved = $this->makeRequest($bookingB, '2026-12-16 18:00:00');
        $this->approve($approved, '2026-12-16 18:00:00')->assertOk();

        $response = $this->list();
        $response->assertOk();
        $ids = collect($response->json())->pluck('id');
        $this->assertTrue($ids->contains($pending->id));
        $this->assertFalse($ids->contains($approved->id));
    }

    // ── APPROVAL ──────────────────────────────────────────────────────────

    public function test_pending_request_can_be_approved_with_the_requested_time(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 20:00:00');

        $response = $this->approve($req, '2026-12-09 20:00:00', 'Looks good');
        $response->assertOk();
        $response->assertJsonPath('message', 'Reschedule request approved.');
        $response->assertJsonPath('request.status', 'approved');

        $booking->refresh();
        $this->assertSame('2026-12-09 20:00:00', $booking->scheduled_start->toDateTimeString());
    }

    public function test_requested_start_at_remains_unchanged_after_approval(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        // Alternative final time, different from the requested one.
        $this->approve($req, '2026-12-09 18:30:00')->assertOk();

        $req->refresh();
        $this->assertSame('2026-12-09 18:00:00', $req->requested_start_at->toDateTimeString());
    }

    public function test_resolved_start_at_records_the_final_schedule(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->approve($req, '2026-12-09 18:30:00')->assertOk();

        $req->refresh();
        $this->assertSame('2026-12-09 18:30:00', $req->resolved_start_at->toDateTimeString());
    }

    public function test_admin_identity_and_review_metadata_are_recorded_on_approval(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->approve($req, '2026-12-09 18:00:00', 'Confirmed with therapist')->assertOk();

        $req->refresh();
        $this->assertSame($this->admin->id, $req->reviewed_by_user_id);
        $this->assertNotNull($req->reviewed_at);
        $this->assertSame('Confirmed with therapist', $req->admin_notes);
    }

    public function test_approval_creates_a_booking_rescheduled_audit_event(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->approve($req, '2026-12-09 18:00:00', 'Approved as requested')->assertOk();

        $log = AuditLog::where('event', 'booking.rescheduled')->where('target_id', $booking->id)->first();
        $this->assertNotNull($log);
        $this->assertSame($this->admin->id, $log->user_id);
        $this->assertSame('admin', $log->user_role);
        $this->assertSame(self::ORIGINAL_START, $log->metadata['previous_scheduled_start']);
        $this->assertSame('2026-12-09 18:00:00', $log->metadata['new_scheduled_start']);
        $this->assertSame('Approved as requested', $log->metadata['reason']);
    }

    public function test_customer_receives_rescheduled_notification_on_approval(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->approve($req, '2026-12-09 18:00:00')->assertOk();

        NotificationFacade::assertSentTo(
            $this->customer,
            BookingNotification::class,
            fn ($n) => $n->type === 'rescheduled' && $n->booking->id === $booking->id
        );
    }

    public function test_therapist_receives_rescheduled_notification_on_approval(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->approve($req, '2026-12-09 18:00:00')->assertOk();

        NotificationFacade::assertSentTo(
            $this->therapistUser,
            BookingNotification::class,
            fn ($n) => $n->type === 'rescheduled' && $n->booking->id === $booking->id
        );
    }

    public function test_customer_and_therapist_email_channels_are_triggered_on_approval(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->approve($req, '2026-12-09 18:00:00')->assertOk();

        NotificationFacade::assertSentTo(
            $this->customer,
            BookingNotification::class,
            fn ($n, $channels) => in_array('mail', $channels, true) && in_array('database', $channels, true)
        );
        NotificationFacade::assertSentTo(
            $this->therapistUser,
            BookingNotification::class,
            fn ($n, $channels) => in_array('mail', $channels, true) && in_array('database', $channels, true)
        );
    }

    public function test_approval_with_an_alternative_final_time_moves_the_booking_there(): void
    {
        $booking = $this->makeBooking();
        // Customer requests 6:00 PM, admin approves 6:30 PM instead.
        $req = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $response = $this->approve($req, '2026-12-09 18:30:00', 'Therapist available 30 mins later');
        $response->assertOk();

        $booking->refresh();
        $this->assertSame('2026-12-09 18:30:00', $booking->scheduled_start->toDateTimeString());

        $req->refresh();
        $this->assertSame('2026-12-09 18:00:00', $req->requested_start_at->toDateTimeString());
        $this->assertSame('2026-12-09 18:30:00', $req->resolved_start_at->toDateTimeString());
        $this->assertSame('approved', $req->status);
    }

    public function test_approval_rejects_an_unavailable_conflicting_final_time(): void
    {
        $booking = $this->makeBooking();
        $this->makeBooking(['scheduled_start' => '2026-12-10 20:00:00']); // occupies the target slot
        $req = $this->makeRequest($booking, '2026-12-10 20:00:00');

        $response = $this->approve($req, '2026-12-10 20:15:00');
        $response->assertStatus(422);
        $response->assertJsonPath('message', 'This time conflicts with another booking for this therapist.');

        $booking->refresh();
        $this->assertSame(self::ORIGINAL_START, $booking->scheduled_start->toDateTimeString());

        $req->refresh();
        $this->assertSame('pending', $req->status);
    }

    public function test_approval_rejects_a_day_off_final_time(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-08 20:00:00'); // Tuesday — day off

        $response = $this->approve($req, '2026-12-08 20:00:00');
        $response->assertStatus(422);
        $response->assertJsonPath('message', 'Therapist is off on Tuesdays.');

        $req->refresh();
        $this->assertSame('pending', $req->status);
    }

    public function test_approval_rejects_a_therapist_unavailable_slot(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-11 20:00:00');

        TherapistUnavailableSlot::create([
            'therapist_id' => $this->therapistUser->id,
            'date'         => '2026-12-11',
            'is_full_day'  => true,
        ]);

        $response = $this->approve($req, '2026-12-11 20:00:00');
        $response->assertStatus(422);
        $response->assertJsonPath('message', 'Therapist has marked this time as unavailable.');

        $req->refresh();
        $this->assertSame('pending', $req->status);
    }

    public function test_approval_fails_when_booking_state_changed_since_submission(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        // Booking moved on independently (e.g. cancelled) after the request
        // was submitted — approval must re-check, not trust stale state.
        $booking->update(['status' => 'cancelled']);

        $response = $this->approve($req, '2026-12-09 18:00:00');
        $response->assertStatus(422);
        $response->assertJsonPath('message', 'This booking is not in a reschedulable state.');

        $req->refresh();
        $this->assertSame('pending', $req->status);
    }

    public function test_already_resolved_request_cannot_be_approved_twice(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->approve($req, '2026-12-09 18:00:00')->assertOk();

        $second = $this->approve($req, '2026-12-09 19:00:00');
        $second->assertStatus(409);

        $booking->refresh();
        $this->assertSame('2026-12-09 18:00:00', $booking->scheduled_start->toDateTimeString(), 'Second approval must not move the booking again.');
    }

    public function test_booking_schedule_remains_unchanged_on_failed_approval(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-08 20:00:00');

        $this->approve($req, '2026-12-08 20:00:00')->assertStatus(422);

        $booking->refresh();
        $this->assertSame(self::ORIGINAL_START, $booking->scheduled_start->toDateTimeString());
        $this->assertSame('accepted', $booking->status);
    }

    public function test_failed_approval_sends_no_notifications(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-08 20:00:00');

        $this->approve($req, '2026-12-08 20:00:00')->assertStatus(422);

        NotificationFacade::assertNothingSent();
    }

    public function test_non_admin_cannot_approve(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->approve($req, '2026-12-09 18:00:00', null, $this->customer)->assertRedirect('/');

        $req->refresh();
        $this->assertSame('pending', $req->status);
    }

    public function test_approval_requires_final_scheduled_start(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $response = $this->actingAs($this->admin)->postJson("/admin/api/bookings/reschedule-requests/{$req->id}/approve", []);
        $response->assertStatus(422);
        $response->assertJsonValidationErrors('final_scheduled_start');
    }

    // ── REJECTION ─────────────────────────────────────────────────────────

    public function test_pending_request_can_be_rejected(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $response = $this->reject($req, 'Requested time conflicts with therapist availability.');
        $response->assertOk();
        $response->assertJsonPath('request.status', 'rejected');

        $req->refresh();
        $this->assertSame('rejected', $req->status);
    }

    public function test_rejection_leaves_booking_schedule_unchanged(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->reject($req)->assertOk();

        $booking->refresh();
        $this->assertSame(self::ORIGINAL_START, $booking->scheduled_start->toDateTimeString());
        $this->assertSame('accepted', $booking->status);
    }

    public function test_rejection_stores_admin_notes(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->reject($req, 'Therapist unavailable that day')->assertOk();

        $req->refresh();
        $this->assertSame('Therapist unavailable that day', $req->admin_notes);
    }

    public function test_rejection_stores_reviewed_metadata(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->reject($req)->assertOk();

        $req->refresh();
        $this->assertSame($this->admin->id, $req->reviewed_by_user_id);
        $this->assertNotNull($req->reviewed_at);
    }

    public function test_rejection_sends_no_rescheduled_notification(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->reject($req)->assertOk();

        NotificationFacade::assertNothingSent();
    }

    public function test_rejection_dispatches_no_booking_rescheduled_audit_event(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->reject($req)->assertOk();

        $this->assertSame(
            0,
            AuditLog::where('event', 'booking.rescheduled')->where('target_id', $booking->id)->count()
        );
    }

    public function test_same_request_cannot_be_rejected_twice(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->reject($req)->assertOk();
        $this->reject($req)->assertStatus(409);
    }

    public function test_non_admin_cannot_reject(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->reject($req, null, $this->customer)->assertRedirect('/');

        $req->refresh();
        $this->assertSame('pending', $req->status);
    }

    public function test_rejected_request_cannot_later_be_approved(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->reject($req)->assertOk();

        $this->approve($req, '2026-12-09 18:00:00')->assertStatus(409);

        $booking->refresh();
        $this->assertSame(self::ORIGINAL_START, $booking->scheduled_start->toDateTimeString());
    }

    // ── QA finding 1: the rejection reason is surfaced on the customer's own
    // my-bookings endpoint, and never as an empty reason when none was
    // given. ─────────────────────────────────────────────────────────────

    public function test_rejection_reason_is_exposed_to_the_customer_on_my_bookings(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->reject($req, 'Therapist unavailable that day')->assertOk();

        $response = $this->actingAs($this->customer)->getJson('/api/my-bookings');
        $response->assertOk();

        $row = $this->findMyBooking($response, $booking->id);
        $this->assertNotNull($row, 'Expected to find the booking in the customer my-bookings payload.');
        $this->assertSame('rejected', $row['reschedule_request']['status']);
        $this->assertSame('Therapist unavailable that day', $row['reschedule_request']['admin_notes']);
    }

    public function test_rejection_reason_is_null_when_admin_gave_no_notes(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $this->reject($req)->assertOk();

        $response = $this->actingAs($this->customer)->getJson('/api/my-bookings');
        $response->assertOk();

        $row = $this->findMyBooking($response, $booking->id);
        $this->assertNotNull($row, 'Expected to find the booking in the customer my-bookings payload.');
        $this->assertSame('rejected', $row['reschedule_request']['status']);
        $this->assertNull($row['reschedule_request']['admin_notes']);
    }

    // ── QA finding 2: one-click approval sends request.requested_start_at
    // straight through as final_scheduled_start — no re-entry by the admin.
    // This is the exact request the "Approve Request" quick-approve button
    // makes. ──────────────────────────────────────────────────────────────

    public function test_one_click_approval_using_the_customers_requested_time_verbatim(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 20:00:00');

        $response = $this->approve($req, $req->requested_start_at->toDateTimeString());
        $response->assertOk();
        $response->assertJsonPath('request.status', 'approved');

        $booking->refresh();
        $this->assertSame('2026-12-09 20:00:00', $booking->scheduled_start->toDateTimeString());

        $req->refresh();
        $this->assertSame($req->requested_start_at->toDateTimeString(), $req->resolved_start_at->toDateTimeString());
    }

    // ── QA finding 2 (secondary action): "Choose Different Time" must still
    // reach the existing, fully manual approval flow and succeed with a
    // time other than what the customer requested. ──────────────────────────

    public function test_choose_different_time_still_approves_with_an_alternative_time(): void
    {
        $booking = $this->makeBooking();
        $req     = $this->makeRequest($booking, '2026-12-09 18:00:00');

        $response = $this->approve($req, '2026-12-09 19:00:00', 'Therapist free an hour later instead');
        $response->assertOk();
        $response->assertJsonPath('request.status', 'approved');

        $booking->refresh();
        $this->assertSame('2026-12-09 19:00:00', $booking->scheduled_start->toDateTimeString());

        $req->refresh();
        $this->assertSame('2026-12-09 18:00:00', $req->requested_start_at->toDateTimeString());
        $this->assertSame('2026-12-09 19:00:00', $req->resolved_start_at->toDateTimeString());
    }
}
