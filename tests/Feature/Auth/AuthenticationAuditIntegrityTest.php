<?php

namespace Tests\Feature\Auth;

use App\Models\AuditLog;
use App\Models\OtpCode;
use App\Models\User;
use App\Services\OtpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as GoogleUser;
use Mockery;
use Tests\TestCase;

class AuthenticationAuditIntegrityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
    }

    private function challenge(User $user, array $attributes = []): OtpCode
    {
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])
            ->assertRedirect(route('otp.form'));
        $otp = OtpCode::where('user_id', $user->id)->where('is_used', false)->sole();
        $otp->update(array_merge(['code' => '123456'], $attributes));

        return $otp;
    }

    private function verify(User $user, string $code = '123456')
    {
        return $this->post('/otp/verify', ['email' => $user->email, 'code' => $code]);
    }

    private function assertAudit(string $event, User $user, array $metadata): void
    {
        $rows = AuditLog::where('event', $event)->get();
        $this->assertCount(1, $rows);
        $row = $rows->first();
        $this->assertSame($user->id, $row->user_id);
        $this->assertSame($user->name, $row->user_name);
        $this->assertSame($user->role, $row->user_role);
        $this->assertSame('User', $row->target_type);
        $this->assertSame($user->id, $row->target_id);
        $this->assertSame($metadata, $row->metadata);
    }

    private function google(User $user): void
    {
        $identity = (new GoogleUser)->setRaw(['email_verified' => true])->map([
            'id' => $user->google_id ?: 'fake-google-id',
            'email' => $user->email,
            'name' => $user->name,
            'avatar' => null,
        ]);
        $provider = Mockery::mock();
        $provider->shouldReceive('user')->once()->andReturn($identity);
        Socialite::shouldReceive('driver')->with('google')->once()->andReturn($provider);
    }

    public function test_verified_password_login_records_one_completed_sign_in(): void
    {
        $user = User::factory()->state(['role' => 'customer'])->create(['is_otp_enabled' => false]);
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])
            ->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs($user);
        $this->assertAudit('auth.login', $user, ['name' => $user->name, 'role' => $user->role]);
        $this->assertDatabaseCount('audit_logs', 1);
    }

    public function test_password_email_challenge_is_not_a_completed_login(): void
    {
        $user = User::factory()->state(['role' => 'customer'])->unverified()->create(['is_otp_enabled' => true]);
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])
            ->assertRedirect(route('otp.form'));
        $this->assertGuest();
        $this->assertDatabaseCount('audit_logs', 0);
        $code = OtpCode::where('user_id', $user->id)->sole()->code;
        $this->verify($user, $code)->assertRedirect('/dashboard');
        $this->assertAudit('auth.login', $user, ['name' => $user->name, 'role' => $user->role]);
        $this->assertAudit('auth.otp_verified', $user, ['name' => $user->name]);
        $this->assertDatabaseCount('audit_logs', 2);
    }

    public function test_pending_otp_is_not_authenticated_or_audited_on_password_path(): void
    {
        $user = User::factory()->state(['role' => 'customer'])->create(['is_otp_enabled' => true, 'otp_verified_at' => null]);
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])
            ->assertRedirect(route('otp.form'));
        $this->assertGuest();
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_historical_otp_verification_cannot_complete_a_new_password_login(): void
    {
        $user = User::factory()->state(['role' => 'customer'])->create(['is_otp_enabled' => true, 'otp_verified_at' => now()]);
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertRedirect(route('otp.form'));
        $this->assertGuest();
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_failed_password_login_keeps_existing_failure_audit_only(): void
    {
        $user = User::factory()->state(['role' => 'customer'])->create();
        $this->post('/login', ['email' => $user->email, 'password' => 'wrong-secret'])
            ->assertSessionHasErrors('email');
        $this->assertGuest();
        $this->assertDatabaseCount('audit_logs', 1);
        $row = AuditLog::sole();
        $this->assertSame('auth.login_failed', $row->event);
        $this->assertArrayNotHasKey('password', $row->metadata);
    }

    public function test_successful_otp_and_replay_create_only_one_pair_of_audits(): void
    {
        $user = User::factory()->state(['role' => 'customer'])->unverified()->create(['is_otp_enabled' => true]);
        $otp = $this->challenge($user);
        $this->verify($user)->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs($user);
        $this->assertTrue($otp->refresh()->is_used);
        $this->assertTrue($user->refresh()->isFullyVerified());
        $this->assertAudit('auth.otp_verified', $user, ['name' => $user->name]);
        $this->assertAudit('auth.login', $user, ['name' => $user->name, 'role' => $user->role]);
        Auth::logout();
        $this->verify($user)->assertSessionHasErrors('code');
        $this->assertGuest();
        $this->assertDatabaseCount('audit_logs', 2);
    }

    public function test_invalid_expired_used_and_malformed_codes_do_not_verify_or_audit(): void
    {
        $user = User::factory()->state(['role' => 'customer'])->unverified()->create();
        $otp = $this->challenge($user, ['expires_at' => now()->subSecond()]);
        $this->verify($user)->assertSessionHasErrors('code');
        $otp->update(['expires_at' => now()->addMinutes(10), 'is_used' => true]);
        $this->verify($user)->assertSessionHasErrors('code');
        $otp->update(['is_used' => false]);
        $this->verify($user, '999999')->assertSessionHasErrors('code');
        $this->verify($user, 'short')->assertSessionHasErrors('code');
        $this->assertGuest();
        $this->assertNull($user->refresh()->email_verified_at);
        $this->assertNull($user->otp_verified_at);
        $this->assertFalse($otp->refresh()->is_used);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_audit_failure_rolls_back_challenge_user_and_prior_audit_and_allows_retry(): void
    {
        $user = User::factory()->state(['role' => 'customer'])->unverified()->create(['is_otp_enabled' => true]);
        $otp = $this->challenge($user);
        $fail = true;
        Event::listen('eloquent.creating: '.AuditLog::class, function (AuditLog $row) use (&$fail) {
            if ($fail && $row->event === 'auth.login') {
                throw new \RuntimeException('simulated audit failure');
            }
        });
        $this->verify($user)->assertStatus(500);
        $this->assertGuest();
        $this->assertFalse($otp->refresh()->is_used);
        $this->assertNull($user->refresh()->otp_verified_at);
        $this->assertNull($user->email_verified_at);
        $this->assertDatabaseCount('audit_logs', 0);
        $fail = false;
        $this->challenge($user);
        $this->verify($user)->assertRedirect('/dashboard');
        $this->assertDatabaseCount('audit_logs', 2);
    }

    public function test_stale_user_instances_cannot_reconsume_the_same_challenge(): void
    {
        $user = User::factory()->state(['role' => 'customer'])->unverified()->create();
        $staleUser = User::findOrFail($user->id);
        $otp = $this->challenge($user);
        $service = app(OtpService::class);
        $this->assertTrue($service->verifyOtp($user, '123456', $otp->id));
        $this->assertFalse($service->verifyOtp($staleUser, '123456', $otp->id));
    }

    public function test_challenge_selection_takes_a_postgres_row_lock_inside_a_transaction(): void
    {
        $user = User::factory()->state(['role' => 'customer'])->unverified()->create();
        $otp = $this->challenge($user);
        $locked = false;
        $outerLevel = DB::transactionLevel();
        DB::listen(function ($query) use (&$locked, $outerLevel) {
            if (str_contains($query->sql, '"otp_codes"') && str_contains($query->sql, 'for update')) {
                $locked = true;
                $this->assertGreaterThan($outerLevel, DB::transactionLevel());
                $this->assertStringContainsString('"is_used" = ?', $query->sql);
                $this->assertStringContainsString('"expires_at" > ?', $query->sql);
            }
        });
        $this->assertTrue(app(OtpService::class)->verifyOtp($user, '123456', $otp->id));
        $this->assertTrue($locked);
    }

    public function test_user_verification_failure_rolls_back_challenge_consumption(): void
    {
        $user = User::factory()->state(['role' => 'customer'])->unverified()->create();
        $otp = $this->challenge($user);
        Event::listen('eloquent.updating: '.User::class, function (User $updating) use ($user) {
            if ($updating->id === $user->id && $updating->isDirty('otp_verified_at')) {
                throw new \RuntimeException('simulated verification write failure');
            }
        });
        $this->verify($user)->assertStatus(500);
        $this->assertGuest();
        $this->assertFalse($otp->refresh()->is_used);
        $this->assertNull($user->refresh()->email_verified_at);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_new_google_account_records_database_default_actor_role(): void
    {
        $user = User::factory()->state(['role' => 'customer'])->make(['is_otp_enabled' => false]);
        $this->google($user);
        $this->get('/auth/google/callback')->assertRedirect('/dashboard');
        $created = User::where('email', $user->email)->sole();
        $this->assertAuthenticatedAs($created);
        $this->assertAudit('auth.google_login', $created, ['name' => $created->name]);
        $this->assertDatabaseCount('audit_logs', 1);
    }

    public function test_google_audit_failure_rolls_back_linking_and_clears_authentication(): void
    {
        $user = User::factory()->state(['role' => 'customer'])->create(['google_id' => null, 'is_otp_enabled' => false]);
        $this->google($user);
        Event::listen('eloquent.creating: '.AuditLog::class, function () {
            throw new \RuntimeException('simulated audit write failure');
        });
        $this->get('/auth/google/callback')->assertRedirect(route('login'))->assertSessionHasErrors('email');
        $this->assertGuest();
        $this->assertNull($user->refresh()->google_id);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_google_login_records_provider_specific_completion_and_links_existing_account(): void
    {
        $user = User::factory()->state(['role' => 'customer'])->create(['google_id' => null, 'is_otp_enabled' => false]);
        $this->google($user);
        $this->get('/auth/google/callback')->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs($user);
        $this->assertSame('fake-google-id', $user->refresh()->google_id);
        $this->assertAudit('auth.google_login', $user, ['name' => $user->name]);
        $this->assertDatabaseCount('audit_logs', 1);
    }

    public function test_google_pending_otp_defers_login_audit_until_one_successful_verification(): void
    {
        $user = User::factory()->state(['role' => 'customer'])->create(['google_id' => 'google-otp', 'is_otp_enabled' => true]);
        $this->google($user);
        $this->get('/auth/google/callback')->assertRedirect(route('otp.form'));
        $this->assertGuest();
        $this->assertDatabaseCount('audit_logs', 0);
        $code = OtpCode::where('user_id', $user->id)->sole()->code;
        $this->verify($user, $code)->assertRedirect('/dashboard');
        $this->assertAudit('auth.google_login', $user, ['name' => $user->name]);
        $this->assertAudit('auth.otp_verified', $user, ['name' => $user->name]);
        $this->assertDatabaseCount('audit_logs', 2);
        $this->verify($user, $code)->assertSessionHasErrors('code');
        $this->assertDatabaseCount('audit_logs', 2);
    }

    public function test_google_pending_context_cannot_attribute_another_users_otp(): void
    {
        $googleUser = User::factory()->state(['role' => 'customer'])->create(['google_id' => 'google-otp', 'is_otp_enabled' => true]);
        $this->google($googleUser);
        $this->get('/auth/google/callback');
        $other = User::factory()->state(['role' => 'customer'])->unverified()->create();
        $this->challenge($other);
        $this->verify($other)->assertRedirect('/dashboard');
        $this->assertAudit('auth.login', $other, ['name' => $other->name, 'role' => $other->role]);
        $this->assertDatabaseMissing('audit_logs', ['event' => 'auth.google_login']);
    }

    public function test_google_existing_unverified_account_is_not_claimed_as_fully_verified(): void
    {
        $user = User::factory()->state(['role' => 'customer'])->unverified()->create(['is_otp_enabled' => false]);
        $this->google($user);
        $this->get('/auth/google/callback')->assertRedirect(route('otp.form'));
        $this->assertGuest();
        $this->assertDatabaseCount('audit_logs', 0);
        $this->assertNull($user->refresh()->email_verified_at);
    }

    public function test_failed_google_identity_validation_does_not_authenticate_or_audit(): void
    {
        $provider = Mockery::mock();
        $provider->shouldReceive('user')->once()->andThrow(new \RuntimeException('fake provider failure'));
        Socialite::shouldReceive('driver')->with('google')->once()->andReturn($provider);
        $this->get('/auth/google/callback')->assertRedirect(route('login'))->assertSessionHasErrors('email');
        $this->assertGuest();
        $this->assertDatabaseCount('audit_logs', 0);
    }
}
