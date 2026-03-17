<?php

namespace App\Services;

use App\Models\User;
use App\Models\OtpCode;
use Illuminate\Support\Facades\Mail;
use Carbon\Carbon;

class OtpService
{
    /**
     * Generate and send OTP to user
     */
    public function generateOtp(User $user, string $type = 'email'): OtpCode
    {
        // Delete any existing unused OTPs for this user
        OtpCode::where('user_id', $user->id)
            ->where('is_used', false)
            ->where('expires_at', '>', Carbon::now())
            ->delete();

        // Generate 6-digit OTP
        $code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        // Create new OTP
        $otp = OtpCode::create([
            'user_id' => $user->id,
            'code' => $code,
            'type' => $type,
            'expires_at' => Carbon::now()->addMinutes(10), // Valid for 10 minutes
        ]);

        // Send OTP via email
        if ($type === 'email') {
            $this->sendEmailOtp($user, $code);
        }

        return $otp;
    }

    /**
     * Verify OTP code
     */
    public function verifyOtp(User $user, string $code): bool
    {
        $otp = OtpCode::where('user_id', $user->id)
            ->where('code', $code)
            ->where('is_used', false)
            ->where('expires_at', '>', Carbon::now())
            ->latest()
            ->first();

        if (!$otp) {
            return false;
        }

        // Mark OTP as used
        $otp->update(['is_used' => true]);

        // Mark user as OTP verified
        $user->markOtpAsVerified();
        
        // ✅ AUTO- VERIFY EMAIL - SET EMAIL_VERIFIED_AT
        if (!$user->email_verified_at) {
            $user->email_verified_at = Carbon::now();
            $user->save();
        }

        return true;
    }

    /**
     * Send OTP via email
     */
    private function sendEmailOtp(User $user, string $code): void
    {
        Mail::send('emails.otp', ['user' => $user, 'code' => $code], function ($message) use ($user) {
            $message->to($user->email)
                ->subject('Your OTP Code');
        });
    }

    /**
     * Check if OTP is required for user
     */
    public function requiresOtp(User $user): bool
    {
        return $user->is_otp_enabled && !$user->hasVerifiedOtp();
    }

    /**
     * Clear OTP verification
     */
    public function clearOtpVerification(User $user): void
    {
        $user->otp_verified_at = null;
        $user->save();
    }
}