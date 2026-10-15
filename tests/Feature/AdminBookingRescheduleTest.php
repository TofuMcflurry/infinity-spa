<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\TherapistUnavailableSlot;
use App\Models\TherapistZone;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/StaleActiveSessionTest.php. Run with DB_CONNECTION=
 * pgsql pointed at a disposable test database, not sqlite (phpunit.xml's
 * default) and never the real dev database.
 *
 * Covers POST /admin/api/bookings/{booking}/reschedule end-to-end
 * (BookingRescheduleService + AdminBookingController::reschedule()).
 *
 * Fixed calendar: the therapist works 16:00 -> 04:00 (next day), is off on
 * Tuesdays, travel time to "Test Zone" is 30 minutes, and the booked
 * service is 60 minutes — so an existing booking at Monday 20:00 has
 * travel_start 19:30, scheduled_end 21:00, buffer_end 21:30.
 */
class AdminBookingRescheduleTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $customer;
    private User $therapistUser;
    private Therapist $therapist;
    private Service $service;
    private ServiceVariant $variant;

    // Monday 2026-12-07 20:00 — a normal working slot for the therapist.
    private const ORIGINAL_START = '2026-12-07 20:00:00';

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

    private function reschedule(Booking $booking, string $newStart, ?string $reason = null): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->admin)->postJson(
            "/admin/api/bookings/{$booking->id}/reschedule",
            array_filter([
                'scheduled_start' => $newStart,
                'reason'          => $reason,
            ], fn ($v) => $v !== null)
        );
    }

    // ── 1-4: valid reschedule + correct recomputation ───────────────────────

    public function test_valid_admin_reschedule_succeeds_and_recomputes_all_time_blocks(): void
    {
        $booking = $this->makeBooking();

        // Wednesday 2026-12-09 20:00 — clean slot, no conflicts.
        $response = $this->reschedule($booking, '2026-12-09 20:00:00', 'Customer requested a different day');
        $response->assertOk();
        $response->assertJsonPath('message', 'Booking rescheduled.');

        $booking->refresh();

        $this->assertSame('2026-12-09 20:00:00', $booking->scheduled_start->toDateTimeString());
        $this->assertSame('2026-12-09 21:00:00', $booking->scheduled_end->toDateTimeString(), 'scheduled_end must be recomputed from the 60-minute service duration.');
        $this->assertSame('2026-12-09 19:30:00', $booking->travel_start->toDateTimeString(), 'travel_start must be recomputed from the 30-minute zone travel time.');
        $this->assertSame('2026-12-09 21:30:00', $booking->buffer_end->toDateTimeString(), 'buffer_end must be recomputed with the existing 30-minute buffer.');

        // Untouched fields.
        $this->assertSame('accepted', $booking->status);
        $this->assertSame($this->therapist->id, $booking->therapist_id);
        $this->assertSame($this->customer->id, $booking->customer_id);
        $this->assertSame($this->service->id, $booking->service_id);
        $this->assertSame($this->variant->id, $booking->service_variant_id);
    }

    // ── 5: previous schedule preserved in the audit log ─────────────────────

    public function test_previous_schedule_is_recorded_in_the_audit_log(): void
    {
        $booking = $this->makeBooking();

        $this->reschedule($booking, '2026-12-09 20:00:00', 'Client conflict')->assertOk();

        $log = AuditLog::where('event', 'booking.rescheduled')->where('target_id', $booking->id)->first();

        $this->assertNotNull($log);
        $this->assertSame($this->admin->id, $log->user_id);
        $this->assertSame('admin', $log->user_role);
        $this->assertSame('2026-12-07 20:00:00', $log->metadata['previous_scheduled_start']);
        $this->assertSame('2026-12-07 21:00:00', $log->metadata['previous_scheduled_end']);
        $this->assertSame('2026-12-09 20:00:00', $log->metadata['new_scheduled_start']);
        $this->assertSame('2026-12-09 21:00:00', $log->metadata['new_scheduled_end']);
        $this->assertSame('Client conflict', $log->metadata['reason']);
    }

    // ── 6: direct session-overlap conflict blocks reschedule ────────────────

    public function test_therapist_conflict_blocks_reschedule(): void
    {
        $booking = $this->makeBooking();

        // Another accepted booking Thursday 20:00-21:00.
        $this->makeBooking(['scheduled_start' => '2026-12-10 20:00:00']);

        // Try to move $booking directly on top of that session.
        $response = $this->reschedule($booking, '2026-12-10 20:15:00');
        $response->assertStatus(422);
        $response->assertJsonPath('message', 'This time conflicts with another booking for this therapist.');

        $booking->refresh();
        $this->assertSame('2026-12-07 20:00:00', $booking->scheduled_start->toDateTimeString(), 'A blocked reschedule must not change the original schedule.');
    }

    // ── 7: travel/buffer-only overlap (no session overlap) still conflicts ──

    public function test_travel_or_buffer_only_overlap_blocks_reschedule(): void
    {
        $booking = $this->makeBooking();

        // Existing booking Thursday 20:00-21:00, buffer_end 21:30.
        $this->makeBooking(['scheduled_start' => '2026-12-10 20:00:00']);

        // Candidate session 21:15-22:15 (no session overlap with 20:00-21:00)
        // but its travel_start (20:45) falls inside the existing buffer_end (21:30).
        $response = $this->reschedule($booking, '2026-12-10 21:15:00');
        $response->assertStatus(422);
        $response->assertJsonPath('message', 'This time conflicts with another booking for this therapist.');
    }

    // ── 8: therapist day off blocks reschedule ───────────────────────────────

    public function test_therapist_day_off_blocks_reschedule(): void
    {
        $booking = $this->makeBooking();

        // Tuesday 2026-12-08 is the therapist's day_off.
        $response = $this->reschedule($booking, '2026-12-08 20:00:00');
        $response->assertStatus(422);
        $response->assertJsonPath('message', 'Therapist is off on Tuesdays.');
    }

    // ── 9: therapist shift boundary blocks reschedule ───────────────────────

    public function test_outside_therapist_shift_blocks_reschedule(): void
    {
        $booking = $this->makeBooking();

        // 10:00 AM is well outside the therapist's 16:00 -> 04:00 shift.
        $response = $this->reschedule($booking, '2026-12-09 10:00:00');
        $response->assertStatus(422);
        $response->assertJsonPath('message', "The selected time is outside the therapist's working hours.");
    }

    // ── 10: TherapistUnavailableSlot blocks reschedule ───────────────────────

    public function test_therapist_unavailable_slot_blocks_reschedule(): void
    {
        $booking = $this->makeBooking();

        TherapistUnavailableSlot::create([
            'therapist_id' => $this->therapistUser->id, // references users.id, not therapists.id
            'date'         => '2026-12-11',
            'is_full_day'  => true,
        ]);

        $response = $this->reschedule($booking, '2026-12-11 20:00:00');
        $response->assertStatus(422);
        $response->assertJsonPath('message', 'Therapist has marked this time as unavailable.');
    }

    // ── 11: booking does not conflict with its own current slot ─────────────

    public function test_booking_does_not_conflict_with_its_own_current_slot(): void
    {
        $booking = $this->makeBooking();

        // Shift the start by only 10 minutes — the new window still
        // overlaps the booking's own original travel/session/buffer window.
        // Without excludeBookingId this would incorrectly self-conflict.
        $response = $this->reschedule($booking, '2026-12-07 20:10:00');
        $response->assertOk();

        $booking->refresh();
        $this->assertSame('2026-12-07 20:10:00', $booking->scheduled_start->toDateTimeString());
    }

    // ── 12: terminal / non-reschedulable states are rejected ────────────────

    public function test_terminal_and_non_reschedulable_states_are_rejected(): void
    {
        foreach (['completed', 'rejected', 'cancelled', 'en_route', 'arrived', 'pending_payment'] as $status) {
            $booking = $this->makeBooking(['status' => $status]);

            $response = $this->reschedule($booking, '2026-12-09 20:00:00');
            $response->assertStatus(422, "Status '{$status}' must not be reschedulable.");
            $response->assertJsonPath('message', 'This booking is not in a reschedulable state.');

            $booking->refresh();
            $this->assertSame(self::ORIGINAL_START, $booking->scheduled_start->toDateTimeString());
        }
    }

    public function test_pending_status_is_reschedulable(): void
    {
        $booking = $this->makeBooking(['status' => 'pending']);

        $response = $this->reschedule($booking, '2026-12-09 20:00:00');
        $response->assertOk();
    }

    // ── 13: unauthorized non-admin cannot call the endpoint ──────────────────

    public function test_non_admin_cannot_access_the_reschedule_endpoint(): void
    {
        $booking = $this->makeBooking();

        // AdminMiddleware redirects any non-admin (even on a JSON request)
        // to '/' rather than returning 403 — matches the existing convention
        // asserted in StaleActiveSessionTest::test_non_admin_cannot_access_stale_review_endpoints().
        $this->actingAs($this->customer)
            ->postJson("/admin/api/bookings/{$booking->id}/reschedule", ['scheduled_start' => '2026-12-09 20:00:00'])
            ->assertRedirect('/');

        $booking->refresh();
        $this->assertSame(self::ORIGINAL_START, $booking->scheduled_start->toDateTimeString());
    }

    // ── 14: a failed validation leaves the original schedule fully intact ───

    public function test_failed_validation_leaves_original_schedule_completely_unchanged(): void
    {
        $booking = $this->makeBooking();
        $originalTravelStart = $booking->travel_start->toDateTimeString();
        $originalEnd         = $booking->scheduled_end->toDateTimeString();
        $originalBufferEnd   = $booking->buffer_end->toDateTimeString();

        // Day-off failure.
        $this->reschedule($booking, '2026-12-08 20:00:00')->assertStatus(422);

        $booking->refresh();
        $this->assertSame(self::ORIGINAL_START, $booking->scheduled_start->toDateTimeString());
        $this->assertSame($originalEnd, $booking->scheduled_end->toDateTimeString());
        $this->assertSame($originalTravelStart, $booking->travel_start->toDateTimeString());
        $this->assertSame($originalBufferEnd, $booking->buffer_end->toDateTimeString());
        $this->assertSame(
            0,
            AuditLog::where('event', 'booking.rescheduled')->where('target_id', $booking->id)->count(),
            'No audit event must be recorded for a blocked reschedule attempt.'
        );
    }

    // ── Input validation ──────────────────────────────────────────────────

    public function test_past_datetime_is_rejected_by_request_validation(): void
    {
        $booking = $this->makeBooking();

        $response = $this->reschedule($booking, '2020-01-01 10:00:00');
        $response->assertStatus(422);
        $response->assertJsonValidationErrors('scheduled_start');
    }

    public function test_missing_scheduled_start_is_rejected(): void
    {
        $booking = $this->makeBooking();

        $response = $this->actingAs($this->admin)->postJson("/admin/api/bookings/{$booking->id}/reschedule", []);
        $response->assertStatus(422);
        $response->assertJsonValidationErrors('scheduled_start');
    }
}
