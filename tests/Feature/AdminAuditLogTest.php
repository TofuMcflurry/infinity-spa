<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class AdminAuditLogTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('infinity_spa_test', \DB::connection()->getDatabaseName());
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        // Transaction rollback preserves any pre-existing test fixtures.
        AuditLog::query()->delete();
    }

    private function log(string $event, string $time = '2026-10-22 12:00:00', string $role = 'admin'): AuditLog
    {
        return AuditLog::create(['event' => $event, 'created_at' => $time, 'user_role' => $role, 'user_name' => 'Audit Tester']);
    }

    private function query(array $filters = [])
    {
        return $this->getJson('/admin/api/audit-logs?' . http_build_query($filters));
    }

    public function test_categories_match_only_their_explicit_families(): void
    {
        foreach (['auth', 'booking', 'service', 'therapist', 'customer', 'payment', 'trust'] as $category) {
            $this->log($category . '.example');
            $this->log($category . '_other.example');
        }
        foreach (['auth', 'booking', 'service', 'therapist', 'customer', 'payment', 'trust'] as $category) {
            $this->query(['event' => $category])->assertOk()->assertJsonPath('total', 1)
                ->assertJsonPath('data.0.event', $category . '.example');
        }
    }

    public function test_payment_anomaly_is_discoverable_by_category_exact_event_and_search(): void
    {
        $this->log('payment.anomaly_detected');
        $this->log('payment.other');
        $this->query(['event' => 'payment'])->assertOk()->assertJsonPath('total', 2);
        $this->query(['event' => 'payment.anomaly_detected'])->assertOk()->assertJsonPath('total', 1);
        $this->query(['search' => 'payment.anomaly_detected'])->assertOk()->assertJsonPath('total', 1);
        $this->query(['event' => 'payment.unknown'])->assertOk()->assertJsonPath('total', 0);
    }

    public function test_reschedule_group_includes_booking_and_proposal_events(): void
    {
        foreach (['booking.rescheduled', 'reschedule_proposal.created', 'reschedule_proposal.responded', 'reschedule_proposal.expired', 'rescheduleXproposal.created', 'booking.accepted'] as $event) {
            $this->log($event);
        }
        $this->query(['event' => 'reschedule'])->assertOk()->assertJsonPath('total', 4);
        $this->query(['event' => 'reschedule_proposal.responded'])->assertOk()->assertJsonPath('total', 1);
    }

    public function test_timestamp_ties_have_deterministic_non_overlapping_pages(): void
    {
        $ids = [];
        for ($i = 0; $i < 55; $i++) {
            $ids[] = $this->log('booking.accepted')->id;
        }
        $newest = $this->log('booking.accepted', '2026-10-23 00:00:00')->id;
        $expected = [$newest, ...array_reverse($ids)];
        $first = $this->query()->assertOk()->assertJsonPath('total', 56)->json('data');
        $second = $this->query(['page' => 2])->assertOk()->json('data');
        $this->assertSame($expected, array_column([...$first, ...$second], 'id'));
        $this->assertSame(array_column($first, 'id'), array_column($this->query()->json('data'), 'id'));
    }

    public function test_invalid_filters_return_validation_errors(): void
    {
        foreach ([['event' => 'unknown'], ['event' => 'booking.%'], ['event' => "booking' OR 1=1--"], ['event' => ['booking']], ['role' => 'superuser'], ['search' => ['x']], ['page' => 0], ['page' => 'abc'], ['from' => '2026-02-30'], ['to' => 'bad'], ['from' => '2026-10-23', 'to' => '2026-10-22']] as $filters) {
            $this->query($filters)->assertUnprocessable();
        }
    }

    public function test_dates_use_inclusive_dubai_calendar_boundaries_and_combine_with_filters(): void
    {
        $this->assertSame('Asia/Dubai', config('app.timezone'));
        $this->log('payment.anomaly_detected', '2026-10-21 23:59:59');
        $start = $this->log('payment.anomaly_detected', '2026-10-22 00:00:00');
        $end = $this->log('payment.anomaly_detected', '2026-10-22 23:59:59');
        $this->log('payment.anomaly_detected', '2026-10-23 00:00:00');
        $this->log('payment.anomaly_detected', '2026-10-22 12:00:00', 'customer');
        $result = $this->query(['event' => 'payment', 'role' => 'admin', 'from' => '2026-10-22', 'to' => '2026-10-22'])
            ->assertOk()->assertJsonPath('total', 2);
        $this->assertSame([$end->id, $start->id], array_column($result->json('data'), 'id'));
        $result->assertJsonPath('data.1.created_at', 'Oct 22, 2026 12:00 AM');
        $this->query(['to' => '2026-10-21'])->assertOk()->assertJsonPath('total', 1);
        $this->query(['from' => '2026-10-23'])->assertOk()->assertJsonPath('total', 1);
    }

    public function test_stats_remain_global(): void
    {
        $this->log('payment.anomaly_detected');
        $this->log('auth.login_failed');
        $this->getJson('/admin/api/audit-logs/stats?event=payment')->assertOk()
            ->assertJsonPath('total', 2)->assertJsonPath('failed_logins', 1)->assertJsonPath('admin_actions', 2);
    }
}
