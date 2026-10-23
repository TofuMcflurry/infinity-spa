<?php

namespace Tests\Feature\Auth;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Auth\Passwords\DatabaseTokenRepository;
use Illuminate\Auth\Passwords\PasswordBroker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PasswordAuditIntegrityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        Notification::fake();
    }

    private function user(): User
    {
        return User::factory()->create(['role' => 'customer', 'is_otp_enabled' => false]);
    }

    private function resetData(User $user, string $token): array
    {
        return ['email' => $user->email, 'token' => $token, 'password' => 'replacement-password', 'password_confirmation' => 'replacement-password'];
    }

    private function changeData(): array
    {
        return ['current_password' => 'password', 'password' => 'replacement-password', 'password_confirmation' => 'replacement-password'];
    }

    private function assertSafeAudit(AuditLog $audit, User $user, array $secrets): void
    {
        $this->assertSame('User', $audit->target_type);
        $this->assertEquals($user->id, $audit->target_id);
        $this->assertNull($audit->metadata);
        $encoded = json_encode($audit->toArray());
        foreach (array_merge($secrets, [$user->email, 'replacement-password']) as $secret) {
            $this->assertStringNotContainsString($secret, $encoded);
        }
    }

    public function test_authenticated_change_is_persisted_and_audited_for_its_owner(): void
    {
        $user = $this->user();
        $oldHash = $user->password;
        $this->actingAs($user)->from('/profile')->put('/password', $this->changeData())
            ->assertRedirect('/profile')->assertSessionHasNoErrors();
        $this->assertTrue(Hash::check('replacement-password', $user->fresh()->password));
        $audit = AuditLog::where('event', 'auth.password_changed')->sole();
        $this->assertEquals($user->id, $audit->user_id);
        $this->assertSame('customer', $audit->user_role);
        $this->assertSafeAudit($audit, $user, [$oldHash, $user->fresh()->password]);
    }

    public static function invalidChanges(): array
    {
        return [
            'incorrect current password' => [['current_password' => 'wrong-password'], 'current_password'],
            'confirmation mismatch' => [['password_confirmation' => 'other-password'], 'password'],
            'too short' => [['password' => 'short', 'password_confirmation' => 'short'], 'password'],
            'missing current password' => [['current_password' => null], 'current_password'],
        ];
    }

    #[DataProvider('invalidChanges')]
    public function test_unsuccessful_change_never_mutates_or_audits(array $overrides, string $error): void
    {
        $user = $this->user();
        $before = $user->password;
        $this->actingAs($user)->put('/password', array_replace($this->changeData(), $overrides))->assertSessionHasErrors($error);
        $this->assertSame($before, $user->fresh()->password);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_broker_reset_consumes_token_and_emits_framework_success_only_after_commit(): void
    {
        $user = $this->user();
        $token = Password::createToken($user);
        $oldHash = $user->password;
        $oldRemember = $user->remember_token;
        $successes = [];
        Event::listen(PasswordReset::class, function (PasswordReset $event) use (&$successes, $token) {
            $this->assertFalse(Password::tokenExists($event->user, $token));
            $this->assertDatabaseHas('audit_logs', ['event' => 'auth.password_reset', 'target_id' => $event->user->id]);
            $successes[] = $event->user->id;
        });
        try {
            $this->post('/reset-password', $this->resetData($user, $token))
                ->assertRedirect(route('login'))->assertSessionHasNoErrors();
        } finally {
            Event::forget(PasswordReset::class);
        }
        $this->assertSame([$user->id], $successes);
        $this->assertGuest();
        $this->assertTrue(Hash::check('replacement-password', $user->fresh()->password));
        $this->assertNotSame($oldRemember, $user->fresh()->remember_token);
        $this->assertFalse(Password::tokenExists($user, $token));
        $audit = AuditLog::where('event', 'auth.password_reset')->sole();
        $this->assertNull($audit->user_id);
        $this->assertNull($audit->user_name);
        $this->assertNull($audit->user_role);
        $this->assertSafeAudit($audit, $user, [$token, $oldHash, $user->fresh()->password, $oldRemember, $user->fresh()->remember_token]);
    }

    public function test_reset_target_and_attribution_ignore_unrelated_ambient_identity(): void
    {
        $user = $this->user();
        $other = User::factory()->create(['role' => 'admin']);
        $otherHash = $other->password;
        $token = Password::createToken($user);
        // Populate an ambient identity only after guest middleware has admitted
        // the request, when the real broker resolves the credential target.
        $listener = 'eloquent.retrieved: '.User::class;
        Event::listen($listener, function (User $resolved) use ($user, $other) {
            if ($resolved->id === $user->id) {
                Auth::setUser($other);
            }
        });
        try {
            $this->post('/reset-password', $this->resetData($user, $token))->assertRedirect(route('login'));
        } finally {
            Event::forget($listener);
        }
        $audit = AuditLog::where('event', 'auth.password_reset')->sole();
        $this->assertEquals($user->id, $audit->target_id);
        $this->assertNull($audit->user_id);
        $this->assertNull($audit->user_name);
        $this->assertNull($audit->user_role);
        $this->assertTrue(Hash::check('replacement-password', $user->fresh()->password));
        $this->assertSame($otherHash, $other->fresh()->password);
    }

    public static function invalidResets(): array
    {
        return ['invalid token' => ['invalid'], 'expired token' => ['expired'], 'wrong account' => ['wrong_account'], 'validation failure' => ['validation']];
    }

    #[DataProvider('invalidResets')]
    public function test_invalid_reset_creates_no_success_audit(string $case): void
    {
        $user = $this->user();
        $other = $this->user();
        $token = Password::createToken($user);
        $before = $user->fresh()->getRawOriginal();
        $data = $this->resetData($user, $token);
        if ($case === 'invalid') { $data['token'] = 'invalid-token'; }
        if ($case === 'expired') { $this->travel(config('auth.passwords.users.expire') + 1)->minutes(); }
        if ($case === 'wrong_account') { $data['email'] = $other->email; }
        if ($case === 'validation') { $data['password_confirmation'] = 'mismatch'; }
        $this->post('/reset-password', $data)->assertSessionHasErrors($case === 'validation' ? 'password' : 'email');
        $this->assertSame($before, $user->fresh()->getRawOriginal());
        $this->assertDatabaseCount('audit_logs', 0);
        $this->assertGuest();
    }

    public function test_reused_reset_token_cannot_mutate_credentials_or_duplicate_audit(): void
    {
        $user = $this->user();
        $token = Password::createToken($user);
        $data = $this->resetData($user, $token);
        $this->post('/reset-password', $data)->assertRedirect(route('login'));
        $before = $user->fresh()->getRawOriginal();
        $data['password'] = $data['password_confirmation'] = 'another-password';
        $this->post('/reset-password', $data)->assertSessionHasErrors('email');
        $this->assertSame($before, $user->fresh()->getRawOriginal());
        $this->assertDatabaseCount('audit_logs', 1);
    }

    public function test_reset_link_request_is_not_a_credential_success_audit(): void
    {
        $user = $this->user();
        $this->post('/forgot-password', ['email' => $user->email])->assertSessionHasNoErrors();
        Notification::assertSentTo($user, \Illuminate\Auth\Notifications\ResetPassword::class);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public static function mutationTypes(): array
    {
        return ['authenticated change' => [false], 'broker reset' => [true]];
    }

    #[DataProvider('mutationTypes')]
    public function test_audit_failure_rolls_back_credentials_and_preserves_reset_token_for_retry(bool $reset): void
    {
        $user = $this->user();
        $token = $reset ? Password::createToken($user) : null;
        $before = $user->fresh()->getRawOriginal();
        $successes = [];
        Event::listen(PasswordReset::class, function ($event) use (&$successes) { $successes[] = $event; });
        $listener = 'eloquent.created: '.AuditLog::class;
        Event::listen($listener, fn () => throw new \RuntimeException('Audit persistence failed'));
        $this->withoutExceptionHandling();
        try {
            if ($reset) {
                $this->post('/reset-password', $this->resetData($user, $token));
            } else {
                $this->actingAs($user)->put('/password', $this->changeData());
            }
            $this->fail('Expected audit failure');
        } catch (\RuntimeException $e) {
            $this->assertSame('Audit persistence failed', $e->getMessage());
        } finally {
            Event::forget($listener);
            Event::forget(PasswordReset::class);
        }
        $this->assertSame($before, $user->fresh()->getRawOriginal());
        $this->assertSame([], $successes);
        $this->assertDatabaseCount('audit_logs', 0);
        if ($reset) {
            $this->assertTrue(Password::tokenExists($user, $token));
            $this->post('/reset-password', $this->resetData($user, $token))->assertRedirect(route('login'));
            $this->assertFalse(Password::tokenExists($user, $token));
        } else {
            $this->put('/password', $this->changeData())->assertRedirect();
        }
        $this->assertDatabaseCount('audit_logs', 1);
        $this->assertTrue(Hash::check('replacement-password', $user->fresh()->password));
    }

    public function test_token_deletion_failure_rolls_back_password_audit_and_token_consumption(): void
    {
        $user = $this->user();
        $token = Password::createToken($user);
        $before = $user->fresh()->getRawOriginal();
        $manager = Password::getFacadeRoot();
        $repository = new class(DB::connection(), Hash::driver(), config('auth.passwords.users.table'), 'local-fixture-key', 3600, 60) extends DatabaseTokenRepository {
            public function delete($user)
            {
                parent::delete($user);
                throw new \RuntimeException('Token deletion failed');
            }
        };
        $broker = new PasswordBroker($repository, Auth::createUserProvider('users'), app('events'));
        Password::partialMock()->shouldReceive('broker')->andReturn($broker);
        $successes = [];
        Event::listen(PasswordReset::class, function ($event) use (&$successes) { $successes[] = $event; });
        $this->withoutExceptionHandling();
        try {
            $this->post('/reset-password', $this->resetData($user, $token));
            $this->fail('Expected token deletion failure');
        } catch (\RuntimeException $e) {
            $this->assertSame('Token deletion failed', $e->getMessage());
        } finally {
            Password::swap($manager);
            Event::forget(PasswordReset::class);
        }
        $this->assertSame($before, $user->fresh()->getRawOriginal());
        $this->assertTrue(Password::tokenExists($user, $token));
        $this->assertSame([], $successes);
        $this->assertDatabaseCount('audit_logs', 0);
        $this->post('/reset-password', $this->resetData($user, $token))->assertRedirect(route('login'));
        $this->assertDatabaseCount('audit_logs', 1);
    }

    public function test_token_rechecked_under_user_lock_cannot_reuse_stale_broker_validation(): void
    {
        $user = $this->user();
        $token = Password::createToken($user);
        $before = $user->password;
        $manager = Password::getFacadeRoot();
        $repository = new class(DB::connection(), Hash::driver(), config('auth.passwords.users.table'), 'local-fixture-key', 3600, 60) extends DatabaseTokenRepository {
            public int $checks = 0;
            public function exists($user, $token)
            {
                $this->checks++;
                return $this->checks === 1 && parent::exists($user, $token);
            }
        };
        $broker = new PasswordBroker($repository, Auth::createUserProvider('users'), app('events'));
        Password::partialMock()->shouldReceive('broker')->andReturn($broker);
        try {
            $this->post('/reset-password', $this->resetData($user, $token))->assertSessionHasErrors('email');
        } finally {
            Password::swap($manager);
        }
        $this->assertSame(2, $repository->checks);
        $this->assertSame($before, $user->fresh()->password);
        $this->assertTrue(Password::tokenExists($user, $token));
        $this->assertDatabaseCount('audit_logs', 0);
    }
}
