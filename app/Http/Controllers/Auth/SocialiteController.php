<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuthenticationFlowService;
use Laravel\Socialite\Facades\Socialite;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SocialiteController extends Controller
{
    protected $flows;

    public function __construct(AuthenticationFlowService $flows)
    {
        $this->flows = $flows;
    }

    /**
     * Redirect to Google
     */
    public function redirectToGoogle(Request $request)
    {
        $this->flows->clear($request);
        return Socialite::driver('google')->redirect();
    }

    /**
     * Handle Google callback
     */
    public function handleGoogleCallback(Request $request)
    {
        $this->flows->clear($request);
        try {
            $googleUser = Socialite::driver('google')->user();
            $result = DB::transaction(function () use ($googleUser, $request) {
                $email = $googleUser->getEmail();
                if (!$googleUser->getId() || !filter_var($email, FILTER_VALIDATE_EMAIL)
                    || ($googleUser->getRaw()['email_verified'] ?? null) !== true) {
                    throw new \RuntimeException('Google identity verification failed.');
                }
                $user = DB::transaction(function () use ($googleUser, $email) {
                    $user = User::where('google_id', $googleUser->getId())->lockForUpdate()->first();
                    if (!$user) {
                        $user = User::where('email', $email)->lockForUpdate()->first();
                        if ($user && $user->google_id) {
                            throw new \RuntimeException('Conflicting Google identity.');
                        }
                        if ($user) {
                            $user->update(['google_id' => $googleUser->getId()]);
                        } else {
                            $user = User::create([
                                'name' => $googleUser->getName(), 'email' => $email,
                                'google_id' => $googleUser->getId(), 'avatar' => $googleUser->getAvatar(),
                                'password' => bcrypt(Str::random(32)), 'email_verified_at' => now(),
                            ])->refresh();
                        }
                    }
                    return $user;
                });
                if ($user->is_otp_enabled || !$user->email_verified_at) {
                    return $user;
                }
                $this->flows->signIn($user, $request, 'google');

                return redirect()->intended($this->flows->destination($user));
            });

            if ($result instanceof User) {
                // Identity/linking commits before durable issuance is reserved. No
                // authenticated session is granted until the OTP flow completes.
                $this->flows->begin($result, $request, 'google');
                return redirect()->route('otp.form');
            }

            return $result;

        } catch (\Throwable $e) {
            Auth::logout();
            $request->session()->invalidate();
            return redirect()->route('login')->withErrors([
                'email' => 'Failed to authenticate with Google.'
            ]);
        }
    }
}
