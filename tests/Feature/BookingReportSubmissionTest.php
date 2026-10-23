<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use App\Models\UserReport;
use App\Models\UserViolation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * NOTE: requires a Postgres-backed test database — see the same note in
 * tests/Feature/TherapistRejectGuardTest.php. phpunit.xml already pins
 * APP_ENV=testing / DB_DATABASE=infinity_spa_test / DB_HOST=127.0.0.1,
 * distinct from the dev database and credentials in .env.
 *
 * Covers Mission #40B: the new booking-linked Customer/Therapist reporting
 * endpoints built on the existing UserReport model and Admin Trust & Safety
 * review workflow.
 */
class BookingReportSubmissionTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;
    private User $otherCustomer;
    private User $therapistUser;
    private Therapist $therapist;
    private User $otherTherapistUser;
    private Therapist $otherTherapist;
    private Service $service;
    private ServiceVariant $variant;
    private Booking $booking;

    protected function setUp(): void
    {
        parent::setUp();

        $this->assertSame('infinity_spa_test', DB::connection()->getDatabaseName());

        $this->customer      = User::factory()->create(['role' => 'customer']);
        $this->otherCustomer = User::factory()->create(['role' => 'customer']);

        $this->therapistUser = User::factory()->create(['role' => 'therapist']);
        $this->therapist = Therapist::create([
            'user_id' => $this->therapistUser->id, 'base_location' => 'Dubai', 'gender' => 'female', 'is_active' => true,
        ]);

        $this->otherTherapistUser = User::factory()->create(['role' => 'therapist']);
        $this->otherTherapist = Therapist::create([
            'user_id' => $this->otherTherapistUser->id, 'base_location' => 'Dubai', 'gender' => 'female', 'is_active' => true,
        ]);

        $this->service = Service::create([
            'name' => 'Swedish Massage', 'duration_minutes' => 60, 'price' => 300, 'is_active' => true,
        ]);
        $this->variant = ServiceVariant::create([
            'service_id' => $this->service->id, 'duration_minutes' => 60, 'price' => 300,
        ]);

        $this->booking = $this->makeBooking();
    }

    private function makeBooking(array $overrides = []): Booking
    {
        return Booking::create(array_merge([
            'customer_id'        => $this->customer->id,
            'therapist_id'       => $this->therapist->id,
            'service_id'         => $this->service->id,
            'service_variant_id' => $this->variant->id,
            'location'           => 'Test location',
            'zone_name'          => 'Test Zone',
            'payment_method'     => 'cashless',
            'payment_type'       => 'full',
            'status'             => 'completed',
            'scheduled_start'    => now()->subDays(1),
            'scheduled_end'      => now()->subDays(1)->addHour(),
        ], $overrides));
    }

    private function customerReport(Booking $booking, array $payload, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->customer)->postJson("/api/bookings/{$booking->id}/report", $payload);
    }

    private function therapistReport(Booking $booking, array $payload, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->therapistUser)->postJson("/therapist/api/bookings/{$booking->id}/report", $payload);
    }

    // ── 1. Customer reports therapist on own booking ─────────────────────────

    public function test_customer_can_report_therapist_on_own_booking(): void
    {
        $response = $this->customerReport($this->booking, ['reason' => 'no_show', 'description' => 'Did not show up.']);

        $response->assertStatus(201)->assertJsonPath('reason', 'no_show')->assertJsonPath('status', 'pending');

        $this->assertDatabaseHas('user_reports', [
            'booking_id'       => $this->booking->id,
            'reporter_id'      => $this->customer->id,
            'reporter_type'    => 'customer',
            'reported_user_id' => $this->therapistUser->id,
            'reported_type'    => 'therapist',
            'reason'           => 'no_show',
            'status'           => 'pending',
        ]);
    }

    // ── 2. Therapist reports customer on assigned booking ────────────────────

    public function test_therapist_can_report_customer_on_assigned_booking(): void
    {
        $response = $this->therapistReport($this->booking, ['reason' => 'unprofessional_conduct']);

        $response->assertStatus(201)->assertJsonPath('reason', 'unprofessional_conduct');

        $this->assertDatabaseHas('user_reports', [
            'booking_id'       => $this->booking->id,
            'reporter_id'      => $this->therapistUser->id,
            'reporter_type'    => 'therapist',
            'reported_user_id' => $this->customer->id,
            'reported_type'    => 'customer',
            'reason'           => 'unprofessional_conduct',
        ]);
    }

    // ── 3. Correct reported account and reporter identity ────────────────────

    public function test_reporter_and_reported_identity_are_derived_from_the_booking(): void
    {
        $this->customerReport($this->booking, ['reason' => 'safety_concern'])->assertStatus(201);
        $report = UserReport::first();

        $this->assertSame($this->customer->id, $report->reporter_id);
        $this->assertSame($this->therapistUser->id, $report->reported_user_id);
        $this->assertSame('customer', $report->reporter_type);
        $this->assertSame('therapist', $report->reported_type);
    }

    // ── 4. Unauthorized booking access is denied ──────────────────────────────

    public function test_customer_cannot_report_a_booking_that_is_not_theirs(): void
    {
        $this->customerReport($this->booking, ['reason' => 'other'], $this->otherCustomer)->assertStatus(403);
        $this->assertDatabaseCount('user_reports', 0);
    }

    public function test_therapist_cannot_report_a_booking_not_assigned_to_them(): void
    {
        $this->therapistReport($this->booking, ['reason' => 'other'], $this->otherTherapistUser)->assertStatus(403);
        $this->assertDatabaseCount('user_reports', 0);
    }

    // ── 5. Cross-role attempts are denied ─────────────────────────────────────

    public function test_therapist_hitting_the_customer_report_endpoint_is_denied(): void
    {
        // auth()->id() for the therapist user will never equal booking.customer_id.
        $this->customerReport($this->booking, ['reason' => 'other'], $this->therapistUser)->assertStatus(403);
    }

    public function test_customer_hitting_the_therapist_report_route_is_denied_by_role_middleware(): void
    {
        $this->actingAs($this->customer)
            ->postJson("/therapist/api/bookings/{$this->booking->id}/report", ['reason' => 'other'])
            ->assertStatus(403);
    }

    // ── 6. Tampered reported_user_id / moderation fields cannot affect persistence ─

    public function test_client_supplied_identity_and_moderation_fields_are_ignored(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->customerReport($this->booking, [
            'reason'           => 'payment_dispute',
            'reported_user_id' => $this->otherTherapistUser->id,
            'reported_type'    => 'customer',
            'reporter_id'      => $this->otherCustomer->id,
            'status'           => 'reviewed',
            'reviewed_by'      => $admin->id,
            'admin_note'       => 'injected note',
        ])->assertStatus(201);

        $report = UserReport::first();
        $this->assertSame($this->therapistUser->id, $report->reported_user_id, 'reported_user_id must come from the booking, not the client.');
        $this->assertSame('therapist', $report->reported_type);
        $this->assertSame($this->customer->id, $report->reporter_id, 'reporter_id must come from the authenticated identity, not the client.');
        $this->assertSame('pending', $report->status);
        $this->assertNull($report->reviewed_by);
        $this->assertNull($report->admin_note);
    }

    // ── 7. Validated category and description limits ─────────────────────────

    public function test_invalid_reason_code_is_rejected(): void
    {
        $this->customerReport($this->booking, ['reason' => 'made_up_reason'])->assertStatus(422);
        $this->assertDatabaseCount('user_reports', 0);
    }

    public function test_description_over_1000_characters_is_rejected(): void
    {
        $this->customerReport($this->booking, ['reason' => 'other', 'description' => str_repeat('a', 1001)])
            ->assertStatus(422);
    }

    public function test_description_is_optional(): void
    {
        $this->customerReport($this->booking, ['reason' => 'other'])->assertStatus(201);
    }

    // ── 8. Duplicate submissions return 409 ───────────────────────────────────

    public function test_a_second_report_from_the_same_reporter_on_the_same_booking_returns_409(): void
    {
        $this->customerReport($this->booking, ['reason' => 'no_show'])->assertStatus(201);
        $this->customerReport($this->booking, ['reason' => 'other'])->assertStatus(409);

        $this->assertDatabaseCount('user_reports', 1);
    }

    public function test_customer_and_therapist_can_each_file_their_own_report_on_the_same_booking(): void
    {
        $this->customerReport($this->booking, ['reason' => 'no_show'])->assertStatus(201);
        $this->therapistReport($this->booking, ['reason' => 'unprofessional_conduct'])->assertStatus(201);

        $this->assertDatabaseCount('user_reports', 2);
    }

    // ── 9. Database uniqueness prevents concurrent duplicates ────────────────

    public function test_the_partial_unique_index_rejects_a_duplicate_insert_at_the_database_level(): void
    {
        UserReport::create([
            'reporter_id' => $this->customer->id, 'reporter_type' => 'customer',
            'reported_user_id' => $this->therapistUser->id, 'reported_type' => 'therapist',
            'booking_id' => $this->booking->id, 'reason' => 'no_show', 'status' => 'pending',
        ]);

        $this->expectException(\Illuminate\Database\QueryException::class);

        UserReport::create([
            'reporter_id' => $this->customer->id, 'reporter_type' => 'customer',
            'reported_user_id' => $this->therapistUser->id, 'reported_type' => 'therapist',
            'booking_id' => $this->booking->id, 'reason' => 'other', 'status' => 'pending',
        ]);
    }

    // ── 10. GET exposes only the reporter's own report ────────────────────────

    public function test_get_returns_null_when_the_reporter_has_not_filed_a_report(): void
    {
        $this->actingAs($this->customer)->getJson("/api/bookings/{$this->booking->id}/report")
            ->assertOk()->assertJsonPath('report', null);
    }

    public function test_get_returns_the_reporters_own_report_after_filing(): void
    {
        $this->customerReport($this->booking, ['reason' => 'no_show'])->assertStatus(201);

        $this->actingAs($this->customer)->getJson("/api/bookings/{$this->booking->id}/report")
            ->assertOk()->assertJsonPath('report.reason', 'no_show');
    }

    public function test_therapist_get_never_sees_the_customers_report_on_the_same_booking(): void
    {
        $this->customerReport($this->booking, ['reason' => 'no_show'])->assertStatus(201);

        $this->actingAs($this->therapistUser)->getJson("/therapist/api/bookings/{$this->booking->id}/report")
            ->assertOk()->assertJsonPath('report', null);
    }

    public function test_get_is_denied_for_an_unrelated_booking(): void
    {
        $this->actingAs($this->otherCustomer)->getJson("/api/bookings/{$this->booking->id}/report")
            ->assertStatus(403);
    }

    // ── 11. Existing Admin review remains functional ──────────────────────────

    public function test_admin_can_still_review_a_booking_linked_report(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $this->customerReport($this->booking, ['reason' => 'no_show'])->assertStatus(201);
        $report = UserReport::first();

        $this->actingAs($admin)
            ->postJson("/admin/api/therapists/{$this->therapist->id}/reports/{$report->id}/review", [
                'status' => 'reviewed', 'admin_note' => 'Looked into it.',
            ])->assertOk();

        $report->refresh();
        $this->assertSame('reviewed', $report->status);
        $this->assertSame('Looked into it.', $report->admin_note);
        $this->assertSame($admin->id, $report->reviewed_by);
    }

    public function test_admin_therapist_reports_listing_still_includes_booking_linked_reports(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $this->customerReport($this->booking, ['reason' => 'no_show'])->assertStatus(201);

        $this->actingAs($admin)->getJson("/admin/api/therapists/{$this->therapist->id}/reports")
            ->assertOk()->assertJsonPath('0.reason', 'no_show');
    }

    // ── 12. No automatic restriction is created ───────────────────────────────

    public function test_submitting_a_report_creates_no_violation_or_restriction(): void
    {
        $this->customerReport($this->booking, ['reason' => 'safety_concern'])->assertStatus(201);

        $this->assertSame(0, UserViolation::count());
        $this->therapistUser->refresh();
        $this->assertSame('none', $this->therapistUser->restriction_level);
        $this->assertSame(0, $this->therapistUser->strike_count);
    }

    // ── 13. Audit records contain no free-text description ───────────────────

    public function test_audit_record_omits_the_free_text_description(): void
    {
        $secret = 'Sensitive details about what allegedly happened.';
        $this->customerReport($this->booking, ['reason' => 'safety_concern', 'description' => $secret])->assertStatus(201);

        $log = AuditLog::where('event', 'customer.report_submitted')->first();
        $this->assertNotNull($log);
        $this->assertSame($this->booking->id, $log->target_id);
        $this->assertSame('safety_concern', $log->metadata['reason']);
        $this->assertArrayHasKey('report_id', $log->metadata);
        $this->assertArrayHasKey('reported_user_id', $log->metadata);
        $this->assertArrayNotHasKey('description', $log->metadata);
        $this->assertStringNotContainsString($secret, json_encode($log->metadata));
    }

    public function test_therapist_report_audit_event_fires_with_its_own_event_name(): void
    {
        $this->therapistReport($this->booking, ['reason' => 'payment_dispute'])->assertStatus(201);

        $log = AuditLog::where('event', 'therapist.report_submitted')->first();
        $this->assertNotNull($log);
        $this->assertSame('payment_dispute', $log->metadata['reason']);
    }

    public function test_no_audit_event_is_recorded_for_a_rejected_duplicate(): void
    {
        $this->customerReport($this->booking, ['reason' => 'no_show'])->assertStatus(201);
        $this->customerReport($this->booking, ['reason' => 'other'])->assertStatus(409);

        $this->assertSame(1, AuditLog::where('event', 'customer.report_submitted')->count());
    }

    // ── 14. Existing report rows without booking_id remain supported ─────────

    public function test_legacy_report_rows_without_booking_id_remain_readable(): void
    {
        $legacy = UserReport::create([
            'reporter_id' => $this->customer->id, 'reporter_type' => 'customer',
            'reported_user_id' => $this->therapistUser->id, 'reported_type' => 'therapist',
            'reason' => 'Legacy free-text reason', 'status' => 'pending',
        ]);

        $this->assertNull($legacy->booking_id);

        $admin = User::factory()->create(['role' => 'admin']);
        $this->actingAs($admin)->getJson("/admin/api/therapists/{$this->therapist->id}/reports")
            ->assertOk()->assertJsonPath('0.reason', 'Legacy free-text reason');
    }

    public function test_multiple_legacy_rows_without_booking_id_do_not_violate_the_partial_unique_index(): void
    {
        UserReport::create([
            'reporter_id' => $this->customer->id, 'reporter_type' => 'customer',
            'reported_user_id' => $this->therapistUser->id, 'reported_type' => 'therapist',
            'reason' => 'Legacy one', 'status' => 'pending',
        ]);

        UserReport::create([
            'reporter_id' => $this->customer->id, 'reporter_type' => 'customer',
            'reported_user_id' => $this->therapistUser->id, 'reported_type' => 'therapist',
            'reason' => 'Legacy two', 'status' => 'pending',
        ]);

        $this->assertSame(2, UserReport::count());
    }

    // ── Mission #40B.1: report insert and audit insert share one transaction ─

    public function test_report_and_audit_are_committed_together_for_customer_submission(): void
    {
        $this->customerReport($this->booking, ['reason' => 'no_show'])->assertStatus(201);

        $this->assertSame(1, UserReport::count());
        $this->assertSame(1, AuditLog::where('event', 'customer.report_submitted')->count());
    }

    public function test_report_and_audit_are_committed_together_for_therapist_submission(): void
    {
        $this->therapistReport($this->booking, ['reason' => 'unprofessional_conduct'])->assertStatus(201);

        $this->assertSame(1, UserReport::count());
        $this->assertSame(1, AuditLog::where('event', 'therapist.report_submitted')->count());
    }

    // Mirrors the existing "audit failure rolls back state" convention in
    // tests/Feature/AdministrativeRestrictionAuditTest.php: listen on the
    // Eloquent "created" event for AuditLog itself (fired synchronously
    // from inside AuditService::log(), which runs inside
    // ReportSubmissionService::submit()'s transaction) and make it throw,
    // proving the UserReport insert rolls back with it rather than
    // persisting unaudited.
    public function test_an_audit_insert_failure_rolls_back_the_report_insert_and_a_retry_then_succeeds(): void
    {
        $listener = 'eloquent.created: '.AuditLog::class;
        Event::listen($listener, fn () => throw new \RuntimeException('Audit failed'));
        $this->withoutExceptionHandling();

        try {
            $this->customerReport($this->booking, ['reason' => 'no_show']);
            $this->fail('Expected audit failure');
        } catch (\RuntimeException $e) {
            $this->assertSame('Audit failed', $e->getMessage());
        } finally {
            Event::forget($listener);
        }

        $this->assertSame(0, UserReport::count(), 'The report insert must roll back when the audit insert fails.');
        $this->assertDatabaseCount('audit_logs', 0);

        // ── Retry, with the fault listener removed, succeeds cleanly ────────
        $this->customerReport($this->booking, ['reason' => 'no_show'])->assertStatus(201);

        $this->assertSame(1, UserReport::count());
        $this->assertSame(1, AuditLog::where('event', 'customer.report_submitted')->count());
    }

    // Proves ReportSubmissionService's 23505 handler checks the actual
    // constraint name rather than converting every unique violation on
    // user_reports into a 409. Postgres DDL is transactional, so
    // RefreshDatabase's per-test transaction rolls this ad-hoc index back
    // automatically — no manual cleanup needed.
    public function test_only_the_reporter_booking_unique_index_is_mapped_to_409(): void
    {
        DB::statement("CREATE UNIQUE INDEX test_other_unique_idx ON user_reports (reporter_id, reason) WHERE reason = 'other'");

        $otherBooking = $this->makeBooking(['therapist_id' => $this->otherTherapist->id]);
        UserReport::create([
            'reporter_id' => $this->customer->id, 'reporter_type' => 'customer',
            'reported_user_id' => $this->otherTherapistUser->id, 'reported_type' => 'therapist',
            'booking_id' => $otherBooking->id, 'reason' => 'other', 'status' => 'pending',
        ]);

        // Different booking than the pre-existing row above — not a
        // reporter+booking duplicate — but the same reporter_id +
        // reason='other' pair the ad-hoc index forbids.
        $response = $this->customerReport($this->booking, ['reason' => 'other']);

        $response->assertStatus(500, 'An unrelated unique violation must not be reported as a 409 booking-report duplicate.');
        $this->assertSame(1, UserReport::count(), 'The colliding insert must roll back rather than silently succeed.');
    }
}
