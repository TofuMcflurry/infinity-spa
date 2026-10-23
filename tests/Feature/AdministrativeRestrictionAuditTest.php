<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Therapist;
use App\Models\User;
use App\Models\UserReport;
use App\Models\UserViolation;
use App\Services\TrustSafetyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AdministrativeRestrictionAuditTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $customer;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->customer = User::factory()->create(['role' => 'customer']);
        $this->actingAs($this->admin);
    }

    private function therapist(bool $active = false): Therapist
    {
        return Therapist::create([
            'user_id' => User::factory()->create(['role' => 'therapist'])->id,
            'is_active' => $active, 'gender' => 'female', 'base_location' => 'Dubai',
        ]);
    }

    private function customerAction(string $action)
    {
        return $this->postJson('/admin/api/customers/'.$this->customer->id.'/'.$action, ['reason' => 'PRIVATE-REASON']);
    }

    private function assertActor(AuditLog $row, int $targetId, string $type = 'User'): void
    {
        $this->assertEquals($this->admin->id, $row->user_id);
        $this->assertSame('admin', $row->user_role);
        $this->assertEquals($targetId, $row->target_id);
        $this->assertSame($type, $row->target_type);
        $this->assertStringNotContainsString('PRIVATE', json_encode($row->metadata));
    }

    public function test_customer_block_and_unblock_persist_with_one_audit_per_transition(): void
    {
        $this->customerAction('block')->assertOk()->assertJsonPath('customer.is_blocked', true);
        $blocked = $this->customer->fresh();
        $this->assertTrue($blocked->is_blocked);
        $this->assertNotNull($blocked->blocked_at);
        $this->assertSame('PRIVATE-REASON', $blocked->block_reason);
        $this->customerAction('block')->assertOk();
        $this->assertEquals($blocked->getRawOriginal(), $blocked->fresh()->getRawOriginal());
        $audit = AuditLog::where('event', 'customer.blocked')->sole();
        $this->assertActor($audit, $blocked->id);
        $this->assertSame(['before' => ['is_blocked' => false], 'after' => ['is_blocked' => true]], $audit->metadata);
        $this->customerAction('unblock')->assertOk()->assertJsonPath('customer.is_blocked', false);
        $this->customerAction('unblock')->assertOk();
        $unblocked = $blocked->fresh();
        $this->assertFalse($unblocked->is_blocked);
        $this->assertNull($unblocked->blocked_at);
        $this->assertNull($unblocked->block_reason);
        $this->assertActor(AuditLog::where('event', 'customer.unblocked')->sole(), $blocked->id);
        $this->assertDatabaseCount('audit_logs', 2);
        Notification::assertNothingSent();
        $this->assertFalse($unblocked->isFillable('is_blocked'));
        $this->assertFalse($unblocked->isFillable('restriction_level'));
    }

    public function test_customer_validation_and_admin_permissions_remain_enforced(): void
    {
        $this->postJson('/admin/api/customers/'.$this->customer->id.'/block', [])->assertUnprocessable();
        $this->actingAs($this->customer)->customerAction('block')->assertRedirect('/');
        $this->assertFalse($this->customer->fresh()->is_blocked);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_separate_customer_unblock_does_not_silently_lift_trust_restriction(): void
    {
        TrustSafetyService::issuePermanentBlock($this->customer, 'PRIVATE-REASON');
        $this->customerAction('unblock')->assertOk();
        $this->assertTrue($this->customer->fresh()->isAccessRestricted());
        TrustSafetyService::liftRestriction($this->customer, 'PRIVATE-NOTE');
        $this->assertFalse($this->customer->fresh()->isAccessRestricted());
    }

    public static function temporaryWarningStates(): array
    {
        return ['active deadline' => [false], 'expired awaiting lift' => [true]];
    }

    #[DataProvider('temporaryWarningStates')]
    public function test_warning_preserves_temporary_block_and_its_expiry_path(bool $expired): void
    {
        TrustSafetyService::issueTempBlock($this->customer, 7, 'PRIVATE-block');
        if ($expired) {
            $this->travel(8)->days();
        }
        $before = $this->customer->fresh();
        $report = UserReport::create([
            'reporter_id' => $this->admin->id, 'reporter_type' => 'admin',
            'reported_user_id' => $this->customer->id, 'reported_type' => 'customer', 'reason' => 'PRIVATE',
        ]);
        $warning = TrustSafetyService::issueWarning($this->customer, 'PRIVATE-warning', reportId: $report->id);
        $retry = TrustSafetyService::issueWarning($this->customer, 'PRIVATE-warning', reportId: $report->id);
        $after = $this->customer->fresh();
        $this->assertSame('temp_blocked', $after->restriction_level);
        $this->assertTrue($after->is_blocked);
        $this->assertTrue($after->isAccessRestricted());
        foreach (['restricted_until', 'blocked_at', 'block_reason'] as $field) {
            $this->assertSame($before->getRawOriginal($field), $after->getRawOriginal($field));
        }
        $this->assertSame($before->strike_count + 1, $after->strike_count);
        $this->assertSame(2, $warning['strike_number']);
        $this->assertFalse($warning['suggest_temp_block']);
        $this->assertSame($warning['violation']->id, $retry['violation']->id);
        $audit = AuditLog::where('event', 'trust.warning_issued')->sole();
        $this->assertActor($audit, $after->id);
        $this->assertSame('temp_blocked', $audit->metadata['before']['restriction_level']);
        $this->assertSame('temp_blocked', $audit->metadata['after']['restriction_level']);
        $this->assertSame(2, $audit->metadata['after']['strike_count']);
        $this->assertDatabaseCount('user_violations', 2);
        Notification::assertCount(2);
        if (!$expired) {
            $this->assertSame(0, TrustSafetyService::checkAndExpireTempBlocks());
            $this->travel(8)->days();
        }
        $this->assertSame(1, TrustSafetyService::checkAndExpireTempBlocks());
        $this->assertSame(0, TrustSafetyService::checkAndExpireTempBlocks());
        $this->assertFalse($after->fresh()->isAccessRestricted());
        $this->assertSame('none', $after->fresh()->restriction_level);
        $this->assertDatabaseMissing('user_violations', ['user_id' => $after->id, 'level' => 'temp_block', 'is_active' => true]);
    }

    public function test_warning_cannot_turn_permanent_block_into_customer_unblock_bypass(): void
    {
        TrustSafetyService::issuePermanentBlock($this->customer, 'PRIVATE-block');
        $before = $this->customer->fresh();
        TrustSafetyService::issueWarning($this->customer, 'PRIVATE-warning');
        $after = $this->customer->fresh();
        $this->assertSame('permanently_blocked', $after->restriction_level);
        $this->assertTrue($after->is_blocked);
        foreach (['restricted_until', 'blocked_at', 'block_reason'] as $field) {
            $this->assertSame($before->getRawOriginal($field), $after->getRawOriginal($field));
        }
        $this->assertSame($before->strike_count + 1, $after->strike_count);
        $audit = AuditLog::where('event', 'trust.warning_issued')->sole();
        $this->assertSame('permanently_blocked', $audit->metadata['before']['restriction_level']);
        $this->assertSame('permanently_blocked', $audit->metadata['after']['restriction_level']);
        $this->customerAction('unblock')->assertOk();
        $this->assertFalse($after->fresh()->is_blocked);
        $this->assertTrue($after->fresh()->isAccessRestricted());
        $this->post('/logout')->assertRedirect('/');
        $this->post('/login', ['email' => $after->email, 'password' => 'password'])
            ->assertSessionHasErrors(['email' => 'Your account is permanently blocked. Please contact support for assistance.']);
        $this->assertGuest();
        $this->actingAs($after->fresh())->getJson('/api/profile-data')->assertUnauthorized();
        $this->assertGuest();
        $this->assertDatabaseMissing('audit_logs', ['event' => 'auth.login']);
        $this->assertDatabaseMissing('audit_logs', ['event' => 'auth.otp_verified']);
        $this->assertDatabaseHas('user_violations', ['user_id' => $after->id, 'level' => 'permanent_block', 'is_active' => true]);
    }

    public static function strongerWarningStates(): array
    {
        return ['temporary block' => [false], 'permanent block' => [true]];
    }

    #[DataProvider('strongerWarningStates')]
    public function test_failed_warning_audit_preserves_stronger_restriction_and_strikes(bool $permanent): void
    {
        if ($permanent) {
            TrustSafetyService::issuePermanentBlock($this->customer, 'PRIVATE-block');
        } else {
            TrustSafetyService::issueTempBlock($this->customer, 7, 'PRIVATE-block');
        }
        $before = $this->customer->fresh()->getRawOriginal();
        Notification::fake();
        $listener = 'eloquent.created: '.AuditLog::class;
        Event::listen($listener, function (AuditLog $row) {
            if ($row->event === 'trust.warning_issued') {
                throw new \RuntimeException('Warning audit failed');
            }
        });
        try {
            TrustSafetyService::issueWarning($this->customer, 'PRIVATE-warning');
            $this->fail('Expected warning audit failure');
        } catch (\RuntimeException $e) {
            $this->assertSame('Warning audit failed', $e->getMessage());
        } finally {
            Event::forget($listener);
        }
        $this->assertSame($before, $this->customer->fresh()->getRawOriginal());
        $this->assertDatabaseCount('user_violations', 1);
        $this->assertDatabaseCount('audit_logs', 1);
        $this->assertDatabaseMissing('audit_logs', ['event' => 'trust.warning_issued']);
        Notification::assertNothingSent();
    }

    public function test_warnings_preserve_strikes_escalation_and_report_retry_identity(): void
    {
        $report = UserReport::create([
            'reporter_id' => $this->admin->id, 'reporter_type' => 'admin',
            'reported_user_id' => $this->customer->id, 'reported_type' => 'customer', 'reason' => 'PRIVATE',
        ]);
        $first = TrustSafetyService::issueWarning($this->customer, 'PRIVATE', reportId: $report->id);
        $retry = TrustSafetyService::issueWarning($this->customer, 'PRIVATE', reportId: $report->id);
        $this->assertSame($first['violation']->id, $retry['violation']->id);
        $this->assertFalse($first['suggest_temp_block']);
        $this->assertSame(1, $this->customer->fresh()->strike_count);
        TrustSafetyService::issueWarning($this->customer, 'PRIVATE-second');
        $third = TrustSafetyService::issueWarning($this->customer, 'PRIVATE-third');
        $this->assertTrue($third['suggest_temp_block']);
        $this->assertSame(3, $this->customer->fresh()->strike_count);
        $this->assertSame('warned', $this->customer->fresh()->restriction_level);
        $this->assertFalse($this->customer->fresh()->isAccessRestricted());
        $this->assertDatabaseCount('user_violations', 3);
        $this->assertDatabaseCount('audit_logs', 3);
        Notification::assertCount(3);
        foreach (AuditLog::all() as $row) {
            $this->assertActor($row, $this->customer->id);
            $this->assertArrayNotHasKey('reason', $row->metadata);
            $this->assertArrayNotHasKey('user_name', $row->metadata);
        }
    }

    public function test_temporary_permanent_and_manual_lift_persist_and_exact_retries_are_noops(): void
    {
        $first = TrustSafetyService::issueTempBlock($this->customer, 7, 'PRIVATE');
        $retry = TrustSafetyService::issueTempBlock($this->customer, 7, 'PRIVATE');
        $this->assertSame($first->id, $retry->id);
        $blocked = $this->customer->fresh();
        $this->assertTrue($blocked->is_blocked);
        $this->assertSame(1, $blocked->strike_count);
        $this->assertSame('temp_blocked', $blocked->restriction_level);
        $this->assertEquals($first->fresh()->expires_at, $blocked->restricted_until);
        $this->assertNotNull($blocked->blocked_at);
        $this->assertSame('Temporary block (7 days): PRIVATE', $blocked->block_reason);
        $this->assertSame(7, $first->duration_days);
        $permanent = TrustSafetyService::issuePermanentBlock($this->customer, 'PRIVATE');
        $this->assertSame($permanent->id, TrustSafetyService::issuePermanentBlock($this->customer, 'PRIVATE')->id);
        $this->assertSame('permanently_blocked', $blocked->fresh()->restriction_level);
        $this->assertNull($blocked->fresh()->restricted_until);
        $this->assertSame(1, $blocked->fresh()->strike_count); // Permanent block did not previously increment strikes.
        TrustSafetyService::liftRestriction($this->customer, 'PRIVATE-NOTE');
        TrustSafetyService::liftRestriction($this->customer, 'PRIVATE-NOTE');
        $this->assertFalse($blocked->fresh()->isAccessRestricted());
        $this->assertSame('none', $blocked->fresh()->restriction_level);
        $this->assertDatabaseMissing('user_violations', ['user_id' => $blocked->id, 'is_active' => true]);
        $this->assertDatabaseCount('audit_logs', 3);
        Notification::assertCount(3);
        foreach (AuditLog::all() as $row) {
            $this->assertActor($row, $blocked->id);
            $this->assertArrayHasKey('before', $row->metadata);
            $this->assertArrayHasKey('after', $row->metadata);
        }
    }

    public function test_thirty_day_duration_remains_supported(): void
    {
        $this->freezeTime();
        $violation = TrustSafetyService::issueTempBlock($this->customer, 30, 'PRIVATE');
        $this->assertSame(30, $violation->duration_days);
        $this->assertSame(now()->addDays(30)->toDateTimeString(), $this->customer->fresh()->restricted_until->toDateTimeString());
    }

    public static function auditFailures(): array
    {
        return [
            'block' => ['block'], 'unblock' => ['unblock'], 'warning' => ['warning'], 'temporary' => ['temporary'],
            'permanent' => ['permanent'], 'lift' => ['lift'], 'expiry' => ['expiry'],
            'approve' => ['approve'], 'deactivate' => ['deactivate'], 'reject' => ['reject'],
        ];
    }

    #[DataProvider('auditFailures')]
    public function test_audit_failure_rolls_back_state_and_prevents_notifications(string $action): void
    {
        if (in_array($action, ['unblock', 'lift', 'expiry'])) {
            $this->customer->forceFill([
                'is_blocked' => true, 'blocked_at' => now(), 'block_reason' => 'PRIVATE',
                'restriction_level' => 'temp_blocked', 'restricted_until' => now()->subMinute(),
            ])->save();
            UserViolation::create(['user_id' => $this->customer->id, 'issued_by' => $this->admin->id, 'level' => 'temp_block', 'reason' => 'PRIVATE']);
        }
        $therapist = $this->therapist($action === 'deactivate');
        $before = $this->customer->fresh()->getRawOriginal();
        $violationBefore = UserViolation::all()->toArray();
        $listener = 'eloquent.created: '.AuditLog::class;
        Event::listen($listener, fn () => throw new \RuntimeException('Audit failed'));
        $this->withoutExceptionHandling();
        try {
            match ($action) {
                'block', 'unblock' => $this->customerAction($action),
                'warning' => TrustSafetyService::issueWarning($this->customer, 'PRIVATE'),
                'temporary' => TrustSafetyService::issueTempBlock($this->customer, 7, 'PRIVATE'),
                'permanent' => TrustSafetyService::issuePermanentBlock($this->customer, 'PRIVATE'),
                'lift' => TrustSafetyService::liftRestriction($this->customer),
                'expiry' => TrustSafetyService::checkAndExpireTempBlocks(),
                'reject' => $this->delete('/admin/therapists/'.$therapist->id),
                default => $this->post('/admin/therapists/'.$therapist->id.'/'.$action),
            };
            $this->fail('Expected audit failure');
        } catch (\RuntimeException $e) {
            $this->assertSame('Audit failed', $e->getMessage());
        } finally {
            Event::forget($listener);
        }
        $this->assertSame($before, $this->customer->fresh()->getRawOriginal());
        $this->assertSame($violationBefore, UserViolation::all()->toArray());
        $this->assertSame($action === 'deactivate', $therapist->fresh()->is_active);
        $this->assertDatabaseHas('users', ['id' => $therapist->user_id]);
        $this->assertDatabaseCount('audit_logs', 0);
        Notification::assertNothingSent();
    }

    public function test_therapist_approve_reactivate_deactivate_and_reject_are_audited_once(): void
    {
        $therapist = $this->therapist();
        $path = '/admin/therapists/'.$therapist->id;
        $this->post($path.'/approve')->assertRedirect();
        $this->post($path.'/approve')->assertRedirect();
        $this->assertTrue($therapist->fresh()->is_active);
        $this->post($path.'/deactivate')->assertRedirect();
        $this->post($path.'/deactivate')->assertRedirect();
        $this->assertFalse($therapist->fresh()->is_active);
        $this->post($path.'/approve')->assertRedirect();
        $this->assertSame(2, AuditLog::where('event', 'therapist.approved')->count());
        $this->assertSame(1, AuditLog::where('event', 'therapist.deactivated')->count());
        $this->delete($path)->assertRedirect();
        $this->delete($path)->assertNotFound();
        $this->assertActor(AuditLog::where('event', 'therapist.rejected')->sole(), $therapist->id, 'Therapist');
        $this->assertDatabaseMissing('therapists', ['id' => $therapist->id]);
        $this->assertDatabaseMissing('users', ['id' => $therapist->user_id]);
        $this->assertDatabaseCount('audit_logs', 4);
    }

    public function test_failed_user_deletion_restores_therapist_and_creates_no_rejection_audit(): void
    {
        $therapist = $this->therapist();
        $listener = 'eloquent.deleting: '.User::class;
        Event::listen($listener, fn () => throw new \RuntimeException('Deletion failed'));
        $this->withoutExceptionHandling();
        try {
            $this->delete('/admin/therapists/'.$therapist->id);
            $this->fail('Expected deletion failure');
        } catch (\RuntimeException $e) {
            $this->assertSame('Deletion failed', $e->getMessage());
        } finally {
            Event::forget($listener);
        }
        $this->assertDatabaseHas('therapists', ['id' => $therapist->id]);
        $this->assertDatabaseHas('users', ['id' => $therapist->user_id]);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_cancelled_model_save_cannot_create_success_audit_or_violation(): void
    {
        $listener = 'eloquent.saving: '.User::class;
        Event::listen($listener, fn () => false);
        try {
            TrustSafetyService::issueWarning($this->customer, 'PRIVATE');
            $this->fail('Expected mutation failure');
        } catch (\RuntimeException $e) {
            $this->assertSame('Account restriction could not be saved.', $e->getMessage());
        } finally {
            Event::forget($listener);
        }
        $this->assertSame(0, $this->customer->fresh()->strike_count);
        $this->assertDatabaseCount('user_violations', 0);
        $this->assertDatabaseCount('audit_logs', 0);
        Notification::assertNothingSent();
    }

    public function test_outer_rollback_discards_notifications_and_success_audits(): void
    {
        try {
            DB::transaction(function () {
                TrustSafetyService::issueTempBlock($this->customer, 7, 'PRIVATE');
                Notification::assertNothingSent();
                throw new \RuntimeException('Outer rollback');
            });
        } catch (\RuntimeException $e) {
            $this->assertSame('Outer rollback', $e->getMessage());
        }
        $this->assertFalse($this->customer->fresh()->is_blocked);
        $this->assertDatabaseCount('audit_logs', 0);
        $this->assertDatabaseCount('user_violations', 0);
        Notification::assertNothingSent();
    }
}
