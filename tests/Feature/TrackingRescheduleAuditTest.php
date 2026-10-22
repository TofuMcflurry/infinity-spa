<?php

namespace Tests\Feature;

use App\Events\Audit\BookingArrived;
use App\Events\Audit\BookingEnRoute;
use App\Events\Audit\RescheduleRequestRejected;
use App\Events\Audit\RescheduleRequestSubmitted;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\RescheduleRequest;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class TrackingRescheduleAuditTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;
    private User $therapistUser;
    private User $admin;
    private Booking $booking;
    private RescheduleRequest $reschedule;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->customer = User::factory()->create(['role' => 'customer']);
        $this->therapistUser = User::factory()->create(['role' => 'therapist']);
        $this->admin = User::factory()->create(['role' => 'admin']);
        $therapist = Therapist::create([
            'user_id' => $this->therapistUser->id, 'base_location' => 'Dubai',
            'gender' => 'female', 'is_active' => true,
        ]);
        $service = Service::create([
            'name' => 'Audit Massage', 'duration_minutes' => 60, 'price' => 300, 'is_active' => true,
        ]);
        $variant = ServiceVariant::create([
            'service_id' => $service->id, 'duration_minutes' => 60, 'price' => 300,
        ]);
        $start = Carbon::parse('next Monday')->setTime(20, 0);
        $this->booking = Booking::create(array_merge([
            'customer_id' => $this->customer->id, 'therapist_id' => $therapist->id,
            'service_id' => $service->id, 'service_variant_id' => $variant->id,
            'location' => 'Private address', 'zone_name' => 'Test Zone',
            'payment_method' => 'cashless', 'status' => 'accepted',
        ], Booking::computeTimeBlocks($start->toDateTimeString(), 60, 30), ['scheduled_start' => $start]));
    }

    public static function actions(): array
    {
        return [
            'en route' => ['start', 'booking.en_route', BookingEnRoute::class],
            'arrived' => ['arrived', 'booking.arrived', BookingArrived::class],
            'customer request' => ['customer', 'reschedule_request.submitted', RescheduleRequestSubmitted::class],
            'therapist request' => ['therapist', 'reschedule_request.submitted', RescheduleRequestSubmitted::class],
            'admin rejection' => ['reject', 'reschedule_request.rejected', RescheduleRequestRejected::class],
        ];
    }

    private function prepare(string $action): User
    {
        if ($action === 'arrived') $this->booking->update(['status' => 'en_route']);
        if ($action === 'reject') {
            $this->reschedule = RescheduleRequest::create([
                'booking_id' => $this->booking->id, 'requested_by_user_id' => $this->customer->id,
                'requested_by_role' => 'customer', 'requested_start_at' => $this->candidate(), 'status' => 'pending',
            ]);
        }
        return match ($action) {
            'customer' => $this->customer,
            'reject' => $this->admin,
            default => $this->therapistUser,
        };
    }

    private function candidate(): Carbon
    {
        return $this->booking->scheduled_start->copy()->addWeeks(2);
    }

    private function perform(string $action, array $overrides = [])
    {
        $id = $this->booking->id;
        return match ($action) {
            'start', 'arrived' => $this->postJson("/therapist/api/bookings/$id/$action"),
            'customer' => $this->postJson("/api/bookings/$id/reschedule-request", array_merge([
                'requested_start_at' => $this->candidate()->toDateTimeString(), 'reason' => 'Private reason OTP 123456',
            ], $overrides)),
            'therapist' => $this->postJson('/therapist/api/reschedule-request', array_merge([
                'booking_id' => $id, 'requested_date' => $this->candidate()->toDateString(),
                'requested_time' => '20:00', 'reason' => 'Private reason OTP 123456',
            ], $overrides)),
            'reject' => $this->postJson('/admin/api/bookings/reschedule-requests/'.$this->reschedule->id.'/reject',
                array_merge(['admin_notes' => 'Private rejection reason'], $overrides)),
        };
    }

    #[DataProvider('actions')]
    public function test_success_has_correct_actor_target_safe_metadata_and_no_retry_duplicate(string $action, string $event): void
    {
        $actor = $this->prepare($action);
        $this->actingAs($actor);
        $this->perform($action)->assertStatus(in_array($action, ['customer', 'therapist']) ? 201 : 200);
        $row = AuditLog::where('event', $event)->sole();
        $this->assertSame($actor->id, $row->user_id);
        $this->assertSame($actor->name, $row->user_name);
        $this->assertSame($actor->role, $row->user_role);
        $this->assertSame('Booking', $row->target_type);
        $this->assertSame($this->booking->id, $row->target_id);
        $expected = match ($action) {
            'start' => ['previous_status' => 'accepted', 'new_status' => 'en_route'],
            'arrived' => ['previous_status' => 'en_route', 'new_status' => 'arrived'],
            default => ['request_id' => RescheduleRequest::sole()->id, 'booking_id' => $this->booking->id],
        };
        $this->assertSame($expected, $row->metadata);
        $this->perform($action)->assertStatus(in_array($action, ['start', 'arrived']) ? 422 : 409);
        $this->assertSame(1, AuditLog::where('event', $event)->count());
        $this->assertSame(0, AuditLog::whereIn('event', ['booking.rescheduled', 'reschedule_proposal.responded', 'reschedule_proposal.created'])->count());
    }

    #[DataProvider('actions')]
    public function test_invalid_business_state_does_not_audit(string $action, string $event): void
    {
        $actor = $this->prepare($action);
        if ($action === 'reject') $this->reschedule->update(['status' => 'approved']);
        else $this->booking->update(['status' => 'completed']);
        $this->actingAs($actor);
        $this->perform($action)->assertStatus($action === 'reject' ? 409 : 422);
        $this->assertSame(0, AuditLog::where('event', $event)->count());
    }

    #[DataProvider('actions')]
    public function test_failed_authorization_does_not_audit(string $action, string $event): void
    {
        $actor = $this->prepare($action);
        $other = User::factory()->create(['role' => $action === 'reject' ? 'customer' : $actor->role]);
        if ($other->role === 'therapist') Therapist::create([
            'user_id' => $other->id, 'base_location' => 'Dubai', 'gender' => 'female', 'is_active' => true,
        ]);
        $this->actingAs($other);
        $response = $this->perform($action);
        if ($action === 'reject') $response->assertRedirect('/');
        else $response->assertForbidden();
        $this->assertSame(0, AuditLog::where('event', $event)->count());
    }

    #[DataProvider('actions')]
    public function test_failure_after_real_audit_insert_rolls_back_business_and_audit(string $action, string $event, string $eventClass): void
    {
        $this->actingAs($this->prepare($action));
        $original = $this->booking->fresh()->status;
        Event::listen($eventClass, function () use ($event) {
            $this->assertSame(1, AuditLog::where('event', $event)->count());
            throw new \RuntimeException('Audit transaction rollback probe');
        });
        $this->withoutExceptionHandling();
        try {
            $this->perform($action);
            $this->fail('Expected rollback probe');
        } catch (\RuntimeException $e) {
            $this->assertSame('Audit transaction rollback probe', $e->getMessage());
        }
        $this->assertSame(0, AuditLog::where('event', $event)->count());
        $this->assertSame($original, $this->booking->fresh()->status);
        if ($action === 'reject') $this->assertSame('pending', $this->reschedule->fresh()->status);
        elseif (in_array($action, ['customer', 'therapist'])) $this->assertSame(0, RescheduleRequest::count());
    }

    public function test_invalid_payloads_do_not_create_request_success_audits(): void
    {
        $this->actingAs($this->customer);
        $this->perform('customer', ['requested_start_at' => 'bad'])->assertUnprocessable();
        $this->actingAs($this->therapistUser);
        $this->perform('therapist', ['requested_time' => 'bad'])->assertUnprocessable();
        $this->actingAs($this->prepare('reject'));
        $this->perform('reject', ['admin_notes' => []])->assertUnprocessable();
        $this->assertSame(0, AuditLog::count());
    }

    private function propose(): int
    {
        return $this->actingAs($this->admin)->postJson('/admin/api/bookings/'.$this->booking->id.'/reschedule-proposal', [
            'proposed_start_at' => $this->booking->scheduled_start->copy()->addWeek()->toDateTimeString(),
        ])->assertCreated()->json('proposal.id');
    }

    public function test_counter_submission_and_later_approval_do_not_duplicate_existing_events(): void
    {
        $proposalId = $this->propose();
        $this->actingAs($this->customer)->postJson("/api/reschedule-proposals/$proposalId/counter", [
            'requested_start_at' => $this->candidate()->toDateTimeString(),
        ])->assertCreated();
        $request = RescheduleRequest::sole();
        $row = AuditLog::where('event', 'reschedule_request.submitted')->sole();
        $this->assertSame($this->customer->id, $row->user_id);
        $this->assertSame($request->id, $row->metadata['request_id']);
        $this->actingAs($this->customer)->postJson("/api/reschedule-proposals/$proposalId/counter", [
            'requested_start_at' => $this->candidate()->toDateTimeString(),
        ])->assertConflict();
        $this->actingAs($this->admin)->postJson('/admin/api/bookings/reschedule-requests/'.$request->id.'/approve', [
            'final_scheduled_start' => $this->candidate()->toDateTimeString(),
        ])->assertOk();
        foreach (['reschedule_request.submitted', 'reschedule_proposal.created', 'reschedule_proposal.responded', 'booking.rescheduled'] as $event) {
            $this->assertSame(1, AuditLog::where('event', $event)->count());
        }
        $this->assertSame(0, AuditLog::where('event', 'reschedule_request.rejected')->count());
    }

    public function test_proposal_acceptance_keeps_existing_audits_without_request_events(): void
    {
        $proposalId = $this->propose();
        $this->actingAs($this->customer)->postJson("/api/reschedule-proposals/$proposalId/accept")->assertOk();
        foreach (['reschedule_proposal.created', 'reschedule_proposal.responded', 'booking.rescheduled'] as $event) {
            $this->assertSame(1, AuditLog::where('event', $event)->count());
        }
        $this->assertSame(0, AuditLog::where('event', 'like', 'reschedule_request.%')->count());
    }

    public function test_outer_counter_rollback_removes_submission_and_restores_pending_proposal(): void
    {
        $proposalId = $this->propose();
        Event::listen(\App\Events\Audit\RescheduleProposalResponded::class, function () {
            $this->assertSame(1, AuditLog::where('event', 'reschedule_request.submitted')->count());
            throw new \RuntimeException('Counter rollback probe');
        });
        $this->actingAs($this->customer)->withoutExceptionHandling();
        try {
            $this->postJson("/api/reschedule-proposals/$proposalId/counter", ['requested_start_at' => $this->candidate()->toDateTimeString()]);
            $this->fail('Expected counter rollback');
        } catch (\RuntimeException $e) {
            $this->assertSame('Counter rollback probe', $e->getMessage());
        }
        $this->assertSame(0, RescheduleRequest::count());
        $this->assertSame(0, AuditLog::whereIn('event', ['reschedule_request.submitted', 'reschedule_proposal.responded'])->count());
        $this->assertSame('pending', \App\Models\RescheduleProposal::findOrFail($proposalId)->status);
    }
}
