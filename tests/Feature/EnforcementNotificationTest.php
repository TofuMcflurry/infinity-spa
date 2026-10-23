<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use App\Models\UserReport;
use App\Notifications\EnforcementNotification;
use App\Services\TrustSafetyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\ChannelManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class EnforcementNotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        config(['mail.default' => 'array', 'queue.connections.database.connection' => null]);
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $this->customer = User::factory()->create(['role' => 'customer', 'is_otp_enabled' => false]);
    }

    public static function actions(): array
    {
        return array_map(fn ($action) => [$action], ['warning', 'temporary', 'permanent', 'block', 'unblock', 'lift', 'expiry']);
    }

    private function prepareAction(string $action): void
    {
        if (in_array($action, ['unblock', 'lift', 'expiry'], true)) {
            $this->customer->forceFill([
                'is_blocked' => true, 'block_reason' => 'PRIVATE',
                'restriction_level' => $action === 'unblock' ? 'none' : 'temp_blocked',
                'restricted_until' => now()->subDay(),
            ])->save();
        }
    }

    private function act(string $action, ?int $reportId = null): void
    {
        match ($action) {
            'warning' => TrustSafetyService::issueWarning($this->customer, 'PRIVATE-REASON', 'PRIVATE-DESCRIPTION', $reportId),
            'temporary' => TrustSafetyService::issueTempBlock($this->customer, 7, 'PRIVATE-REASON', 'PRIVATE-DESCRIPTION'),
            'permanent' => TrustSafetyService::issuePermanentBlock($this->customer, 'PRIVATE-REASON', 'PRIVATE-DESCRIPTION'),
            'lift' => TrustSafetyService::liftRestriction($this->customer, 'PRIVATE-NOTE'),
            'expiry' => TrustSafetyService::checkAndExpireTempBlocks(),
            default => $this->postJson('/admin/api/customers/'.$this->customer->id.'/'.$action, ['reason' => 'PRIVATE-REASON'])->assertOk(),
        };
    }

    #[DataProvider('actions')]
    public function test_confirmed_action_persists_safe_notice_and_one_database_mail_job_despite_retry(string $action): void
    {
        $this->prepareAction($action);
        $report = UserReport::create([
            'reporter_id' => auth()->id(), 'reporter_type' => 'admin',
            'reported_user_id' => $this->customer->id, 'reported_type' => 'customer', 'reason' => 'PRIVATE',
        ]);
        $this->act($action, $report->id);
        $this->act($action, $report->id);
        $notice = $this->customer->notifications()->sole();
        $this->assertSame(EnforcementNotification::class, $notice->type);
        $this->assertStringContainsString('contact support', $notice->data['message']);
        $this->assertStringNotContainsString('PRIVATE', json_encode($notice->data));
        $this->assertDatabaseCount('jobs', 1);
        $this->assertDatabaseCount('audit_logs', 1);
        if (in_array($action, ['block', 'unblock'], true)) {
            $this->assertDatabaseCount('user_violations', 0);
        }
        if ($action === 'temporary') {
            $this->assertStringContainsString('7 days', $notice->data['message']);
            $this->assertStringContainsString('recorded restriction end', $notice->data['message']);
        }
        $payload = json_decode(DB::table('jobs')->sole()->payload, true);
        $job = unserialize($payload['data']['command']);
        $this->assertSame(['mail'], $job->channels);
        $this->assertSame($notice->id, $job->notification->id);
        $this->assertStringNotContainsString('PRIVATE', $payload['data']['command']);
        Mail::assertNothingSent();
    }

    public function test_direct_unblock_does_not_claim_access_restored_when_trust_restriction_remains(): void
    {
        TrustSafetyService::issuePermanentBlock($this->customer, 'PRIVATE');
        $this->act('unblock');
        $messages = $this->customer->notifications()->get()->pluck('data.message')->implode(' ');
        $this->assertStringContainsString('permanently restricted', $messages);
        $this->assertStringNotContainsString('no active access restriction', $messages);
        $this->assertTrue($this->customer->fresh()->isAccessRestricted());
        $this->assertDatabaseCount('user_violations', 1);
    }

    #[DataProvider('actions')]
    public function test_audit_failure_rolls_back_notices_jobs_and_enforcement(string $action): void
    {
        $this->prepareAction($action);
        $before = $this->customer->fresh()->getRawOriginal();
        $listener = 'eloquent.created: '.AuditLog::class;
        Event::listen($listener, fn () => throw new \RuntimeException('Audit failed'));
        $this->withoutExceptionHandling();
        try {
            $this->act($action);
            $this->fail('Expected audit failure');
        } catch (\RuntimeException $e) {
            $this->assertSame('Audit failed', $e->getMessage());
        } finally {
            Event::forget($listener);
        }
        $this->assertSame($before, $this->customer->fresh()->getRawOriginal());
        $this->assertDatabaseCount('notifications', 0);
        $this->assertDatabaseCount('jobs', 0);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_mail_failure_keeps_enforcement_and_notice_and_successful_job_replay_is_suppressed(): void
    {
        $this->act('permanent');
        $payload = json_decode(DB::table('jobs')->sole()->payload, true);
        $job = unserialize($payload['data']['command']);
        $channel = new class {
            public int $attempts = 0;
            public bool $fail = true;
            public function send($notifiable, $notification): void
            {
                $this->attempts++;
                if ($this->fail) {
                    throw new \RuntimeException('Simulated mail failure');
                }
            }
        };
        $manager = app(ChannelManager::class);
        $manager->extend('mail', fn () => $channel);
        try {
            $job->handle($manager);
            $this->fail('Expected mail failure');
        } catch (\RuntimeException $e) {
            $this->assertSame('Simulated mail failure', $e->getMessage());
        }
        $this->assertTrue($this->customer->fresh()->isAccessRestricted());
        $this->assertDatabaseCount('audit_logs', 1);
        $this->assertDatabaseCount('notifications', 1);
        $channel->fail = false;
        $job->handle($manager);
        $job->handle($manager);
        $this->assertSame(2, $channel->attempts);
        $this->assertNotEmpty($this->customer->notifications()->sole()->data['mail_sent_at']);
        $this->assertDatabaseCount('notifications', 1);
        $mail = $job->notification->toMail($this->customer);
        $this->assertSame('Permanent account restriction', $mail->subject);
        $this->assertStringNotContainsString('PRIVATE', implode(' ', $mail->introLines));
    }

    public function test_outer_rollback_removes_enforcement_and_both_notification_writes(): void
    {
        DB::beginTransaction();
        $this->act('permanent');
        $this->assertDatabaseCount('notifications', 1);
        $this->assertDatabaseCount('jobs', 1);
        DB::rollBack();
        $this->assertFalse($this->customer->fresh()->isAccessRestricted());
        $this->assertDatabaseCount('notifications', 0);
        $this->assertDatabaseCount('jobs', 0);
        $this->assertDatabaseCount('audit_logs', 0);
    }
}
