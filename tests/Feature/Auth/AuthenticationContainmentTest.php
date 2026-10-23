<?php

namespace Tests\Feature\Auth;

use App\Models\AuditLog;
use App\Models\OtpCode;
use App\Models\User;
use App\Services\AuthenticationFlowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as GoogleUser;
use Mockery;
use Tests\TestCase;

class AuthenticationContainmentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
    }

    private function user(array $attributes = []): User
    {
        return User::factory()->create(array_merge([
            'role' => 'customer', 'is_otp_enabled' => true, 'otp_verified_at' => null,
        ], $attributes));
    }

    private function login(User $user, array $extra = []): OtpCode
    {
        $this->post('/login', array_merge(['email' => $user->email, 'password' => 'password'], $extra))
            ->assertRedirect(route('otp.form'));
        $this->assertGuest();

        return OtpCode::where('user_id', $user->id)->where('is_used', false)->sole();
    }

    private function verify(string $code, array $extra = [])
    {
        return $this->postJson('/otp/verify', array_merge(['code' => $code], $extra));
    }

    private function provider(User $user, array $raw = ['email_verified' => true], ?string $id = null): void
    {
        $identity = (new GoogleUser)->setRaw($raw)->map([
            'id' => $id ?? ($user->google_id ?: 'fake-subject'),
            'name' => $user->name, 'email' => $user->email, 'avatar' => null,
        ]);
        $driver = Mockery::mock();
        $driver->shouldReceive('user')->once()->andReturn($identity);
        Socialite::shouldReceive('driver')->with('google')->once()->andReturn($driver);
    }

    public function test_pending_credentials_grant_no_customer_therapist_admin_or_broadcast_access(): void
    {
        foreach (['customer', 'therapist', 'admin'] as $role) {
            $user = $this->user(['role' => $role]);
            $this->login($user, ['remember' => true]);
            foreach (['/dashboard', '/therapist/dashboard', '/admin', '/api/profile-data', '/profile'] as $path) {
                $this->get($path)->assertRedirect(route('login'));
            }
            foreach (['/otp/disable', '/api/addresses', '/broadcasting/auth'] as $path) {
                $this->postJson($path, [])->assertUnauthorized();
            }
            $this->assertGuest();
            $this->assertDatabaseMissing('audit_logs', ['event' => 'auth.login']);
        }
    }

    public function test_legacy_authenticated_sessions_cannot_use_any_role_to_bypass_otp(): void
    {
        foreach (['customer' => '/dashboard', 'therapist' => '/therapist/dashboard', 'admin' => '/admin'] as $role => $path) {
            $user = $this->user(['role' => $role, 'otp_verified_at' => now()]);
            $this->actingAs($user)->get($path)->assertRedirect(route('login'));
            $this->assertGuest();
        }
    }

    public function test_unverified_email_is_denied_even_when_otp_is_disabled(): void
    {
        foreach (['customer' => '/dashboard', 'therapist' => '/therapist/dashboard', 'admin' => '/admin'] as $role => $path) {
            $user = $this->user(['role' => $role, 'email_verified_at' => null, 'is_otp_enabled' => false]);
            $this->actingAs($user)->get($path)->assertRedirect(route('login'));
            $this->assertGuest();
        }
    }

    public function test_valid_remember_cookie_without_session_otp_proof_cannot_restore_access(): void
    {
        $user = $this->user(['role' => 'admin', 'otp_verified_at' => now()]);
        $cookie = $user->id.'|'.$user->remember_token.'|'.$user->getAuthPassword();
        $this->withCookie(Auth::guard()->getRecallerName(), $cookie)
            ->get('/admin')->assertRedirect(route('login'));
        $this->assertGuest();
    }

    public function test_every_role_receives_correct_destination_and_access_after_bound_otp(): void
    {
        foreach (['customer' => '/dashboard', 'therapist' => '/therapist/dashboard', 'admin' => '/admin'] as $role => $path) {
            $user = $this->user(['role' => $role]);
            $otp = $this->login($user);
            $this->verify($otp->code)->assertRedirect($path);
            $this->assertAuthenticatedAs($user);
            $this->get($path)->assertOk();
            $this->post('/logout')->assertRedirect('/');
        }
    }

    public function test_public_email_and_valid_code_without_flow_cannot_issue_or_authenticate(): void
    {
        $user = $this->user();
        $otp = OtpCode::create(['user_id' => $user->id, 'code' => '123456', 'expires_at' => now()->addMinutes(10), 'is_used' => false]);
        foreach ([$user->email, 'nonexistent@example.test'] as $email) {
            $this->postJson('/otp/send', ['email' => $email])->assertUnprocessable()->assertJsonValidationErrors('code');
            $this->verify($otp->code, ['email' => $email, 'auth.pending_flow' => str_repeat('a', 64)])
                ->assertUnprocessable()->assertJsonValidationErrors('code');
        }
        $this->assertGuest();
        $this->assertFalse($otp->refresh()->is_used);
        $this->assertDatabaseCount('otp_codes', 1);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_email_and_method_parameters_cannot_retarget_a_bound_flow(): void
    {
        $owner = $this->user();
        $other = $this->user();
        $otp = $this->login($owner);
        $this->verify($otp->code, ['email' => $other->email, 'method' => 'google', 'user_id' => $other->id])
            ->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs($owner);
        $this->assertDatabaseHas('audit_logs', ['event' => 'auth.login', 'target_id' => $owner->id]);
        $this->assertDatabaseMissing('audit_logs', ['event' => 'auth.google_login']);
        $this->assertNull($other->refresh()->otp_verified_at);
    }

    public function test_challenge_cannot_be_used_after_session_flow_is_lost(): void
    {
        $user = $this->user();
        $otp = $this->login($user);
        $id = session('auth.pending_flow');
        session()->forget('auth.pending_flow');
        $this->verify($otp->code, ['email' => $user->email, 'flow_id' => $id])->assertUnprocessable();
        $this->assertGuest();
        $this->assertFalse($otp->refresh()->is_used);
    }

    public function test_another_challenge_for_the_same_account_is_not_accepted(): void
    {
        $user = $this->user();
        $otp = $this->login($user);
        $extra = OtpCode::create(['user_id' => $user->id, 'code' => '222222', 'expires_at' => now()->addMinutes(10), 'is_used' => false]);
        $otp->update(['code' => '111111']);
        $this->verify($extra->code)->assertUnprocessable();
        $this->assertGuest();
        $this->assertFalse($extra->refresh()->is_used);
        $this->verify($otp->code)->assertRedirect('/dashboard');
    }

    public function test_flow_expiry_prevents_resend_and_consumption(): void
    {
        $otp = $this->login($this->user());
        $this->travel(601)->seconds();
        $this->verify($otp->code)->assertUnprocessable();
        $this->postJson('/otp/send')->assertUnprocessable();
        $this->assertGuest();
        $this->assertFalse($otp->refresh()->is_used);
    }

    public function test_five_attempts_exhaust_a_flow_even_if_the_next_code_is_correct(): void
    {
        $otp = $this->login($this->user());
        $otp->update(['code' => '111111']);
        for ($i = 0; $i < 5; $i++) {
            $this->verify('000000')->assertUnprocessable();
        }
        $this->verify($otp->code)->assertUnprocessable();
        $this->assertGuest();
        $this->assertFalse($otp->refresh()->is_used);
        $this->assertDatabaseCount('audit_logs', 0);
        $this->assertTrue(DB::table('cache')->where('key', 'like', '%auth-budget:%')->exists());
    }

    public function test_account_attempt_budget_survives_new_sessions_and_challenges(): void
    {
        $user = $this->user();
        $otp = $this->login($user);
        $otp->update(['code' => '111111']);
        for ($i = 0; $i < 5; $i++) {
            $this->verify('000000')->assertUnprocessable();
        }
        $this->post('/logout');
        $next = $this->login($user);
        $this->verify($next->code)->assertUnprocessable();
        $this->assertGuest();
        $this->assertFalse($next->refresh()->is_used);
    }

    public function test_ip_budget_is_shared_across_accounts_and_sessions(): void
    {
        for ($i = 0; $i < 30; $i++) {
            $this->verify('000000')->assertUnprocessable();
        }
        $otp = $this->login($this->user());
        $this->verify($otp->code)->assertUnprocessable();
        $this->assertGuest();
        $this->assertFalse($otp->refresh()->is_used);
    }

    public function test_resend_obeys_cooldown_replaces_exact_challenge_and_preserves_account(): void
    {
        $user = $this->user();
        $other = $this->user();
        $old = $this->login($user);
        $this->postJson('/otp/send', ['email' => $other->email])->assertUnprocessable();
        $this->travel(61)->seconds();
        $this->postJson('/otp/send', ['email' => $other->email])->assertOk();
        $new = OtpCode::where('user_id', $user->id)->sole();
        $this->assertNotSame($old->id, $new->id);
        $this->assertDatabaseMissing('otp_codes', ['user_id' => $other->id]);
        $new->update(['code' => '333333']);
        $wrong = $old->code === '333333' ? '444444' : $old->code;
        $this->verify($wrong)->assertUnprocessable();
        $this->verify($new->code)->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs($user);
    }

    public function test_resend_does_not_extend_original_flow_lifetime(): void
    {
        $user = $this->user();
        $this->login($user);
        $this->travel(590)->seconds();
        $this->postJson('/otp/send')->assertOk();
        $otp = OtpCode::where('user_id', $user->id)->sole();
        $this->travel(11)->seconds();
        $this->verify($otp->code)->assertUnprocessable();
        $this->assertGuest();
    }

    public function test_issuance_budget_survives_restarting_the_login_flow(): void
    {
        $user = $this->user();
        $this->login($user);
        for ($i = 0; $i < 3; $i++) {
            $this->travel(61)->seconds();
            $this->postJson('/otp/send')->assertOk();
        }
        $this->travel(61)->seconds();
        $this->postJson('/otp/send')->assertUnprocessable();
        $this->post('/logout');
        $this->postJson('/login', ['email' => $user->email, 'password' => 'password'])->assertUnprocessable();
        $this->assertGuest();
    }

    public function test_password_email_role_and_google_link_changes_invalidate_pending_proof(): void
    {
        foreach ([['password' => Hash::make('changed-password')], ['email' => 'changed@example.test'], ['role' => 'admin'], ['google_id' => 'changed-subject']] as $change) {
            $user = $this->user();
            $otp = $this->login($user);
            $user->update($change);
            $this->verify($otp->code)->assertUnprocessable();
            $this->assertGuest();
            $this->assertFalse($otp->refresh()->is_used);
        }
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_email_change_invalidates_completed_session_access(): void
    {
        $user = $this->user();
        $otp = $this->login($user);
        $this->verify($otp->code)->assertRedirect('/dashboard');
        $this->patch('/profile', ['name' => $user->name, 'email' => 'new-address@example.test'])
            ->assertRedirect('/profile');
        $this->get('/dashboard')->assertRedirect(route('login'));
        $this->assertGuest();
        $this->assertNull($user->refresh()->email_verified_at);
    }

    public function test_guest_logout_revokes_the_server_flow_even_if_old_session_state_is_restored(): void
    {
        $otp = $this->login($this->user());
        $id = session('auth.pending_flow');
        $this->post('/logout')->assertRedirect('/');
        $this->withSession(['auth.pending_flow' => $id]);
        $this->verify($otp->code)->assertUnprocessable();
        $this->assertGuest();
        $this->assertFalse($otp->refresh()->is_used);
    }

    public function test_failed_or_malformed_unrelated_login_revokes_google_attribution(): void
    {
        foreach ([['email' => 'other@example.test', 'password' => 'wrong-password'], ['email' => 'not-email']] as $attempt) {
            $user = $this->user(['google_id' => 'google-'.uniqid()]);
            $this->provider($user);
            $this->get('/auth/google/callback')->assertRedirect(route('otp.form'));
            $id = session('auth.pending_flow');
            $otp = OtpCode::where('user_id', $user->id)->sole();
            $this->post('/login', $attempt)->assertSessionHasErrors('email');
            $this->withSession(['auth.pending_flow' => $id]);
            $this->verify($otp->code)->assertUnprocessable();
            $this->assertGuest();
        }
        $this->assertDatabaseMissing('audit_logs', ['event' => 'auth.google_login']);
    }

    public function test_google_requires_verified_email_evidence_and_rejects_conflicting_links(): void
    {
        foreach ([[], ['email_verified' => false], ['email_verified' => 'true']] as $raw) {
            $user = $this->user(['is_otp_enabled' => false]);
            $this->provider($user, $raw);
            $this->get('/auth/google/callback')->assertRedirect(route('login'))->assertSessionHasErrors('email');
            $this->assertGuest();
            $this->assertNull($user->refresh()->google_id);
        }
        $linked = $this->user(['google_id' => 'original-subject']);
        $this->provider($linked, ['email_verified' => true], 'different-subject');
        $this->get('/auth/google/callback')->assertRedirect(route('login'))->assertSessionHasErrors('email');
        $this->assertGuest();
        $this->assertSame('original-subject', $linked->refresh()->google_id);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_google_unverified_local_email_requires_owned_otp_before_admission(): void
    {
        $user = $this->user(['is_otp_enabled' => false, 'email_verified_at' => null]);
        $this->provider($user);
        $this->get('/auth/google/callback')->assertRedirect(route('otp.form'));
        $this->assertGuest();
        $this->assertDatabaseCount('audit_logs', 0);
        $otp = OtpCode::where('user_id', $user->id)->sole();
        $this->verify($otp->code)->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs($user);
        $this->assertDatabaseHas('audit_logs', ['event' => 'auth.google_login', 'user_id' => $user->id]);
        $this->assertDatabaseMissing('audit_logs', ['event' => 'auth.login']);
    }

    public function test_registration_bound_otp_completes_without_public_account_selection(): void
    {
        $this->post('/register', ['name' => 'New Customer', 'email' => 'new@example.test', 'password' => 'password', 'password_confirmation' => 'password'])
            ->assertRedirect(route('otp.form'));
        $this->assertGuest();
        $user = User::where('email', 'new@example.test')->sole();
        $otp = OtpCode::where('user_id', $user->id)->sole();
        $this->verify($otp->code)->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs($user);
        $this->get('/dashboard')->assertOk();
        $this->assertDatabaseCount('audit_logs', 2);
    }

    public function test_registering_an_existing_email_cannot_create_its_verification_flow(): void
    {
        $user = $this->user();
        $this->post('/register', ['name' => 'Attacker', 'email' => $user->email, 'password' => 'attacker-password', 'password_confirmation' => 'attacker-password'])
            ->assertSessionHasErrors('email');
        $this->postJson('/otp/send', ['email' => $user->email])->assertUnprocessable();
        $this->assertGuest();
        $this->assertDatabaseCount('otp_codes', 0);
    }

    public function test_password_rehashing_is_preserved_without_early_authentication(): void
    {
        $user = $this->user();
        $oldHash = $user->getAuthPassword();
        Hash::driver()->setRounds(5);
        $this->login($user);
        $this->assertNotSame($oldHash, $user->refresh()->getAuthPassword());
        $this->assertTrue(Hash::check('password', $user->getAuthPassword()));
        $this->assertGuest();
    }

    public function test_password_reset_revokes_pending_flow_and_still_requires_otp_on_next_login(): void
    {
        $user = $this->user();
        $token = Password::broker()->createToken($user);
        $old = $this->login($user);
        $id = session('auth.pending_flow');
        $this->post('/reset-password', [
            'email' => $user->email, 'token' => $token,
            'password' => 'replacement-password', 'password_confirmation' => 'replacement-password',
        ])->assertRedirect(route('login'));
        $this->assertGuest();
        $this->withSession(['auth.pending_flow' => $id]);
        $this->verify($old->code)->assertUnprocessable();
        $this->post('/login', ['email' => $user->email, 'password' => 'replacement-password'])
            ->assertRedirect(route('otp.form'));
        $this->assertGuest();
        $next = OtpCode::where('user_id', $user->id)->where('is_used', false)->sole();
        $this->verify($next->code)->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs($user);
    }

    public function test_storage_failure_fails_closed_without_local_counter_fallback(): void
    {
        $user = $this->user();
        Cache::partialMock()->shouldReceive('store')->with('database')->andThrow(new \RuntimeException('simulated storage unavailable'));
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertStatus(500);
        $this->assertGuest();
        $this->assertDatabaseCount('otp_codes', 0);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_real_database_session_persists_only_pending_flow_until_otp_succeeds(): void
    {
        config(['session.driver' => 'database']);
        app('session')->forgetDrivers();
        app()->forgetInstance('session.store');
        $user = $this->user();
        $otp = $this->login($user, ['remember' => true]);
        $id = session()->getId();
        $row = DB::table('sessions')->where('id', $id)->first();
        $this->assertNotNull($row);
        $this->assertNull($row->user_id);
        $this->assertNotEmpty(session('auth.pending_flow'));
        $this->assertFalse(session()->has(Auth::guard()->getName()));
        $this->verify($otp->code)->assertRedirect('/dashboard');
        $this->assertNotSame($id, session()->getId());
        $this->assertAuthenticatedAs($user);
    }

    private function issuanceCount(User $user): int
    {
        return Cache::store('database')->get('auth-budget:'.hash('sha256', 'issue:user:'.$user->id))['count'] ?? 0;
    }

    public function test_failed_initial_mail_delivery_keeps_allowances_and_eventually_blocks_retries(): void
    {
        $user = $this->user();
        Mail::shouldReceive('send')->times(4)->andThrow(new \RuntimeException('simulated mail failure'));
        for ($i = 1; $i <= 4; $i++) {
            $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertStatus(500);
            $this->assertSame($i, $this->issuanceCount($user));
            $this->assertGuest();
        }
        $this->postJson('/login', ['email' => $user->email, 'password' => 'password'])->assertUnprocessable();
        $this->assertSame(4, $this->issuanceCount($user));
        $this->assertDatabaseCount('otp_codes', 0);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_failed_resend_mail_keeps_cooldown_resend_count_and_allowances(): void
    {
        $user = $this->user();
        $old = $this->login($user);
        Mail::shouldReceive('send')->times(3)->andThrow(new \RuntimeException('simulated resend mail failure'));
        for ($i = 1; $i <= 3; $i++) {
            $this->travel(61)->seconds();
            $this->postJson('/otp/send')->assertStatus(500);
            $this->assertSame($i + 1, $this->issuanceCount($user));
            $flow = Cache::store('database')->get('auth-flow:'.session('auth.pending_flow'));
            $this->assertSame($i, $flow['resends']);
            $this->assertSame($old->id, $flow['challenge_id']);
            $this->postJson('/otp/send')->assertUnprocessable();
        }
        $this->travel(61)->seconds();
        $this->postJson('/otp/send')->assertUnprocessable();
        $this->assertSame(4, $this->issuanceCount($user));
        $this->assertDatabaseCount('otp_codes', 1);
        $this->assertFalse($old->refresh()->is_used);
        $this->assertGuest();
    }

    public function test_flow_write_failure_after_resend_mail_does_not_refund_committed_reservation(): void
    {
        $user = $this->user();
        $old = $this->login($user);
        $flowKey = Cache::store('database')->getStore()->getPrefix().'auth-flow:'.session('auth.pending_flow');
        $sent = false;
        Mail::shouldReceive('send')->once()->andReturnUsing(function () use (&$sent) { $sent = true; });
        DB::listen(function ($query) use (&$sent, $flowKey) {
            if ($sent && str_contains($query->sql, 'insert into "cache"') && in_array($flowKey, $query->bindings, true)) {
                throw new \RuntimeException('simulated post-delivery flow write failure');
            }
        });
        $this->travel(61)->seconds();
        $this->postJson('/otp/send')->assertStatus(500);
        $this->assertTrue($sent);
        $this->assertSame(2, $this->issuanceCount($user));
        $flow = Cache::store('database')->get('auth-flow:'.session('auth.pending_flow'));
        $this->assertSame(1, $flow['resends']);
        $this->assertSame($old->id, $flow['challenge_id']);
        $this->postJson('/otp/send')->assertUnprocessable();
        $this->assertDatabaseCount('otp_codes', 1);
        $this->assertGuest();
    }

    public function test_google_otp_database_failure_cannot_refund_issuance_or_authenticate(): void
    {
        $user = $this->user(['google_id' => null]);
        $this->provider($user);
        \Illuminate\Support\Facades\Event::listen('eloquent.created: '.OtpCode::class, function () {
            throw new \RuntimeException('simulated Google OTP mutation failure');
        });
        Mail::shouldReceive('send')->never();
        $this->get('/auth/google/callback')->assertRedirect(route('login'))->assertSessionHasErrors('email');
        $this->assertSame(1, $this->issuanceCount($user));
        $this->assertSame('fake-subject', $user->refresh()->google_id);
        $this->assertDatabaseCount('otp_codes', 0);
        $this->assertDatabaseCount('audit_logs', 0);
        $this->assertGuest();
    }

    public function test_application_outer_transaction_is_rejected_before_any_issuance(): void
    {
        $user = $this->user();
        $this->login($user);
        $request = Request::create('/otp/send', 'POST');
        $request->setLaravelSession(app('session.store'));
        Mail::shouldReceive('send')->never();
        foreach (['begin', 'resend'] as $method) {
            try {
                DB::transaction(function () use ($method, $user, $request) {
                    $flows = app(AuthenticationFlowService::class);
                    $method === 'begin' ? $flows->begin($user, $request, 'google') : $flows->resend($request);
                });
                $this->fail('Issuance unexpectedly accepted an application outer transaction.');
            } catch (\RuntimeException $e) {
                $this->assertSame('OTP issuance must start outside application transactions.', $e->getMessage());
            }
        }
        $this->assertSame(1, $this->issuanceCount($user));
        $this->assertDatabaseCount('otp_codes', 1);
        $this->assertGuest();
    }

    public function test_independent_postgres_connection_cannot_enter_the_account_issuance_lock(): void
    {
        $user = $this->user();
        $this->login($user);
        $configuration = config('database.connections.pgsql');
        $this->assertSame('pgsql', $configuration['driver']);
        $this->assertSame('127.0.0.1', $configuration['host']);
        $this->assertSame('infinity_spa_test', $configuration['database']);
        $this->assertEmpty($configuration['url']);
        $this->assertArrayNotHasKey('read', $configuration);
        $this->assertArrayNotHasKey('write', $configuration);
        // No fixture is committed or read by this connection. Only transaction-scoped
        // nonblocking advisory-lock probes are used; RefreshDatabase owns all data.
        $other = DB::build($configuration);
        try {
            $identity = $other->selectOne('select current_database() as db, host(inet_server_addr()) as host');
            $this->assertSame('infinity_spa_test', $identity->db);
            $this->assertSame('127.0.0.1', $identity->host);
            foreach (['issue:user:'.$user->id, 'issue:ip:127.0.0.1'] as $name) {
                $lock = (string) hexdec(substr(hash('sha256', 'authentication:'.$name), 0, 15));
                $acquired = $other->transaction(fn () => $other->selectOne(
                    'select pg_try_advisory_xact_lock(cast(? as bigint)) as acquired', [$lock]
                )->acquired);
                $this->assertFalse($acquired);
            }
        } finally {
            $other->disconnect();
        }
    }
}
