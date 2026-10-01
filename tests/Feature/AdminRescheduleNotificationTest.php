<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\TherapistZone;
use App\Models\User;
use App\Notifications\BookingNotification;
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
 * Covers the post-commit notification side effect of
 * AdminBookingController::reschedule(): exactly one BookingNotification
 * (type 'rescheduled') to the customer and exactly one to the therapist,
 * using the NEW schedule, on both the database and mail channels — and
 * zero notifications when the reschedule fails validation.
 *
 * Same fixed calendar as AdminBookingRescheduleTest: therapist works
 * 16:00 -> 04:00 (next day), is off on Tuesdays, travel to "Test Zone" is
 * 30 minutes, service is 60 minutes.
 */
class AdminRescheduleNotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $customer;
    private User $therapistUser;
    private Therapist $therapist;
    private Service $service;
    private ServiceVariant $variant;

    private const ORIGINAL_START = '2026-12-07 20:00:00'; // Monday
    private const NEW_START      = '2026-12-09 20:00:00'; // Wednesday — clean slot

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
            array_filter(['scheduled_start' => $newStart, 'reason' => $reason], fn ($v) => $v !== null)
        );
    }

    // ── 1, 2, 9: exactly one notification per correct recipient, no one else ──

    public function test_successful_reschedule_notifies_exactly_the_customer_and_therapist_once_each(): void
    {
        NotificationFacade::fake();

        $otherCustomer      = User::factory()->create(['role' => 'customer']);
        $otherTherapistUser = User::factory()->create(['role' => 'therapist']);

        $booking = $this->makeBooking();

        $this->reschedule($booking, self::NEW_START)->assertOk();

        NotificationFacade::assertSentTimes(BookingNotification::class, 2);
        NotificationFacade::assertSentTo($this->customer, BookingNotification::class, fn ($n) => $n->type === 'rescheduled' && $n->booking->id === $booking->id);
        NotificationFacade::assertSentTo($this->therapistUser, BookingNotification::class, fn ($n) => $n->type === 'rescheduled' && $n->booking->id === $booking->id);

        NotificationFacade::assertNotSentTo($otherCustomer, BookingNotification::class);
        NotificationFacade::assertNotSentTo($otherTherapistUser, BookingNotification::class);
    }

    // ── 3: notification type is 'rescheduled' ────────────────────────────────

    public function test_notification_type_is_rescheduled(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking();

        $this->reschedule($booking, self::NEW_START)->assertOk();

        NotificationFacade::assertSentTo($this->customer, BookingNotification::class, fn ($n) => $n->type === 'rescheduled');
        NotificationFacade::assertSentTo($this->therapistUser, BookingNotification::class, fn ($n) => $n->type === 'rescheduled');
    }

    // ── 4: notification content shows the NEW date/time, for both recipients ─

    public function test_notification_content_contains_the_new_date_and_time(): void
    {
        $booking = $this->makeBooking();

        $this->reschedule($booking, self::NEW_START)->assertOk();

        // New schedule label per BookingNotification's own format: 'M j \a\t g:i A'.
        $expectedLabel = Carbon::parse(self::NEW_START)->timezone('Asia/Dubai')->format('M j \a\t g:i A');

        $customerFeed = $this->actingAs($this->customer)->getJson('/api/notifications')->json('notifications');
        $this->assertSame('rescheduled', $customerFeed[0]['type']);
        $this->assertSame('Booking Rescheduled', $customerFeed[0]['title']);
        $this->assertStringContainsString($expectedLabel, $customerFeed[0]['message']);
        $this->assertStringContainsString('Swedish Massage', $customerFeed[0]['message']);
        $this->assertSame('/my-bookings', $customerFeed[0]['url']);

        $therapistFeed = $this->actingAs($this->therapistUser)->getJson('/api/notifications')->json('notifications');
        $this->assertSame('rescheduled', $therapistFeed[0]['type']);
        $this->assertStringContainsString($expectedLabel, $therapistFeed[0]['message']);
        $this->assertSame('/therapist/bookings', $therapistFeed[0]['url'], 'The therapist copy must route to the therapist bookings view, not the customer one.');
    }

    // ── 5, 6: both recipients get the mail channel too ───────────────────────

    public function test_customer_and_therapist_both_receive_an_email(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking();

        $this->reschedule($booking, self::NEW_START)->assertOk();

        NotificationFacade::assertSentTo(
            $this->customer,
            BookingNotification::class,
            fn ($n, $channels) => $n->type === 'rescheduled' && in_array('mail', $channels, true) && in_array('database', $channels, true)
        );
        NotificationFacade::assertSentTo(
            $this->therapistUser,
            BookingNotification::class,
            fn ($n, $channels) => $n->type === 'rescheduled' && in_array('mail', $channels, true) && in_array('database', $channels, true)
        );
    }

    // ── 7: a non-reschedulable-state failure sends zero notifications ────────

    public function test_failed_reschedule_terminal_state_sends_zero_notifications(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking(['status' => 'completed']);

        $this->reschedule($booking, self::NEW_START)->assertStatus(422);

        NotificationFacade::assertNothingSent();
    }

    // ── 8: an availability/conflict failure sends zero notifications ─────────

    public function test_failed_availability_validation_sends_zero_notifications(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking();

        // Tuesday is the therapist's day off.
        $this->reschedule($booking, '2026-12-08 20:00:00')->assertStatus(422);

        NotificationFacade::assertNothingSent();
    }

    public function test_failed_conflict_validation_sends_zero_notifications(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking();
        $this->makeBooking(['scheduled_start' => '2026-12-10 20:00:00']); // occupies the target slot

        $this->reschedule($booking, '2026-12-10 20:15:00')->assertStatus(422);

        NotificationFacade::assertNothingSent();
    }

    // ── 10 (partial, see full regression run): unrelated types untouched ────
    // Full coverage of "existing notification types remain unchanged" is the
    // existing PaymentNotificationTest / TherapistNewBookingNotificationTest /
    // TherapistCancellationNotificationMessageTest suites, run alongside this
    // one — not duplicated here. This is a light smoke check that a routine
    // 'accepted' notification still looks the same after this change.
    public function test_an_unrelated_existing_notification_type_is_unaffected(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking(['status' => 'pending']);

        $booking->load('customer', 'service', 'serviceVariant', 'therapist.user');
        $booking->customer->notify(new BookingNotification($booking, 'accepted'));

        NotificationFacade::assertSentTo(
            $this->customer,
            BookingNotification::class,
            fn ($n, $channels) => $n->type === 'accepted' && in_array('mail', $channels, true) && $n->previousScheduledStart === null
        );
    }

    // ── 11: audit log still records the reschedule alongside notifications ──

    public function test_audit_log_still_records_the_reschedule(): void
    {
        $booking = $this->makeBooking();

        $this->reschedule($booking, self::NEW_START, 'Client requested a later date')->assertOk();

        $log = AuditLog::where('event', 'booking.rescheduled')->where('target_id', $booking->id)->first();
        $this->assertNotNull($log);
        $this->assertSame('2026-12-07 20:00:00', $log->metadata['previous_scheduled_start']);
        $this->assertSame('2026-12-09 20:00:00', $log->metadata['new_scheduled_start']);
        $this->assertSame('Client requested a later date', $log->metadata['reason']);
    }

    // ── 12: booking data is still correct after notification dispatch ───────

    public function test_booking_data_remains_correct_after_notification_dispatch(): void
    {
        $booking = $this->makeBooking();

        $this->reschedule($booking, self::NEW_START)->assertOk();

        $booking->refresh();
        $this->assertSame('2026-12-09 20:00:00', $booking->scheduled_start->toDateTimeString());
        $this->assertSame('2026-12-09 21:00:00', $booking->scheduled_end->toDateTimeString());
        $this->assertSame('2026-12-09 19:30:00', $booking->travel_start->toDateTimeString());
        $this->assertSame('2026-12-09 21:30:00', $booking->buffer_end->toDateTimeString());
        $this->assertSame('accepted', $booking->status);
        $this->assertSame($this->therapist->id, $booking->therapist_id);
        $this->assertSame($this->customer->id, $booking->customer_id);
    }
}
