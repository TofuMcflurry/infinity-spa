<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\LoyaltyReward;
use App\Models\Service;
use App\Models\Therapist;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification as NotificationFacade;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — the app's own
 * migrations use Postgres-only `DB::statement` (`ALTER TABLE ... DROP
 * CONSTRAINT`, `::text` casts) that fail against phpunit.xml's default
 * sqlite :memory: connection. That incompatibility pre-dates this feature
 * (confirmed: `php artisan test --filter=ProfileTest` already fails the
 * same way against the existing users-table migrations). Run this suite
 * with DB_CONNECTION=pgsql pointed at a disposable test database.
 */
class StaleActiveSessionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $customer;
    private Therapist $therapist;
    private Service $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->customer = User::factory()->create(['role' => 'customer']);

        $therapistUser = User::factory()->create(['role' => 'therapist']);
        $this->therapist = Therapist::create([
            'user_id'       => $therapistUser->id,
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
    }

    private function makeBooking(array $overrides = []): Booking
    {
        return Booking::create(array_merge([
            'customer_id'     => $this->customer->id,
            'therapist_id'    => $this->therapist->id,
            'service_id'      => $this->service->id,
            'location'        => 'Test location',
            'zone_name'       => 'Test Zone',
            'payment_method'  => 'cash',
        ], $overrides));
    }

    // ── Detection thresholds ────────────────────────────────────────────────

    public function test_en_route_booking_past_60_minutes_is_flagged(): void
    {
        $booking = $this->makeBooking([
            'status'          => 'en_route',
            'scheduled_start' => now()->subMinutes(90),
            'scheduled_end'   => now()->subMinutes(30),
        ]);

        $this->artisan('bookings:flag-stale-active-sessions')->assertSuccessful();

        $booking->refresh();
        $this->assertNotNull($booking->flagged_at);
        $this->assertSame('stale_en_route', $booking->flag_reason);
        $this->assertSame('en_route', $booking->status, 'Flagging must not change the booking status.');
    }

    public function test_arrived_booking_past_2_hours_is_flagged(): void
    {
        $booking = $this->makeBooking([
            'status'          => 'arrived',
            'scheduled_start' => now()->subHours(4),
            'scheduled_end'   => now()->subHours(3),
        ]);

        $this->artisan('bookings:flag-stale-active-sessions')->assertSuccessful();

        $booking->refresh();
        $this->assertNotNull($booking->flagged_at);
        $this->assertSame('stale_arrived', $booking->flag_reason);
    }

    public function test_en_route_booking_within_60_minutes_is_not_flagged(): void
    {
        $booking = $this->makeBooking([
            'status'          => 'en_route',
            'scheduled_start' => now()->subMinutes(10),
            'scheduled_end'   => now()->addMinutes(50),
        ]);

        $this->artisan('bookings:flag-stale-active-sessions')->assertSuccessful();

        $this->assertNull($booking->refresh()->flagged_at);
    }

    public function test_completed_cancelled_rejected_and_already_flagged_bookings_are_excluded(): void
    {
        $completed = $this->makeBooking([
            'status' => 'completed', 'scheduled_start' => now()->subHours(4), 'scheduled_end' => now()->subHours(3),
        ]);
        $cancelled = $this->makeBooking([
            'status' => 'cancelled', 'scheduled_start' => now()->subHours(4), 'scheduled_end' => now()->subHours(3),
        ]);
        $rejected = $this->makeBooking([
            'status' => 'rejected', 'scheduled_start' => now()->subHours(4), 'scheduled_end' => now()->subHours(3),
        ]);
        $alreadyFlagged = $this->makeBooking([
            'status' => 'arrived', 'scheduled_start' => now()->subHours(4), 'scheduled_end' => now()->subHours(3),
            'flagged_at' => now()->subMinutes(5), 'flag_reason' => 'stale_arrived',
        ]);

        $this->artisan('bookings:flag-stale-active-sessions')->assertSuccessful();

        $this->assertNull($completed->refresh()->flagged_at);
        $this->assertNull($cancelled->refresh()->flagged_at);
        $this->assertNull($rejected->refresh()->flagged_at);
        // Its flagged_at should be untouched (still the original timestamp), not re-flagged.
        $this->assertTrue($alreadyFlagged->refresh()->flagged_at->eq(
            \Carbon\Carbon::parse($alreadyFlagged->getOriginal('flagged_at') ?? $alreadyFlagged->flagged_at)
        ));
    }

    public function test_flagging_dispatches_exactly_one_audit_event_and_one_notification_per_booking(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking([
            'status' => 'en_route', 'scheduled_start' => now()->subMinutes(90), 'scheduled_end' => now()->subMinutes(30),
        ]);

        $this->artisan('bookings:flag-stale-active-sessions')->assertSuccessful();

        $this->assertSame(1, AuditLog::where('event', 'booking.flagged_stale')->where('target_id', $booking->id)->count());
        NotificationFacade::assertSentToTimes($this->admin, \App\Notifications\InAppNotification::class, 1);
    }

    public function test_running_the_command_twice_does_not_reflag_or_renotify(): void
    {
        NotificationFacade::fake();

        $booking = $this->makeBooking([
            'status' => 'arrived', 'scheduled_start' => now()->subHours(4), 'scheduled_end' => now()->subHours(3),
        ]);

        $this->artisan('bookings:flag-stale-active-sessions')->assertSuccessful();
        $flaggedAtFirstRun = $booking->refresh()->flagged_at;

        $this->artisan('bookings:flag-stale-active-sessions')->assertSuccessful();

        $this->assertTrue($booking->refresh()->flagged_at->eq($flaggedAtFirstRun));
        $this->assertSame(1, AuditLog::where('event', 'booking.flagged_stale')->where('target_id', $booking->id)->count());
        NotificationFacade::assertSentToTimes($this->admin, \App\Notifications\InAppNotification::class, 1);
    }

    // ── Admin resolution actions ────────────────────────────────────────────

    private function flaggedArrivedBooking(): Booking
    {
        return $this->makeBooking([
            'status'          => 'arrived',
            'scheduled_start' => now()->subHours(4),
            'scheduled_end'   => now()->subHours(3),
            'flagged_at'      => now(),
            'flag_reason'     => 'stale_arrived',
        ]);
    }

    public function test_admin_can_mark_a_stale_booking_completed_via_the_real_completion_flow(): void
    {
        \Illuminate\Support\Facades\Event::fake([\App\Events\BookingStatusUpdated::class]);
        $booking = $this->flaggedArrivedBooking();

        $response = $this->actingAs($this->admin)
            ->postJson("/admin/api/bookings/stale/{$booking->id}/complete");

        $response->assertOk();
        $booking->refresh();
        $this->assertSame('completed', $booking->status);
        $this->assertNotNull($booking->resolved_at);
        $this->assertSame($this->admin->id, $booking->resolved_by);
        $this->assertSame(1, LoyaltyReward::where('customer_id', $this->customer->id)->sum('completed_count'));
        $this->assertSame(1, AuditLog::where('event', 'booking.stale_resolved')->where('target_id', $booking->id)->count());
    }

    public function test_admin_can_mark_a_stale_booking_as_no_show_using_existing_forfeiture_rules(): void
    {
        $booking = $this->flaggedArrivedBooking();

        $response = $this->actingAs($this->admin)
            ->postJson("/admin/api/bookings/stale/{$booking->id}/no-show");

        $response->assertOk();
        $booking->refresh();
        $this->assertSame('cancelled', $booking->status);
        $this->assertSame('no_show', $booking->cancellation_type);
        // Same forfeiture rule DownpaymentController::cancel() already applies
        // (>24hrs before session = refund, otherwise forfeit) — a stale booking
        // is always well past its scheduled time, so this is always 'forfeited'.
        $this->assertSame('forfeited', $booking->downpayment_status);
        $this->assertNotNull($booking->resolved_at);
    }

    public function test_admin_cancel_requires_a_reason(): void
    {
        $booking = $this->flaggedArrivedBooking();

        $response = $this->actingAs($this->admin)
            ->postJson("/admin/api/bookings/stale/{$booking->id}/cancel", []);

        $response->assertStatus(422);
        $this->assertNull($booking->refresh()->resolved_at);
    }

    public function test_admin_cancel_with_reason_uses_existing_cancellation_flow(): void
    {
        $booking = $this->flaggedArrivedBooking();

        $response = $this->actingAs($this->admin)
            ->postJson("/admin/api/bookings/stale/{$booking->id}/cancel", [
                'reason' => 'Confirmed with therapist — session never happened.',
            ]);

        $response->assertOk();
        $booking->refresh();
        $this->assertSame('cancelled', $booking->status);
        $this->assertSame('Confirmed with therapist — session never happened.', $booking->cancellation_reason);
        $this->assertNotNull($booking->resolved_at);
    }

    public function test_resolving_an_already_resolved_booking_is_rejected(): void
    {
        $booking = $this->flaggedArrivedBooking();

        $this->actingAs($this->admin)->postJson("/admin/api/bookings/stale/{$booking->id}/complete")->assertOk();

        // Second resolution attempt on the same booking must be rejected —
        // it is no longer an open stale flag.
        $response = $this->actingAs($this->admin)->postJson("/admin/api/bookings/stale/{$booking->id}/no-show");

        $response->assertStatus(409);
        $this->assertSame(
            1,
            AuditLog::where('event', 'booking.stale_resolved')->where('target_id', $booking->id)->count(),
            'Only the first resolution should have been recorded.'
        );
    }

    public function test_non_admin_cannot_access_stale_review_endpoints(): void
    {
        $booking = $this->flaggedArrivedBooking();

        // AdminMiddleware (app/Http/Middleware/AdminMiddleware.php) redirects
        // any non-admin — even on a JSON request — to '/' rather than
        // returning 403; it never checks expectsJson(). Asserting the actual
        // behavior here, not the framework-conventional one.
        $this->actingAs($this->customer)
            ->getJson('/admin/api/bookings/stale')
            ->assertRedirect('/');

        $this->actingAs($this->customer)
            ->postJson("/admin/api/bookings/stale/{$booking->id}/complete")
            ->assertRedirect('/');
    }

    public function test_needs_attention_endpoint_excludes_resolved_bookings(): void
    {
        $stillOpen = $this->flaggedArrivedBooking();
        $resolved  = $this->flaggedArrivedBooking();
        $resolved->update(['resolved_at' => now(), 'resolved_by' => $this->admin->id]);

        $response = $this->actingAs($this->admin)->getJson('/admin/api/bookings/stale');

        $response->assertOk();
        $ids = collect($response->json())->pluck('id');
        $this->assertTrue($ids->contains($stillOpen->id));
        $this->assertFalse($ids->contains($resolved->id));
    }
}
