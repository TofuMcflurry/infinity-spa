<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Service;
use App\Models\Therapist;
use App\Models\User;
use App\Services\TherapistAvailabilityService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/StaleActiveSessionTest.php. Run with DB_CONNECTION=
 * pgsql pointed at a disposable test database, not sqlite (phpunit.xml's
 * default) and never the real dev database.
 *
 * Covers TherapistAvailabilityService::hasConflict() — the overlap rule
 * extracted from BookingController's former private hasConflict(). These
 * scenarios pin down the exact behavior that must survive the extraction
 * and stay available for the future Admin Rescheduling flow.
 */
class TherapistAvailabilityServiceTest extends TestCase
{
    use RefreshDatabase;

    private Therapist $therapist;
    private Therapist $otherTherapist;
    private Service $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->therapist = $this->makeTherapist();
        $this->otherTherapist = $this->makeTherapist();

        $this->service = Service::create([
            'name'             => 'Swedish Massage',
            'duration_minutes' => 60,
            'price'            => 300,
            'is_active'        => true,
        ]);
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

    /**
     * An existing 'accepted' booking for $this->therapist:
     * travel_start 09:30, scheduled_start 10:00, scheduled_end 11:00, buffer_end 11:30.
     */
    private function makeExistingBooking(array $overrides = []): Booking
    {
        return Booking::create(array_merge([
            'therapist_id' => $this->therapist->id,
            'service_id'   => $this->service->id,
            'location'     => 'Test location',
            'zone_name'    => 'Test Zone',
            'status'       => 'accepted',
            'travel_start'    => Carbon::parse('2026-10-01 09:30:00'),
            'scheduled_start' => Carbon::parse('2026-10-01 10:00:00'),
            'scheduled_end'   => Carbon::parse('2026-10-01 11:00:00'),
            'buffer_end'      => Carbon::parse('2026-10-01 11:30:00'),
        ], $overrides));
    }

    public function test_conflict_with_another_booking_at_the_same_time_is_detected(): void
    {
        $this->makeExistingBooking();

        $result = TherapistAvailabilityService::hasConflict(
            $this->therapist->id,
            Carbon::parse('2026-10-01 09:30:00'), // travel_start
            Carbon::parse('2026-10-01 11:30:00'), // buffer_end
        );

        $this->assertTrue($result, 'An identical candidate window must conflict with the existing booking.');
    }

    public function test_no_conflict_when_candidate_window_does_not_overlap(): void
    {
        $this->makeExistingBooking();

        $result = TherapistAvailabilityService::hasConflict(
            $this->therapist->id,
            Carbon::parse('2026-10-01 14:00:00'), // travel_start — well after buffer_end 11:30
            Carbon::parse('2026-10-01 16:00:00'), // buffer_end
        );

        $this->assertFalse($result, 'A candidate window with no interval overlap must not conflict.');
    }

    public function test_excluding_the_booking_itself_prevents_self_conflict(): void
    {
        $existing = $this->makeExistingBooking();

        // Re-checking the exact same booking's own current window, as Admin
        // Rescheduling would when re-validating before applying a change.
        $conflictWithoutExclude = TherapistAvailabilityService::hasConflict(
            $this->therapist->id,
            Carbon::parse('2026-10-01 09:30:00'),
            Carbon::parse('2026-10-01 11:30:00'),
        );
        $this->assertTrue($conflictWithoutExclude, 'Sanity check: without excludeBookingId the booking conflicts with itself.');

        $conflictWithExclude = TherapistAvailabilityService::hasConflict(
            $this->therapist->id,
            Carbon::parse('2026-10-01 09:30:00'),
            Carbon::parse('2026-10-01 11:30:00'),
            $existing->id,
        );

        $this->assertFalse($conflictWithExclude, 'excludeBookingId must stop a booking from conflicting with its own row.');
    }

    public function test_overlapping_travel_or_buffer_interval_without_session_overlap_still_conflicts(): void
    {
        $this->makeExistingBooking(); // travel 09:30 → buffer 11:30, session 10:00-11:00

        // Candidate session starts at 11:15 (after the existing session ends
        // at 11:00) but its own travel window (10:45) falls inside the
        // existing booking's buffer_end (11:30) — the buffer rule, not the
        // session-overlap rule, must still flag this as a conflict.
        $result = TherapistAvailabilityService::hasConflict(
            $this->therapist->id,
            Carbon::parse('2026-10-01 10:45:00'), // travel_start
            Carbon::parse('2026-10-01 12:45:00'), // buffer_end
        );

        $this->assertTrue($result, 'A candidate whose travel/buffer window overlaps the existing buffer must conflict even without session overlap.');
    }

    public function test_unrelated_therapist_booking_does_not_cause_a_conflict(): void
    {
        $this->makeExistingBooking(['therapist_id' => $this->otherTherapist->id]);

        $result = TherapistAvailabilityService::hasConflict(
            $this->therapist->id,
            Carbon::parse('2026-10-01 09:30:00'),
            Carbon::parse('2026-10-01 11:30:00'),
        );

        $this->assertFalse($result, 'A booking on a different therapist must never register as a conflict.');
    }
}
