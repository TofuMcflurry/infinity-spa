<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\RescheduleProposal;
use App\Models\RescheduleRequest;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\TherapistZone;
use App\Models\User;
use App\Notifications\BookingNotification;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Notification as NotificationFacade;
use Tests\TestCase;

/**
 * NOTE: this suite requires a Postgres-backed test database — see the same
 * note in tests/Feature/StaleActiveSessionTest.php. Run with DB_CONNECTION=
 * pgsql pointed at a disposable test database, not sqlite (phpunit.xml's
 * default) and never the real dev database.
 *
 * Covers the Reschedule Proposal backend (admin -> customer) end to end:
 * RescheduleProposalService, the admin propose endpoint, the three
 * customer response endpoints, the direct-reschedule bypass guard, and
 * the bookings:expire-reschedule-proposals command.
 *
 * Same fixed calendar as AdminBookingRescheduleTest /
 * AdminRescheduleRequestReviewTest: therapist works 16:00 -> 04:00 (next
 * day), is off on Tuesdays, travel to "Test Zone" is 30 minutes, the
 * booked service is 60 minutes.
 */
class RescheduleProposalTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $customer;
    private User $otherCustomer;
    private User $therapistUser;
    private Therapist $therapist;
    private Service $service;
    private ServiceVariant $variant;

    private const ORIGINAL_START = '2026-12-07 20:00:00'; // Monday

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin         = User::factory()->create(['role' => 'admin']);
        $this->customer      = User::factory()->create(['role' => 'customer']);
        $this->otherCustomer = User::factory()->create(['role' => 'customer']);

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

    private function propose(Booking $booking, string $proposedStart, ?string $adminReason = null, ?User $as = null): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($as ?? $this->admin)->postJson(
            "/admin/api/bookings/{$booking->id}/reschedule-proposal",
            array_filter([
                'proposed_start_at' => $proposedStart,
                'admin_reason'      => $adminReason,
            ], fn ($v) => $v !== null)
        );
    }

    private function accept(RescheduleProposal $p, ?User $as = null): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($as ?? $this->customer)->postJson("/api/reschedule-proposals/{$p->id}/accept");
    }

    private function counter(RescheduleProposal $p, string $requestedStart, ?string $reason = null, ?User $as = null): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($as ?? $this->customer)->postJson(
            "/api/reschedule-proposals/{$p->id}/counter",
            array_filter(['requested_start_at' => $requestedStart, 'reason' => $reason], fn ($v) => $v !== null)
        );
    }

    private function cancel(RescheduleProposal $p, string $reason = 'No longer needed', ?User $as = null): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($as ?? $this->customer)->postJson("/api/reschedule-proposals/{$p->id}/cancel", ['reason' => $reason]);
    }

    // ── 1, 2: creation never mutates the booking ─────────────────────────────

    public function test_admin_can_create_a_proposal(): void
    {
        $booking = $this->makeBooking();

        $response = $this->propose($booking, '2026-12-09 20:00:00', 'Offering an earlier slot');
        $response->assertCreated();
        $response->assertJsonPath('proposal.status', 'pending');
        $response->assertJsonPath('proposal.booking_id', $booking->id);

        $this->assertDatabaseHas('reschedule_proposals', [
            'booking_id' => $booking->id,
            'status'     => 'pending',
        ]);
    }

    public function test_pending_proposal_does_not_mutate_the_booking(): void
    {
        $booking = $this->makeBooking();

        $this->propose($booking, '2026-12-09 20:00:00')->assertCreated();

        $booking->refresh();
        $this->assertSame(self::ORIGINAL_START, $booking->scheduled_start->toDateTimeString());
        $this->assertSame('accepted', $booking->status);
    }

    public function test_non_admin_cannot_create_a_proposal(): void
    {
        $booking = $this->makeBooking();

        $this->actingAs($this->customer)
            ->postJson("/admin/api/bookings/{$booking->id}/reschedule-proposal", ['proposed_start_at' => '2026-12-09 20:00:00'])
            ->assertRedirect('/');
    }

    public function test_creation_rejects_an_ineligible_booking_state(): void
    {
        $booking = $this->makeBooking(['status' => 'completed']);

        $this->propose($booking, '2026-12-09 20:00:00')->assertStatus(422);
    }

    public function test_creation_rejects_a_candidate_time_that_fails_scheduling_rules(): void
    {
        $booking = $this->makeBooking();

        // Tuesday 2026-12-08 is the therapist's day off — validateCandidate()
        // must reject it exactly like a direct reschedule would.
        $response = $this->propose($booking, '2026-12-08 20:00:00');
        $response->assertStatus(422);
        $response->assertJsonPath('message', 'Therapist is off on Tuesdays.');

        $this->assertDatabaseMissing('reschedule_proposals', ['booking_id' => $booking->id]);
    }

    // ── 8: duplicate active proposal blocked ─────────────────────────────────

    public function test_duplicate_active_proposal_is_blocked(): void
    {
        $booking = $this->makeBooking();

        $this->propose($booking, '2026-12-09 20:00:00')->assertCreated();

        $second = $this->propose($booking, '2026-12-10 20:00:00');
        $second->assertStatus(409);

        $this->assertSame(1, RescheduleProposal::where('booking_id', $booking->id)->count());
    }

    // ── Cross-flow guard: a pending customer request blocks a new proposal ──

    public function test_proposal_creation_is_blocked_while_a_reschedule_request_is_pending(): void
    {
        $booking = $this->makeBooking();

        \App\Services\RescheduleRequestService::create(
            $booking,
            $this->customer,
            \App\Services\RescheduleRequestService::ROLE_CUSTOMER,
            Carbon::parse('2026-12-09 18:00:00')
        );

        $response = $this->propose($booking, '2026-12-09 20:00:00');
        $response->assertStatus(409);

        $this->assertDatabaseMissing('reschedule_proposals', ['booking_id' => $booking->id]);
    }

    // ── notification on creation ──────────────────────────────────────────────

    public function test_creating_a_proposal_notifies_the_customer(): void
    {
        NotificationFacade::fake();
        $booking = $this->makeBooking();

        $this->propose($booking, '2026-12-09 20:00:00')->assertCreated();

        NotificationFacade::assertSentTo(
            $this->customer,
            BookingNotification::class,
            fn ($n) => $n->type === 'reschedule_proposed' && $n->candidateScheduledStart?->toDateTimeString() === '2026-12-09 20:00:00'
        );
    }

    // ── 3, 4: accept mutates the booking ──────────────────────────────────────

    public function test_customer_can_accept_and_the_booking_is_rescheduled(): void
    {
        $booking  = $this->makeBooking();
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 20:00:00'));

        $response = $this->accept($proposal);
        $response->assertOk();
        $response->assertJsonPath('proposal.status', 'accepted');

        $booking->refresh();
        $this->assertSame('2026-12-09 20:00:00', $booking->scheduled_start->toDateTimeString());

        $proposal->refresh();
        $this->assertSame('accepted', $proposal->status);
        $this->assertNotNull($proposal->responded_at);
    }

    public function test_accept_sends_the_existing_rescheduled_notification_to_customer_and_therapist(): void
    {
        NotificationFacade::fake();
        $booking  = $this->makeBooking();
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 20:00:00'));

        $this->accept($proposal)->assertOk();

        NotificationFacade::assertSentTo($this->customer, BookingNotification::class, fn ($n) => $n->type === 'rescheduled');
        NotificationFacade::assertSentTo($this->therapistUser, BookingNotification::class, fn ($n) => $n->type === 'rescheduled');
    }

    public function test_accept_dispatches_the_final_booking_rescheduled_audit_event(): void
    {
        $booking  = $this->makeBooking();
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 20:00:00'));

        $this->accept($proposal)->assertOk();

        $log = AuditLog::where('event', 'booking.rescheduled')->where('target_id', $booking->id)->first();
        $this->assertNotNull($log);
        $this->assertSame('2026-12-09 20:00:00', $log->metadata['new_scheduled_start']);

        $responded = AuditLog::where('event', 'reschedule_proposal.responded')->where('target_id', $booking->id)->first();
        $this->assertNotNull($responded);
        $this->assertSame('accepted', $responded->metadata['response']);
    }

    public function test_accept_rejects_a_candidate_time_that_no_longer_validates(): void
    {
        $booking  = $this->makeBooking();
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 20:00:00'));

        // Something else now occupies the proposed slot.
        $this->makeBooking(['scheduled_start' => '2026-12-09 20:00:00']);

        $response = $this->accept($proposal);
        $response->assertStatus(422);

        $booking->refresh();
        $this->assertSame(self::ORIGINAL_START, $booking->scheduled_start->toDateTimeString());
    }

    // ── 10: ownership ──────────────────────────────────────────────────────────

    public function test_customer_cannot_accept_another_customers_proposal(): void
    {
        $booking  = $this->makeBooking();
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 20:00:00'));

        $this->accept($proposal, $this->otherCustomer)->assertStatus(403);

        $booking->refresh();
        $this->assertSame(self::ORIGINAL_START, $booking->scheduled_start->toDateTimeString());
    }

    // ── 5, 11: counter creates and links a RescheduleRequest ─────────────────

    public function test_customer_can_counter_and_it_creates_a_linked_reschedule_request(): void
    {
        $booking  = $this->makeBooking();
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 18:00:00'));

        $response = $this->counter($proposal, '2026-12-09 19:00:00', 'Later works better for me');
        $response->assertCreated();
        $response->assertJsonPath('request.status', 'pending');

        $proposal->refresh();
        $this->assertSame('countered', $proposal->status);
        $this->assertSame('Later works better for me', $proposal->customer_response_note);
        $this->assertNotNull($proposal->countered_into_request_id);

        $request = RescheduleRequest::find($proposal->countered_into_request_id);
        $this->assertNotNull($request);
        $this->assertSame($booking->id, $request->booking_id);
        $this->assertSame('2026-12-09 19:00:00', $request->requested_start_at->toDateTimeString());
        $this->assertSame('customer', $request->requested_by_role);

        // The booking must still be completely untouched.
        $booking->refresh();
        $this->assertSame(self::ORIGINAL_START, $booking->scheduled_start->toDateTimeString());
    }

    public function test_counter_notifies_admins(): void
    {
        NotificationFacade::fake();
        $booking  = $this->makeBooking();
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 18:00:00'));

        $this->counter($proposal, '2026-12-09 19:00:00')->assertCreated();

        NotificationFacade::assertSentTo($this->admin, BookingNotification::class, fn ($n) => $n->type === 'reschedule_countered');
    }

    // ── 12: the resulting request can later be approved normally ─────────────

    public function test_the_countered_request_can_later_be_approved_through_the_existing_flow(): void
    {
        $booking  = $this->makeBooking();
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 18:00:00'));

        $this->counter($proposal, '2026-12-09 19:00:00')->assertCreated();
        $proposal->refresh();
        $request = RescheduleRequest::find($proposal->countered_into_request_id);

        $response = $this->actingAs($this->admin)->postJson(
            "/admin/api/bookings/reschedule-requests/{$request->id}/approve",
            ['final_scheduled_start' => '2026-12-09 19:00:00']
        );
        $response->assertOk();

        $booking->refresh();
        $this->assertSame('2026-12-09 19:00:00', $booking->scheduled_start->toDateTimeString());

        // The original proposal's own proposed time is untouched history.
        $proposal->refresh();
        $this->assertSame('2026-12-09 18:00:00', $proposal->proposed_start_at->toDateTimeString());
        $this->assertSame('countered', $proposal->status);
    }

    // ── 6, 13: cancel reuses the existing refund/forfeit decision tree ───────

    public function test_customer_can_cancel_and_it_uses_the_existing_cancellation_logic(): void
    {
        // Scheduled far enough out that the existing >24h rule refunds.
        // Fixed, in-shift time (not now()->addDays(), which drifts outside
        // the 16:00-04:00 shift depending on what time of day the suite runs).
        $booking  = $this->makeBooking(['scheduled_start' => '2026-12-16 20:00:00', 'downpayment_status' => 'verified']);
        $booking->update(Booking::computeTimeBlocks($booking->scheduled_start->toDateTimeString(), 60, 30));
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-17 20:00:00'));

        $response = $this->cancel($proposal, 'Can no longer make it');
        $response->assertOk();
        $response->assertJsonPath('cancellation_type', 'refunded');

        $booking->refresh();
        $this->assertSame('cancelled', $booking->status);
        $this->assertSame('refunded', $booking->downpayment_status);

        $proposal->refresh();
        $this->assertSame('cancelled', $proposal->status);
    }

    public function test_cancel_sends_the_existing_customer_cancelled_notification(): void
    {
        NotificationFacade::fake();
        $booking  = $this->makeBooking();
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 20:00:00'));

        $this->cancel($proposal)->assertOk();

        NotificationFacade::assertSentTo($this->customer, BookingNotification::class, fn ($n) => $n->type === 'customer_cancelled');
    }

    // ── 9: direct admin reschedule must not bypass a pending proposal ────────

    public function test_direct_admin_reschedule_is_blocked_while_a_proposal_is_pending(): void
    {
        $booking = $this->makeBooking();
        \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 20:00:00'));

        $response = $this->actingAs($this->admin)->postJson(
            "/admin/api/bookings/{$booking->id}/reschedule",
            ['scheduled_start' => '2026-12-10 20:00:00']
        );
        $response->assertStatus(409);
        $response->assertJsonPath('message', 'Booking is awaiting customer response to a reschedule proposal.');

        $booking->refresh();
        $this->assertSame(self::ORIGINAL_START, $booking->scheduled_start->toDateTimeString());
    }

    public function test_direct_admin_reschedule_still_works_once_the_proposal_is_resolved(): void
    {
        $booking  = $this->makeBooking();
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 20:00:00'));
        $this->cancel($proposal)->assertOk();

        // Booking is now cancelled, so use a fresh reschedulable booking to
        // confirm the guard itself — rather than the booking's own
        // terminal state — is what's gone.
        $booking2 = $this->makeBooking(['scheduled_start' => '2026-12-14 20:00:00']);
        $proposal2 = \App\Services\RescheduleProposalService::create($booking2, $this->admin, Carbon::parse('2026-12-16 20:00:00'));
        $this->accept($proposal2)->assertOk();

        $booking3 = $this->makeBooking(['scheduled_start' => '2026-12-21 20:00:00']);
        $this->actingAs($this->admin)->postJson(
            "/admin/api/bookings/{$booking3->id}/reschedule",
            ['scheduled_start' => '2026-12-23 20:00:00']
        )->assertOk();
    }

    // ── 7: expired proposal cannot be acted on ───────────────────────────────

    private function makeExpiredProposal(Booking $booking, string $proposedStart): RescheduleProposal
    {
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse($proposedStart));
        $proposal->update(['expires_at' => now()->subMinute()]);

        return $proposal->fresh();
    }

    public function test_expired_proposal_cannot_be_accepted(): void
    {
        $booking  = $this->makeBooking();
        $proposal = $this->makeExpiredProposal($booking, '2026-12-09 20:00:00');

        $this->accept($proposal)->assertStatus(409);

        $booking->refresh();
        $this->assertSame(self::ORIGINAL_START, $booking->scheduled_start->toDateTimeString());
    }

    public function test_expired_proposal_cannot_be_countered(): void
    {
        $booking  = $this->makeBooking();
        $proposal = $this->makeExpiredProposal($booking, '2026-12-09 20:00:00');

        $this->counter($proposal, '2026-12-10 20:00:00')->assertStatus(409);

        $this->assertDatabaseMissing('reschedule_requests', ['booking_id' => $booking->id]);
    }

    public function test_expired_proposal_cannot_be_cancelled(): void
    {
        $booking  = $this->makeBooking();
        $proposal = $this->makeExpiredProposal($booking, '2026-12-09 20:00:00');

        $this->cancel($proposal)->assertStatus(409);

        $booking->refresh();
        $this->assertSame('accepted', $booking->status);
    }

    // ── 17: concurrency — only one terminal response can win ─────────────────

    public function test_sequential_accept_attempts_only_the_first_succeeds(): void
    {
        $booking  = $this->makeBooking();
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 20:00:00'));

        $this->accept($proposal)->assertOk();
        $this->accept($proposal)->assertStatus(409);
    }

    public function test_accept_and_cancel_racing_only_one_resolves(): void
    {
        $booking  = $this->makeBooking();
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 20:00:00'));

        $this->accept($proposal)->assertOk();
        $this->cancel($proposal)->assertStatus(409);

        $booking->refresh();
        $this->assertSame('accepted', $booking->status);
        $this->assertSame('2026-12-09 20:00:00', $booking->scheduled_start->toDateTimeString());
    }

    // ── 14: expiration command reuses the cancellation/refund logic ─────────

    public function test_expiration_command_cancels_the_booking_using_existing_cancellation_logic(): void
    {
        $booking  = $this->makeBooking(['downpayment_status' => 'verified']);
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 20:00:00'));
        $proposal->update(['expires_at' => now()->subMinute()]);

        Artisan::call('bookings:expire-reschedule-proposals');

        $proposal->refresh();
        $this->assertSame('expired', $proposal->status);
        $this->assertNotNull($proposal->responded_at);

        $booking->refresh();
        $this->assertSame('cancelled', $booking->status);
        $this->assertSame('expired', $booking->cancellation_type);
    }

    public function test_expiration_command_dispatches_audit_and_notifies_customer(): void
    {
        NotificationFacade::fake();
        $booking  = $this->makeBooking();
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 20:00:00'));
        $proposal->update(['expires_at' => now()->subMinute()]);

        Artisan::call('bookings:expire-reschedule-proposals');

        $log = AuditLog::where('event', 'reschedule_proposal.expired')->where('target_id', $booking->id)->first();
        $this->assertNotNull($log);
        $this->assertSame('expired', $log->metadata['cancellation_type']);

        NotificationFacade::assertSentTo($this->customer, BookingNotification::class, fn ($n) => $n->type === 'reschedule_proposal_expired');
    }

    public function test_expiration_command_does_not_affect_a_proposal_not_yet_due(): void
    {
        $booking  = $this->makeBooking();
        \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 20:00:00'));

        Artisan::call('bookings:expire-reschedule-proposals');

        $booking->refresh();
        $this->assertSame('accepted', $booking->status);
        $this->assertDatabaseHas('reschedule_proposals', ['booking_id' => $booking->id, 'status' => 'pending']);
    }

    public function test_expiration_command_skips_a_proposal_already_resolved_by_the_customer(): void
    {
        $booking  = $this->makeBooking();
        $proposal = \App\Services\RescheduleProposalService::create($booking, $this->admin, Carbon::parse('2026-12-09 20:00:00'));
        $this->accept($proposal)->assertOk();

        // Force expires_at into the past on the now-accepted row — the
        // claim query's status='pending' guard must still skip it.
        $proposal->update(['expires_at' => now()->subMinute()]);

        Artisan::call('bookings:expire-reschedule-proposals');

        $proposal->refresh();
        $this->assertSame('accepted', $proposal->status);

        $booking->refresh();
        $this->assertSame('2026-12-09 20:00:00', $booking->scheduled_start->toDateTimeString());
    }
}
