<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\OtpCode;
use App\Models\User;
use App\Models\UserViolation;
use App\Services\TrustSafetyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as GoogleUser;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AccountRestrictionSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        Notification::fake();
    }

    private function user(array $restrictions = [], array $attributes = []): User
    {
        $user = User::factory()->create(array_merge(['role' => 'customer', 'is_otp_enabled' => false], $attributes));
        $user->forceFill($restrictions)->save();
        return $user->fresh();
    }

    public static function restrictedStates(): array
    {
        return [
            'manual block' => [['is_blocked' => true]],
            'temporary' => [['restriction_level' => 'temp_blocked', 'restricted_until' => '2099-01-01 00:00:00']],
            'expired but not lifted' => [['restriction_level' => 'temp_blocked', 'restricted_until' => '2020-01-01 00:00:00']],
            'permanent' => [['restriction_level' => 'permanently_blocked']],
            'unknown state' => [['restriction_level' => 'unexpected']],
        ];
    }

    #[DataProvider('restrictedStates')]
    public function test_restricted_password_login_remains_guest_and_has_no_success_audit(array $state): void
    {
        $user = $this->user(array_merge($state, ['block_reason' => 'PRIVATE-REASON']));
        $before = $user->getRawOriginal();
        $message = match ($state['restriction_level'] ?? null) {
            'temp_blocked' => 'Your account is temporarily restricted. Please contact support for assistance.',
            'permanently_blocked' => 'Your account is permanently blocked. Please contact support for assistance.',
            default => 'Access to your account is restricted. Please contact support for assistance.',
        };
        $this->post('/login', ['email' => $user->email, 'password' => 'password', 'remember' => true])
            ->assertSessionHasErrors(['email' => $message])
            ->assertSessionMissing('auth.pending_flow')
            ->assertSessionMissing('auth.completed_verification');
        $this->assertGuest();
        $this->get('/dashboard')->assertRedirect(route('login'));
        $this->assertSame($before, $user->fresh()->getRawOriginal());
        $this->assertDatabaseMissing('audit_logs', ['event' => 'auth.login']);
        $this->assertDatabaseHas('audit_logs', ['event' => 'auth.login_failed']);
        $this->assertDatabaseCount('otp_codes', 0);
    }

    public function test_unknown_email_and_wrong_password_for_blocked_account_have_identical_generic_errors(): void
    {
        $user = $this->user(['is_blocked' => true, 'block_reason' => 'PRIVATE-REASON']);
        foreach (['unknown@example.test', $user->email] as $email) {
            $this->postJson('/login', ['email' => $email, 'password' => 'wrong-password'])
                ->assertUnprocessable()
                ->assertExactJson([
                    'message' => trans('auth.failed'),
                    'errors' => ['email' => [trans('auth.failed')]],
                ]);
            $this->assertGuest();
        }
        $this->assertDatabaseCount('otp_codes', 0);
        $this->assertDatabaseMissing('audit_logs', ['event' => 'auth.login']);
    }

    public static function incompleteVerification(): array
    {
        return ['OTP required' => [['is_otp_enabled' => true]], 'email unverified' => [['email_verified_at' => null]]];
    }

    #[DataProvider('incompleteVerification')]
    public function test_restriction_details_are_withheld_when_password_is_not_sufficient(array $attributes): void
    {
        $user = $this->user(['is_blocked' => true, 'restriction_level' => 'permanently_blocked'], $attributes);
        $this->postJson('/login', ['email' => $user->email, 'password' => 'password'])
            ->assertUnprocessable()
            ->assertExactJson([
                'message' => 'Unable to authenticate this account.',
                'errors' => ['code' => ['Unable to authenticate this account.']],
            ]);
        $this->assertGuest();
        $this->assertDatabaseCount('otp_codes', 0);
        $this->get('/dashboard')->assertRedirect(route('login'));
    }

    public static function protectedPaths(): array
    {
        return [
            'customer UI' => ['customer', 'GET', '/dashboard', false],
            'therapist UI' => ['therapist', 'GET', '/therapist/dashboard', false],
            'admin UI' => ['admin', 'GET', '/admin', false],
            'customer API' => ['customer', 'GET', '/api/profile-data', true],
            'password operation' => ['customer', 'PUT', '/password', true],
            'profile operation' => ['customer', 'PATCH', '/profile', true],
            'private broadcast' => ['customer', 'POST', '/broadcasting/auth', true],
        ];
    }

    #[DataProvider('protectedPaths')]
    public function test_existing_session_reloads_committed_restrictions_on_every_protected_request(string $role, string $method, string $path, bool $json): void
    {
        $user = $this->user(attributes: ['role' => $role]);
        $this->actingAs($user);
        $user->fresh()->forceFill(['is_blocked' => true, 'block_reason' => 'PRIVATE-REASON'])->save();
        $response = $json ? $this->json($method, $path, ['channel_name' => 'private-App.Models.User.'.$user->id, 'socket_id' => '1.2'])
            : $this->call($method, $path);
        if ($json) {
            $response->assertUnauthorized();
            $this->assertStringNotContainsString('PRIVATE-REASON', $response->getContent());
        } else {
            $response->assertRedirect(route('login'));
        }
        $this->assertGuest();
    }

    public function test_blocked_remembered_identity_cannot_restore_access(): void
    {
        $user = $this->user(['is_blocked' => true]);
        $cookie = $user->id.'|'.$user->remember_token.'|'.$user->getAuthPassword();
        $this->withCookie(Auth::guard()->getRecallerName(), $cookie)->get('/dashboard')->assertRedirect(route('login'));
        $this->assertGuest();
    }

    public function test_account_blocked_after_password_proof_cannot_consume_pending_otp(): void
    {
        $user = $this->user(attributes: ['is_otp_enabled' => true]);
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertRedirect(route('otp.form'));
        $otp = OtpCode::where('user_id', $user->id)->sole();
        $user->forceFill(['is_blocked' => true])->save();
        $this->postJson('/otp/verify', ['code' => $otp->code])->assertUnprocessable()
            ->assertJsonValidationErrors(['code' => 'Verification session expired. Please sign in again.']);
        $this->assertGuest();
        $this->assertFalse($otp->fresh()->is_used);
        $this->assertDatabaseMissing('audit_logs', ['event' => 'auth.otp_verified']);
        $this->assertDatabaseMissing('audit_logs', ['event' => 'auth.login']);
    }

    public static function googleAccounts(): array
    {
        return ['returning' => [true, false], 'email linking' => [false, false], 'pending OTP' => [true, true]];
    }

    #[DataProvider('googleAccounts')]
    public function test_blocked_google_identity_cannot_link_or_authenticate(bool $linked, bool $otp): void
    {
        $user = $this->user(['is_blocked' => true], ['google_id' => $linked ? 'stable-subject' : null, 'is_otp_enabled' => $otp]);
        $identity = (new GoogleUser)->setRaw(['email_verified' => true])->map([
            'id' => 'stable-subject', 'name' => $user->name, 'email' => $user->email, 'avatar' => null,
        ]);
        $driver = Mockery::mock();
        $driver->shouldReceive('user')->once()->andReturn($identity);
        Socialite::shouldReceive('driver')->with('google')->once()->andReturn($driver);
        $this->get('/auth/google/callback')->assertRedirect(route('login'))
            ->assertSessionHasErrors(['email' => 'Failed to authenticate with Google.']);
        $this->assertGuest();
        $this->assertSame($linked ? 'stable-subject' : null, $user->fresh()->google_id);
        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('otp_codes', 0);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_warning_only_account_can_complete_login_and_access_customer_api(): void
    {
        $user = $this->user(['restriction_level' => 'warned', 'strike_count' => 2]);
        $warning = UserViolation::create([
            'user_id' => $user->id, 'issued_by' => User::factory()->create(['role' => 'admin'])->id,
            'level' => 'warning', 'reason' => 'PRIVATE-WARNING', 'is_active' => true,
        ]);
        $before = $warning->fresh()->getRawOriginal();
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs($user);
        $this->getJson('/api/profile-data')->assertOk();
        $this->assertDatabaseHas('audit_logs', ['event' => 'auth.login', 'user_id' => $user->id]);
        $this->assertSame($before, $warning->fresh()->getRawOriginal());
        $this->assertSame('warned', $user->fresh()->restriction_level);
        $this->assertSame(2, $user->fresh()->strike_count);
    }

    public function test_logout_and_token_recovery_remain_available_without_lifting_block(): void
    {
        $user = $this->user(['is_blocked' => true]);
        $this->actingAs($user)->post('/logout')->assertRedirect('/');
        $this->assertGuest();
        $this->get('/forgot-password')->assertOk();
        $token = Password::createToken($user);
        $this->post('/reset-password', [
            'token' => $token, 'email' => $user->email,
            'password' => 'new-password', 'password_confirmation' => 'new-password',
        ])->assertRedirect(route('login'));
        $this->assertTrue($user->fresh()->is_blocked);
        $this->post('/login', ['email' => $user->email, 'password' => 'new-password'])
            ->assertSessionHasErrors(['email' => 'Access to your account is restricted. Please contact support for assistance.']);
        $this->assertGuest();
    }

    public function test_temp_expiry_requires_committed_lift_and_is_system_audited_once(): void
    {
        $user = $this->user(['is_blocked' => true, 'restriction_level' => 'temp_blocked', 'restricted_until' => now()->subMinute()]);
        $future = $this->user(['is_blocked' => true, 'restriction_level' => 'temp_blocked', 'restricted_until' => now()->addDay()]);
        $permanent = $this->user(['is_blocked' => true, 'restriction_level' => 'permanently_blocked', 'restricted_until' => now()->subDay()]);
        $this->actingAs($this->user(attributes: ['role' => 'admin']));
        $this->assertTrue($user->isAccessRestricted());
        $this->assertSame(1, TrustSafetyService::checkAndExpireTempBlocks());
        $this->assertSame(0, TrustSafetyService::checkAndExpireTempBlocks());
        $this->assertFalse($user->fresh()->isAccessRestricted());
        $this->assertTrue($future->fresh()->isAccessRestricted());
        $this->assertTrue($permanent->fresh()->isAccessRestricted());
        $audit = AuditLog::where('event', 'trust.restriction_lifted')->sole();
        $this->assertNull($audit->user_id);
        $this->assertNull($audit->user_role);
        $this->assertSame('automatic_expiry', $audit->metadata['source']);
        Notification::assertCount(1);
    }
}
