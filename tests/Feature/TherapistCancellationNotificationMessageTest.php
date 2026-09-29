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
 * Covers the fix for the 'cancelled' notification type (sent by
 * TherapistBookingController::cancel(), distinct from the customer's own
 * 'customer_cancelled') that was previously missing from
 * BookingNotification's $messages/$subjects maps and silently fell back to
 * the generic "Booking Update" text on both channels.
 */
class TherapistCancellationNotificationMessageTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;
    private User $therapistUser;
    private Therapist $therapist;
    private Service $service;
    private ServiceVariant $variant;
    private Booking $booking;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customer = User::factory()->create(['role' => 'customer']);

        $this->therapistUser = User::factory()->create(['role' => 'therapist']);
        $this->therapist = Therapist::create([
            'user_id'       => $this->therapistUser->id,
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

        $this->variant = ServiceVariant::create([
            'service_id'       => $this->service->id,
            'duration_minutes' => 60,
            'price'            => 300,
        ]);

        $this->booking = Booking::create([
            'customer_id'        => $this->customer->id,
            'therapist_id'       => $this->therapist->id,
            'service_id'         => $this->service->id,
            'service_variant_id' => $this->variant->id,
            'location'           => 'Test location',
            'zone_name'          => 'Test Zone',
            'payment_method'     => 'cashless',
            'payment_type'       => 'full',
            'status'             => 'accepted',
            'payment_status'     => 'paid',
            'downpayment_status' => 'pending',
            'scheduled_start'    => now()->addDays(3),
            'scheduled_end'      => now()->addDays(3)->addHour(),
        ])->load('customer', 'service', 'serviceVariant', 'therapist.user');
    }

    // ── 1: therapist-cancelled booking gets the explicit title/message ───────

    public function test_therapist_cancellation_type_produces_explicit_title_and_message(): void
    {
        $notification = new BookingNotification($this->booking, 'cancelled');
        $data = $notification->toDatabase($this->customer);

        $this->assertSame('Booking Cancelled', $data['title']);
        $this->assertStringContainsString('Swedish Massage', $data['message']);
        $this->assertStringContainsString('has been cancelled', $data['message']);
        $this->assertStringNotContainsString('Booking Update', $data['title']);
        $this->assertSame('cancelled', $data['type']);
        $this->assertSame($this->booking->id, $data['booking_id']);
    }

    public function test_therapist_cancellation_via_the_real_http_flow_stores_the_explicit_message(): void
    {
        $this->actingAs($this->therapistUser)
            ->postJson("/therapist/api/bookings/{$this->booking->id}/cancel", [
                'reason' => 'Unavailable',
            ])
            ->assertOk();

        $response = $this->actingAs($this->customer)->getJson('/api/notifications');
        $response->assertOk();

        $payload = $response->json('notifications');
        $this->assertCount(1, $payload);
        $this->assertSame('cancelled', $payload[0]['type']);
        $this->assertSame('Booking Cancelled', $payload[0]['title']);
        $this->assertStringContainsString('Swedish Massage', $payload[0]['message']);
    }

    // ── 2: email subject/body use the explicit wording ────────────────────────

    public function test_therapist_cancellation_email_uses_the_explicit_subject_and_body(): void
    {
        $notification = new BookingNotification($this->booking, 'cancelled');
        $mail = $notification->toMail($this->customer);

        $this->assertSame('Your Infinity Home Spa booking has been cancelled', $mail->subject);

        $rendered = collect($mail->introLines)->implode(' ');
        $this->assertStringContainsString('cancelled', $rendered);
        $this->assertStringContainsString('by your therapist', $rendered);
    }

    public function test_cancelled_type_still_sends_via_database_and_mail_channels(): void
    {
        NotificationFacade::fake();

        $this->booking->customer->notify(new BookingNotification($this->booking, 'cancelled'));

        NotificationFacade::assertSentTo(
            $this->booking->customer,
            BookingNotification::class,
            function ($notification, $channels) {
                return $notification->type === 'cancelled'
                    && in_array('database', $channels, true)
                    && in_array('mail', $channels, true);
            }
        );
    }

    // ── 3: customer_cancelled remains unchanged ───────────────────────────────

    public function test_customer_cancelled_type_is_unaffected_by_this_fix(): void
    {
        $notification = new BookingNotification($this->booking, 'customer_cancelled');
        $data = $notification->toDatabase($this->customer);

        $this->assertSame('Booking Cancelled', $data['title']);
        $this->assertStringContainsString('Swedish Massage', $data['message']);
        $this->assertSame('/my-bookings', $data['url']);

        // Still in-app only — untouched.
        $this->assertSame(['database'], $notification->via($this->customer));
    }

    // ── 4: every other existing type is unaffected ────────────────────────────

    public function test_all_other_existing_notification_types_remain_unchanged(): void
    {
        $expected = [
            'accepted'             => ['title' => 'Booking Confirmed! 🎉', 'subject' => '✅ Booking Confirmed — '],
            'rejected'             => ['title' => 'Booking Declined', 'subject' => '❌ Booking Declined — '],
            'en_route'             => ['title' => 'Therapist On The Way! 🚗', 'subject' => '🚗 Your Therapist is On The Way!'],
            'arrived'              => ['title' => 'Therapist Arrived! 📍', 'subject' => '📍 Your Therapist Has Arrived!'],
            'completed'            => ['title' => 'Session Complete! ⭐', 'subject' => '⭐ How was your session?'],
            'payment_succeeded'    => ['title' => 'Payment Successful', 'subject' => '✅ Payment Successful — '],
            'payment_failed'       => ['title' => 'Payment Failed', 'subject' => '❌ Payment Failed — '],
            'booking_pending'      => ['title' => 'New Booking Request', 'subject' => null],
        ];

        foreach ($expected as $type => $exp) {
            $notification = new BookingNotification($this->booking, $type);
            $data = $notification->toDatabase($this->customer);

            $this->assertSame($exp['title'], $data['title'], "title changed for type [{$type}]");

            if ($exp['subject'] !== null) {
                $mail = $notification->toMail($this->customer);
                $this->assertStringStartsWith($exp['subject'], $mail->subject, "subject changed for type [{$type}]");
            }
        }

        // booking_pending stays database-only, untouched by this fix.
        $this->assertSame(['database'], (new BookingNotification($this->booking, 'booking_pending'))->via($this->customer));
    }

    public function test_an_unrecognized_type_still_falls_back_to_the_generic_message(): void
    {
        $notification = new BookingNotification($this->booking, 'some_unrecognized_type');
        $data = $notification->toDatabase($this->customer);

        $this->assertSame('Booking Update', $data['title']);
    }

    // ── downpayment_verified was removed as dead code (no live caller —
    // the manual verify()/uploadProof() flow it belonged to was deleted
    // from DownpaymentController well before this) — it must now behave
    // exactly like any other unrecognized type, via the same fallback.
    public function test_downpayment_verified_no_longer_has_a_dedicated_mapping(): void
    {
        $notification = new BookingNotification($this->booking, 'downpayment_verified');

        $data = $notification->toDatabase($this->customer);
        $this->assertSame('Booking Update', $data['title']);

        $mail = $notification->toMail($this->customer);
        $this->assertStringStartsWith('Booking Update — ', $mail->subject);
    }
}
