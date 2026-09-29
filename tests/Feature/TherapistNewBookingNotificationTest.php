<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use App\Notifications\BookingNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification as NotificationFacade;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/BookingApprovalFlowTest.php. Run with DB_CONNECTION=
 * pgsql pointed at a disposable test database, not sqlite (phpunit.xml's
 * default) and never the real dev database.
 *
 * Covers the new "New Booking Request" therapist in-app notification:
 * BookingController::store() notifies the assigned therapist (and only that
 * therapist — never the customer) exactly once, after the booking row has
 * actually been created, using the existing BookingNotification /
 * notifications-table / /api/notifications infrastructure. In-app only —
 * no email for this event (see BookingNotification::via()).
 */
class TherapistNewBookingNotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;
    private Service $service;
    private ServiceVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customer = User::factory()->create(['role' => 'customer', 'name' => 'Maria Santos']);

        $this->service = Service::create([
            'name'             => 'Deep Relaxation Massage',
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

    private function makeTherapist(array $overrides = []): array
    {
        $user = User::factory()->create(array_merge(['role' => 'therapist'], $overrides));
        $therapist = Therapist::create([
            'user_id'       => $user->id,
            'base_location' => 'Dubai',
            'gender'        => 'female',
            'is_active'     => true,
        ]);

        return [$user, $therapist];
    }

    private function bookingPayload(Therapist $therapist, array $overrides = []): array
    {
        return array_merge([
            'service_id'     => $this->variant->id,
            'therapist_id'   => $therapist->id,
            'zone_name'      => 'Test Zone',
            'location'       => 'Test location',
            'datetime'       => now()->addDay()->toDateTimeString(),
            'payment_type'   => 'full',
            'payment_method' => 'cashless',
        ], $overrides);
    }

    // ── 1 & 4: successful creation → exactly 1 therapist notification, correct target ──

    public function test_successful_booking_notifies_assigned_therapist_exactly_once(): void
    {
        NotificationFacade::fake();

        [$therapistUser, $therapist] = $this->makeTherapist();

        $response = $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist));

        $response->assertCreated();
        $booking = Booking::latest('id')->first();

        NotificationFacade::assertSentTimes(BookingNotification::class, 1);
        NotificationFacade::assertSentTo(
            $therapistUser,
            BookingNotification::class,
            fn($notification) => $notification->type === 'booking_pending'
                && $notification->booking->id === $booking->id
        );
    }

    // ── 2: customer never gets this event's notification ────────────────────

    public function test_customer_receives_no_booking_pending_notification(): void
    {
        NotificationFacade::fake();

        [$therapistUser, $therapist] = $this->makeTherapist();

        $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist))
            ->assertCreated();

        NotificationFacade::assertNotSentTo(
            $this->customer,
            BookingNotification::class,
            fn($notification) => $notification->type === 'booking_pending'
        );
        // The customer gets no BookingNotification at all from this event —
        // only the lifecycle actions (accept/start/etc.) notify them.
        NotificationFacade::assertNothingSentTo($this->customer);
    }

    // ── 3: validation failure → zero notifications ───────────────────────────

    public function test_booking_validation_failure_sends_no_therapist_notification(): void
    {
        NotificationFacade::fake();

        [, $therapist] = $this->makeTherapist();

        // Missing required 'location' and 'datetime'.
        $response = $this->actingAs($this->customer)->postJson('/api/bookings', [
            'service_id'     => $this->variant->id,
            'therapist_id'   => $therapist->id,
            'zone_name'      => 'Test Zone',
            'payment_type'   => 'full',
            'payment_method' => 'cashless',
        ]);

        $response->assertStatus(422);
        NotificationFacade::assertNothingSent();
    }

    // ── 5: two therapists each only see their own booking's notification ────

    public function test_two_therapists_only_receive_their_own_assigned_booking_notification(): void
    {
        NotificationFacade::fake();

        [$therapistA, $ta] = $this->makeTherapist();
        [$therapistB, $tb] = $this->makeTherapist();

        $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($ta, ['datetime' => now()->addDay(1)->toDateTimeString()]))
            ->assertCreated();
        $bookingA = Booking::latest('id')->first();

        $this->actingAs(User::factory()->create(['role' => 'customer']))
            ->postJson('/api/bookings', $this->bookingPayload($tb, ['datetime' => now()->addDay(2)->toDateTimeString()]))
            ->assertCreated();
        $bookingB = Booking::latest('id')->first();

        NotificationFacade::assertSentTimes(BookingNotification::class, 2);

        NotificationFacade::assertSentTo(
            $therapistA,
            BookingNotification::class,
            fn($n) => $n->type === 'booking_pending' && $n->booking->id === $bookingA->id
        );
        NotificationFacade::assertNotSentTo(
            $therapistA,
            BookingNotification::class,
            fn($n) => $n->type === 'booking_pending' && $n->booking->id === $bookingB->id
        );

        NotificationFacade::assertSentTo(
            $therapistB,
            BookingNotification::class,
            fn($n) => $n->type === 'booking_pending' && $n->booking->id === $bookingB->id
        );
        NotificationFacade::assertNotSentTo(
            $therapistB,
            BookingNotification::class,
            fn($n) => $n->type === 'booking_pending' && $n->booking->id === $bookingA->id
        );
    }

    // ── 6: existing customer lifecycle notification behavior is unchanged ───

    public function test_existing_customer_accept_notification_still_fires_normally(): void
    {
        NotificationFacade::fake();

        [$therapistUser, $therapist] = $this->makeTherapist();

        $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist))
            ->assertCreated();
        $booking = Booking::latest('id')->first();

        // Booking is created as 'pending_payment' here; simulate payment/therapist
        // pre-approval the same way BookingApprovalFlowTest does — move straight
        // to 'pending' so accept() is reachable, matching an existing test convention.
        $booking->update(['status' => 'pending', 'payment_status' => 'paid']);

        $this->actingAs($therapistUser)
            ->postJson("/therapist/api/bookings/{$booking->id}/accept")
            ->assertOk();

        NotificationFacade::assertSentTimes(BookingNotification::class, 2); // booking_pending + accepted
        NotificationFacade::assertSentTo(
            $this->customer,
            BookingNotification::class,
            fn($n) => $n->type === 'accepted' && $n->booking->id === $booking->id
        );
        NotificationFacade::assertNotSentTo(
            $this->customer,
            BookingNotification::class,
            fn($n) => $n->type === 'booking_pending'
        );
    }

    // ── 4 & 7: persisted payload is correct and readable through the existing endpoint ──

    public function test_notification_is_readable_through_existing_notifications_endpoint(): void
    {
        [$therapistUser, $therapist] = $this->makeTherapist();

        $this->actingAs($this->customer)
            ->postJson('/api/bookings', $this->bookingPayload($therapist, [
                'datetime' => '2026-09-30 10:00:00',
            ]))
            ->assertCreated();
        $booking = Booking::latest('id')->first();

        $response = $this->actingAs($therapistUser)->getJson('/api/notifications');

        $response->assertOk();
        $payload = $response->json('notifications');

        $this->assertCount(1, $payload);
        $notif = $payload[0];

        $this->assertSame('booking_pending', $notif['type']);
        $this->assertSame('New Booking Request', $notif['title']);
        $this->assertSame($booking->id, $notif['booking_id']);
        $this->assertSame('/therapist/bookings?tab=pending', $notif['url']);
        $this->assertFalse($notif['read']);
        $this->assertStringContainsString('Maria S.', $notif['message']);
        $this->assertStringContainsString('Deep Relaxation Massage', $notif['message']);

        $this->assertSame(1, $response->json('unread_count'));
    }
}
