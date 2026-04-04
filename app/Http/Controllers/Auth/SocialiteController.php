<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\OtpService;
use Laravel\Socialite\Facades\Socialite;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class SocialiteController extends Controller
{
    protected $otpService;

    public function __construct(OtpService $otpService)
    {
        $this->otpService = $otpService;
    }

    /**
     * Redirect to Google
     */
    public function redirectToGoogle()
    {
        return Socialite::driver('google')->redirect();
    }

    /**
     * Handle Google callback
     */
    public function handleGoogleCallback()
    {
        try {
            $googleUser = Socialite::driver('google')->user();
            
            // Find or create user
            $user = User::where('google_id', $googleUser->getId())
                ->orWhere('email', $googleUser->getEmail())
                ->first();

            if (!$user) {
                // Create new user
                $user = User::create([
                    'name' => $googleUser->getName(),
                    'email' => $googleUser->getEmail(),
                    'google_id' => $googleUser->getId(),
                    'avatar' => $googleUser->getAvatar(),
                    'password' => bcrypt(Str::random(16)),
                    'email_verified_at' => now(),
                ]);
            } else {
                // Update google_id if not set
                if (!$user->google_id) {
                    $user->update(['google_id' => $googleUser->getId()]);
                }
            }

            // Check if OTP is enabled for this user
            if ($user->is_otp_enabled) {
                $this->otpService->generateOtp($user);
                return redirect()->route('otp.form', ['email' => $user->email]);
            }

            // Log the user in
            Auth::login($user);
            $destination = $user->isTherapist() ? '/therapist/dashboard' : '/dashboard';
            return redirect()->intended($destination);

        } catch (\Exception $e) {
            return redirect()->route('login')->withErrors([
                'email' => 'Failed to authenticate with Google.'
            ]);
        }
    }
}