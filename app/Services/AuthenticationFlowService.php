<?php

namespace App\Services;

use App\Events\Audit\GoogleLoginUsed;
use App\Events\Audit\OtpVerified;
use App\Events\Audit\UserLoggedIn;
use App\Models\User;
use Illuminate\Cache\DatabaseStore;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthenticationFlowService
{
    private const PENDING = 'auth.pending_flow';
    private const PROOF = 'auth.completed_verification';
    private const LIFETIME = 600;

    public function fingerprint(User $user): string
    {
        return hash_hmac('sha256', json_encode([
            $user->id, $user->email, $user->getAuthPassword(), $user->google_id,
            $user->role, $user->is_otp_enabled, $user->email_verified_at?->toISOString(),
        ], JSON_THROW_ON_ERROR), config('app.key'));
    }

    public function completeForSession(User $user, Request $request): bool
    {
        if (!$user->email_verified_at) {
            return false;
        }
        if (!$user->is_otp_enabled) {
            return true;
        }
        $proof = $request->session()->get(self::PROOF);

        return is_array($proof) && ($proof['user_id'] ?? null) === $user->id
            && hash_equals($this->fingerprint($user), (string) ($proof['fingerprint'] ?? ''));
    }

    public function clear(Request $request): void
    {
        $id = $request->session()->get(self::PENDING);
        $request->session()->forget([self::PENDING, self::PROOF, 'auth.pending_google_user_id']);
        if (is_string($id)) {
            $this->atomic(['flow:'.$id], fn () => $this->store()->forget('auth-flow:'.$id));
        }
    }

    public function begin(User $user, Request $request, string $method, bool $remember = false): void
    {
        $this->assertIssuanceBoundary();
        $this->budget([
            ['issue:user:'.$user->id, 4, 900],
            ['issue:ip:'.$request->ip(), 20, 900],
        ]);
        $expected = $this->fingerprint($user);
        $id = Str::random(64);
        $this->atomic(['flow:'.$id], function () use ($user, $expected, $id, $method, $remember) {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            if (!hash_equals($expected, $this->fingerprint($locked))) {
                $this->invalid();
            }
            $otp = app(OtpService::class)->generateOtp($locked);
            $this->put('auth-flow:'.$id, [
                'user_id' => $locked->id, 'challenge_id' => $otp->id,
                'fingerprint' => $expected, 'method' => $method,
                'purpose' => $method === 'registration' ? 'registration' : 'sign_in',
                'remember' => $remember, 'expires' => now()->timestamp + self::LIFETIME,
                'sent_at' => now()->timestamp, 'resends' => 0,
            ], self::LIFETIME);
        });
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        $request->session()->put(self::PENDING, $id);
    }

    public function pendingUser(Request $request): User
    {
        return $this->withFlow($request, fn ($flow, $user) => $user);
    }

    public function resend(Request $request): void
    {
        $this->assertIssuanceBoundary();
        $reservation = Str::random(64);
        // Commit the allowance, cooldown and resend count before any mail can be sent.
        $this->withFlow($request, function ($flow, $user, $id) use ($request, $reservation) {
            if ($flow['resends'] >= 3 || now()->timestamp - $flow['sent_at'] < 60) {
                throw ValidationException::withMessages(['code' => 'Please wait before requesting another code.']);
            }
            $this->budget([
                ['issue:user:'.$user->id, 4, 900],
                ['issue:ip:'.$request->ip(), 20, 900],
            ]);
            $flow['sent_at'] = now()->timestamp;
            $flow['resends']++;
            $flow['issuance_reservation'] = $reservation;
            $this->put('auth-flow:'.$id, $flow, $flow['expires'] - now()->timestamp);
        });

        // A failure here can roll back the replacement challenge, never its allowance.
        $this->withFlow($request, function ($flow, $user, $id) use ($reservation) {
            if (!hash_equals($reservation, $flow['issuance_reservation'] ?? '')) {
                $this->invalid();
            }
            $otp = app(OtpService::class)->generateOtp($user);
            $flow['challenge_id'] = $otp->id;
            unset($flow['issuance_reservation']);
            $this->put('auth-flow:'.$id, $flow, $flow['expires'] - now()->timestamp);
        });
    }

    public function verify(Request $request, string $code): User
    {
        // Reserve attempts in a separate committed transaction before business mutation.
        // The IP budget also applies to requests with missing or invalid flow state.
        $this->budget([['verify:ip:'.$request->ip(), 30, 600]]);
        $user = $this->pendingUser($request);
        $id = $request->session()->get(self::PENDING);
        $this->budget([
            ['verify:flow:'.$id, 5, 600],
            ['verify:user:'.$user->id, 5, 900],
        ]);

        try {
            $result = $this->withFlow($request, function ($flow, $user, $id) use ($request, $code) {
                if (!app(OtpService::class)->verifyOtp($user, $code, $flow['challenge_id'])) {
                    return null;
                }
                $this->authenticate($user, $request, $flow['method'], $flow['remember'], true);
                $this->store()->forget('auth-flow:'.$id);

                return $user;
            });
        } catch (\Throwable $e) {
            Auth::logout();
            $request->session()->invalidate();
            throw $e;
        }
        if (!$result) {
            throw ValidationException::withMessages(['code' => 'The provided OTP code is invalid or expired.']);
        }
        $request->session()->forget(self::PENDING);

        return $result;
    }

    public function signIn(User $user, Request $request, string $method, bool $remember = false): void
    {
        $expected = $this->fingerprint($user);
        try {
            DB::transaction(function () use ($user, $request, $method, $remember, $expected) {
                $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
                if (!hash_equals($expected, $this->fingerprint($locked))) {
                    $this->invalid();
                }
                $this->authenticate($locked, $request, $method, $remember, false);
            });
        } catch (\Throwable $e) {
            Auth::logout();
            $request->session()->invalidate();
            throw $e;
        }
    }

    public function destination(User $user): string
    {
        return $user->role === 'admin' ? '/admin' : ($user->isTherapist() ? '/therapist/dashboard' : '/dashboard');
    }

    private function authenticate(User $user, Request $request, string $method, bool $remember, bool $otp): void
    {
        if (!$user->email_verified_at || ($user->is_otp_enabled && !$otp)) {
            $this->invalid();
        }
        Auth::login($user, $remember);
        if ($otp) {
            OtpVerified::dispatch($user->id, $user->name, $request);
        }
        if ($method === 'google') {
            GoogleLoginUsed::dispatch($user->id, $user->name, $request);
        } else {
            UserLoggedIn::dispatch($user->id, $user->name, $user->role, $request);
        }
        $request->session()->regenerate();
        $request->session()->put(self::PROOF, [
            'user_id' => $user->id, 'fingerprint' => $this->fingerprint($user),
        ]);
    }

    private function withFlow(Request $request, callable $action): mixed
    {
        $id = $request->session()->get(self::PENDING);
        if (!is_string($id) || !preg_match('/^[a-zA-Z0-9]{64}$/D', $id)) {
            $this->invalid();
        }

        return $this->atomic(['flow:'.$id], function () use ($id, $action, $request) {
            $flow = $this->store()->get('auth-flow:'.$id);
            if (!is_array($flow) || $flow['expires'] <= now()->timestamp) {
                $request->session()->forget(self::PENDING);
                $this->invalid();
            }
            $user = User::whereKey($flow['user_id'])->lockForUpdate()->first();
            if (!$user || !hash_equals($flow['fingerprint'], $this->fingerprint($user))) {
                $request->session()->forget(self::PENDING);
                $this->invalid();
            }

            return $action($flow, $user, $id);
        });
    }

    private function budget(array $limits): void
    {
        $this->atomic(array_column($limits, 0), function () use ($limits) {
            $updates = [];
            foreach ($limits as [$name, $maximum, $seconds]) {
                $key = 'auth-budget:'.hash('sha256', $name);
                $value = $this->store()->get($key);
                if (!is_array($value) || $value['until'] <= now()->timestamp) {
                    $value = ['count' => 0, 'until' => now()->timestamp + $seconds];
                }
                if ($value['count'] >= $maximum) {
                    throw ValidationException::withMessages(['code' => 'Too many verification requests. Please try again later.']);
                }
                $value['count']++;
                $updates[$key] = $value;
            }
            foreach ($updates as $key => $value) {
                $this->put($key, $value, $value['until'] - now()->timestamp);
            }
        });
    }

    private function atomic(array $keys, callable $action): mixed
    {
        return DB::transaction(function () use ($keys, $action) {
            if (DB::connection()->getDriverName() !== 'pgsql') {
                throw new \RuntimeException('Persistent authentication controls require PostgreSQL.');
            }
            sort($keys, SORT_STRING);
            foreach (array_unique($keys) as $key) {
                $lock = (string) hexdec(substr(hash('sha256', 'authentication:'.$key), 0, 15));
                DB::select('select pg_advisory_xact_lock(cast(? as bigint))', [$lock]);
            }

            return $action();
        });
    }

    private function assertIssuanceBoundary(): void
    {
        // RefreshDatabase owns a fixture rollback transaction. It is never committed
        // here; tests validate durability across the application's inner rollbacks.
        $fixtureLevel = app()->runningUnitTests() && app()->bound('db.transactions')
            && app('db.transactions') instanceof \Illuminate\Foundation\Testing\DatabaseTransactionsManager
                ? 1 : 0;
        if (DB::transactionLevel() !== $fixtureLevel) {
            throw new \RuntimeException('OTP issuance must start outside application transactions.');
        }
    }

    private function store()
    {
        $store = Cache::store('database');
        if (!$store->getStore() instanceof DatabaseStore
            || config('cache.stores.database.connection') !== null
            || config('cache.stores.database.lock_connection') !== null) {
            throw new \RuntimeException('Shared authentication storage is unavailable.');
        }

        return $store;
    }

    private function put(string $key, array $value, int $seconds): void
    {
        if (!$this->store()->put($key, $value, max(1, $seconds))) {
            throw new \RuntimeException('Shared authentication storage is unavailable.');
        }
    }

    private function invalid(): never
    {
        throw ValidationException::withMessages(['code' => 'Verification session expired. Please sign in again.']);
    }
}
