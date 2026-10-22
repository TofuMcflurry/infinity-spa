<?php

namespace Tests\Feature;

use App\Events\Audit\BookingAccepted;
use App\Events\Audit\BookingCompleted;
use App\Events\Audit\BookingRejected;
use App\Events\Audit\CustomerBookingCancelled;
use App\Events\Audit\CustomerBookingCreated;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class BookingLifecycleAuditTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;
    private User $therapistUser;
    private Therapist $therapist;
    private ServiceVariant $variant;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->customer = User::factory()->create(['role' => 'customer']);
        $this->therapistUser = User::factory()->create(['role' => 'therapist']);
        $this->therapist = Therapist::create([
            'user_id' => $this->therapistUser->id, 'base_location' => 'Dubai',
            'gender' => 'female', 'is_active' => true,
        ]);
        $service = Service::create([
            'name' => 'Audit Massage', 'duration_minutes' => 60, 'price' => 300, 'is_active' => true,
        ]);
        $this->variant = ServiceVariant::create([
            'service_id' => $service->id, 'duration_minutes' => 60, 'price' => 300, 'is_active' => true,
        ]);
    }

    public static function actions(): array
    {
        return [
            'customer creation' => ['create', 'pending_payment', 'customer.booking_created', CustomerBookingCreated::class],
            'customer cancellation' => ['cancel', 'cancelled', 'customer.booking_cancelled', CustomerBookingCancelled::class],
            'therapist acceptance' => ['accept', 'accepted', 'booking.accepted', BookingAccepted::class],
            'therapist rejection' => ['reject', 'rejected', 'booking.rejected', BookingRejected::class],
            'therapist completion' => ['complete', 'completed', 'booking.completed', BookingCompleted::class],
        ];
    }

    private function booking(string $status = 'pending'): Booking
    {
        return Booking::create([
            'customer_id' => $this->customer->id, 'therapist_id' => $this->therapist->id,
            'service_id' => $this->variant->service_id, 'service_variant_id' => $this->variant->id,
            'location' => 'Private address must not enter audit metadata', 'zone_name' => 'Test Zone',
            'payment_method' => 'cashless', 'status' => $status, 'payment_status' => 'pending',
            'scheduled_start' => now()->addDays(3), 'scheduled_end' => now()->addDays(3)->addHour(),
        ]);
    }

    private function actor(string $action): User
    {
        return in_array($action, ['create', 'cancel']) ? $this->customer : $this->therapistUser;
    }

    private function perform(string $action, ?Booking $booking = null, array $overrides = [])
    {
        if ($action === 'create') {
            return $this->postJson('/api/bookings', array_merge([
                'service_id' => $this->variant->id, 'therapist_id' => $this->therapist->id,
                'location' => 'Private address must not enter audit metadata', 'zone_name' => 'Test Zone',
                'datetime' => now()->modify('next Monday')->setTime(20, 0)->toDateTimeString(),
                'payment_type' => 'full', 'payment_method' => 'cashless',
            ], $overrides));
        }
        if ($action === 'cancel') {
            return $this->postJson('/api/downpayment/cancel', array_merge([
                'booking_id' => $booking->id, 'cancellation_reason' => 'Sensitive free text OTP 123456',
            ], $overrides));
        }
        return $this->postJson('/therapist/api/bookings/'.$booking->id.'/'.$action,
            array_merge(['reason' => 'Sensitive free text OTP 123456'], $overrides));
    }

    #[DataProvider('actions')]
    public function test_success_persists_one_safe_audit_with_real_listener_and_retries_do_not_duplicate(
        string $action, string $status, string $event, string $eventClass
    ): void {
        $booking = $action === 'create' ? null : $this->booking($action === 'complete' ? 'arrived' : 'pending');
        $actor = $this->actor($action);
        $this->actingAs($actor);
        $response = $this->perform($action, $booking)->assertStatus($action === 'create' ? 201 : 200);
        $id = $booking?->id ?? $response->json('booking.id');
        $this->assertSame($status, Booking::findOrFail($id)->status);
        $row = AuditLog::where('event', $event)->sole();
        $this->assertSame($actor->id, $row->user_id);
        $this->assertSame($actor->role, $row->user_role);
        $this->assertSame($actor->name, $row->user_name);
        $this->assertSame('Booking', $row->target_type);
        $this->assertSame($id, $row->target_id);
        $expected = match ($action) {
            'create' => ['service' => 'Audit Massage', 'duration_minutes' => 60],
            'cancel' => ['reason' => null],
            'reject' => ['customer' => $this->customer->name, 'reason' => null],
            default => ['customer' => $this->customer->name],
        };
        $this->assertSame($expected, $row->metadata);
        $this->perform($action, $booking)->assertStatus($action === 'create' ? 409 : 422);
        $this->assertSame(1, AuditLog::where('event', $event)->where('target_id', $id)->count());
    }

    #[DataProvider('actions')]
    public function test_business_rejection_creates_no_success_audit(string $action, string $status, string $event): void
    {
        $booking = $action === 'create' ? null : $this->booking('completed');
        if ($action === 'create') $this->variant->update(['is_active' => false]);
        $this->actingAs($this->actor($action));
        $this->perform($action, $booking)->assertStatus($action === 'create' ? 409 : 422);
        $this->assertSame(0, AuditLog::where('event', $event)->count());
    }

    #[DataProvider('actions')]
    public function test_unauthorized_request_creates_no_success_audit(string $action, string $status, string $event): void
    {
        $booking = $action === 'create' ? null : $this->booking($action === 'complete' ? 'arrived' : 'pending');
        if ($action === 'create') {
            $this->perform($action)->assertUnauthorized();
        } else {
            $other = User::factory()->create(['role' => $this->actor($action)->role]);
            if ($other->role === 'therapist') Therapist::create([
                'user_id' => $other->id, 'base_location' => 'Dubai', 'gender' => 'female', 'is_active' => true,
            ]);
            $this->actingAs($other);
            $this->perform($action, $booking)->assertStatus($action === 'cancel' ? 404 : 403);
        }
        $this->assertSame(0, AuditLog::where('event', $event)->count());
    }

    #[DataProvider('actions')]
    public function test_transaction_failure_rolls_back_both_business_change_and_real_audit_row(
        string $action, string $status, string $event, string $eventClass
    ): void {
        $original = $action === 'complete' ? 'arrived' : 'pending';
        $booking = $action === 'create' ? null : $this->booking($original);
        $this->actingAs($this->actor($action));
        // Registered after the real listener: failure occurs after the audit INSERT.
        Event::listen($eventClass, function () use ($event) {
            $this->assertSame(1, AuditLog::where('event', $event)->count());
            throw new \RuntimeException('Force transaction rollback after audit insertion');
        });
        $this->withoutExceptionHandling();
        try {
            $this->perform($action, $booking);
            $this->fail('Expected transaction failure');
        } catch (\RuntimeException $e) {
            $this->assertSame('Force transaction rollback after audit insertion', $e->getMessage());
        }
        $this->assertSame(0, AuditLog::where('event', $event)->count());
        if ($booking) $this->assertSame($original, $booking->fresh()->status);
        else $this->assertSame(0, Booking::count());
    }

    public function test_invalid_creation_cancellation_and_rejection_payloads_do_not_create_success_audits(): void
    {
        $this->actingAs($this->customer)->postJson('/api/bookings', [])->assertUnprocessable();
        $booking = $this->booking();
        $this->perform('cancel', $booking, ['cancellation_reason' => []])->assertUnprocessable();
        $this->actingAs($this->therapistUser);
        $this->perform('reject', $booking, ['reason' => []])->assertUnprocessable();
        $this->assertSame(0, AuditLog::count());
    }
}
