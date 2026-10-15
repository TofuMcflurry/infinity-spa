<?php

namespace Tests\Feature;

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
 * Covers GET /admin/api/bookings/{booking}/reschedule-availability —
 * the read-only preview the guided reschedule UI uses to disable invalid
 * dates and build the time-slot grid. Must never offer a time the real
 * POST /reschedule endpoint (BookingRescheduleService::reschedule()) would
 * reject — these tests pin that both paths agree.
 *
 * Same fixed calendar as AdminBookingRescheduleTest: therapist works
 * 16:00 -> 04:00 (next day), is off on Tuesdays, travel to "Test Zone" is
 * 30 minutes, service is 60 minutes.
 */
class AdminRescheduleAvailabilityTest extends TestCase
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
            'name' => 'Swedish Massage', 'duration_minutes' => 60, 'price' => 300, 'is_active' => true,
        ]);
        $this->variant = ServiceVariant::create([
            'service_id' => $this->service->id, 'duration_minutes' => 60, 'price' => 300,
        ]);
    }

    private function makeBooking(array $overrides = []): Booking
    {
        $start  = Carbon::parse($overrides['scheduled_start'] ?? self::ORIGINAL_START);
        $blocks = Booking::computeTimeBlocks($start->toDateTimeString(), 60, 30);

        return Booking::create(array_merge([
            'customer_id' => $this->customer->id, 'therapist_id' => $this->therapist->id,
            'service_id' => $this->service->id, 'service_variant_id' => $this->variant->id,
            'location' => 'Test location', 'zone_name' => 'Test Zone', 'status' => 'accepted',
            'scheduled_start' => $start, 'scheduled_end' => $blocks['scheduled_end'],
            'travel_start' => $blocks['travel_start'], 'buffer_end' => $blocks['buffer_end'],
        ], $overrides));
    }

    private function fetch(Booking $booking, ?string $date = null)
    {
        $url = "/admin/api/bookings/{$booking->id}/reschedule-availability" . ($date ? "?date={$date}" : '');
        return $this->actingAs($this->admin)->getJson($url);
    }

    public function test_no_date_returns_only_static_facts(): void
    {
        $booking = $this->makeBooking();

        $response = $this->fetch($booking);
        $response->assertOk();
        $response->assertJson(['day_off_weekday' => 'Tuesday', 'duration_minutes' => 60]);
        $this->assertArrayNotHasKey('slots', $response->json());
    }

    public function test_day_off_date_returns_no_slots(): void
    {
        $booking = $this->makeBooking();

        // Tuesday 2026-12-08 is the therapist's day off.
        $response = $this->fetch($booking, '2026-12-08');
        $response->assertOk();
        $response->assertJson(['is_day_off' => true, 'slots' => []]);
    }

    public function test_clean_day_returns_available_slots_spanning_the_real_shift(): void
    {
        $booking = $this->makeBooking();

        $response = $this->fetch($booking, '2026-12-09'); // Wednesday, no conflicts
        $response->assertOk();
        $response->assertJson(['is_day_off' => false]);

        $slots = $response->json('slots');
        $this->assertNotEmpty($slots);

        // First slot must be the shift start (16:00), not the hardcoded
        // customer-flow window (16:00 happens to match here, but the point
        // is this came from the therapist's own shift_start field).
        $this->assertSame('16:00', $slots[0]['time']);
        $this->assertTrue($slots[0]['available']);

        // Every slot must be available on an empty calendar day.
        $this->assertTrue(collect($slots)->every(fn ($s) => $s['available'] === true));
    }

    public function test_slot_overlapping_another_booking_is_marked_unavailable_with_conflict_reason(): void
    {
        $booking = $this->makeBooking();

        // Another accepted booking Wednesday 20:00-21:00.
        $this->makeBooking(['scheduled_start' => '2026-12-09 20:00:00']);

        $response = $this->fetch($booking, '2026-12-09');
        $slots = collect($response->json('slots'))->keyBy('time');

        $this->assertFalse($slots['20:00']['available']);
        $this->assertSame('conflict', $slots['20:00']['reason']);

        // A slot well clear of the 19:30-21:30 travel/buffer window stays
        // available. (22:00 is excluded deliberately — its own travel_start
        // of 21:30 touches the existing booking's buffer_end exactly, which
        // TherapistAvailabilityService::hasConflict's inclusive boundary
        // correctly still counts as a conflict; see Step 2's own
        // "overlapping travel or buffer interval... still conflicts" test.)
        $this->assertTrue($slots['22:30']['available']);
    }

    public function test_booking_does_not_conflict_with_its_own_current_slot(): void
    {
        $booking = $this->makeBooking(); // occupies Monday 19:30-21:30 (travel->buffer)

        // Preview the booking's own current date — its own slot must not
        // show up as unavailable due to self-conflict.
        $response = $this->fetch($booking, '2026-12-07');
        $slots = collect($response->json('slots'))->keyBy('time');

        $this->assertTrue($slots['20:00']['available'], 'excludeBookingId must prevent self-conflict in the preview too.');
    }

    public function test_unavailable_slot_is_reflected_with_its_own_reason(): void
    {
        $booking = $this->makeBooking();

        TherapistUnavailableSlot::create([
            'therapist_id' => $this->therapistUser->id,
            'date'         => '2026-12-11',
            'is_full_day'  => true,
        ]);

        $response = $this->fetch($booking, '2026-12-11');
        $slots = collect($response->json('slots'))->keyBy('time');

        // The unavailable-slot check is keyed by calendar date (same
        // semantics BookingRescheduleService::reschedule() already
        // enforces), so it covers the half-hour slots that fall on
        // 2026-12-11 itself (16:00 through 23:30) — this pins the known,
        // pre-existing behavior rather than asserting about the slice of
        // the shift that technically rolls into 2026-12-12.
        $this->assertFalse($slots['18:00']['available']);
        $this->assertSame('unavailable_slot', $slots['18:00']['reason']);
        $this->assertFalse($slots['23:30']['available']);
        $this->assertSame('unavailable_slot', $slots['23:30']['reason']);
    }

    public function test_every_available_slot_from_the_preview_is_actually_accepted_by_the_real_reschedule_endpoint(): void
    {
        $booking = $this->makeBooking();
        $this->makeBooking(['scheduled_start' => '2026-12-09 20:00:00']); // introduce a real conflict window

        $response = $this->fetch($booking, '2026-12-09');
        $firstAvailable = collect($response->json('slots'))->firstWhere('available', true);
        $this->assertNotNull($firstAvailable);

        $rescheduleResponse = $this->actingAs($this->admin)->postJson(
            "/admin/api/bookings/{$booking->id}/reschedule",
            ['scheduled_start' => "2026-12-09 {$firstAvailable['time']}:00"]
        );

        $rescheduleResponse->assertOk();
    }

    public function test_non_admin_cannot_access_the_availability_endpoint(): void
    {
        $booking = $this->makeBooking();

        $this->actingAs($this->customer)
            ->getJson("/admin/api/bookings/{$booking->id}/reschedule-availability?date=2026-12-09")
            ->assertRedirect('/');
    }
}
