<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\OtpService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Support\Facades\Auth;

class OtpController extends Controller
{
    protected $otpService;

    public function __construct(OtpService $otpService)
    {
        $this->otpService = $otpService;
    }

    /**
     * Show OTP verification form
     */
    public function showForm()
    {
        return Inertia::render('Auth/OtpVerification');
    }

    /**
     * Send OTP to user
     */
    public function sendOtp(Request $request)
    {
        $request->validate([
            'email' => 'required|email|exists:users,email',
        ]);

        $user = User::where('email', $request->email)->first();

        // Generate and send OTP
        $this->otpService->generateOtp($user, 'email');

        return response()->json([
            'message' => 'OTP sent to your email'
        ]);
    }

    /**
     * Verify OTP
     */
    public function verifyOtp(Request $request)
    {
        $request->validate([
            'email' => 'required|email|exists:users,email',
            'code' => 'required|string|size:6',
        ]);

        $user = User::where('email', $request->email)->first();

        if ($this->otpService->verifyOtp($user, $request->code)) {
            // Log the user in
            Auth::login($user, $request->boolean('remember'));

            // Regenerate session
            $request->session()->regenerate();

            return redirect()->intended('dashboard');
        }

        return back()->withErrors([
            'code' => 'The provided OTP code is invalid or expired.',
        ]);
    }

    /**
     * Enable OTP for user
     */
    public function enableOtp(Request $request)
    {
        $user = $request->user();
        
        $user->is_otp_enabled = true;
        $user->save();

        return response()->json([
            'message' => 'OTP enabled successfully'
        ]);
    }

    /**
     * Disable OTP for user
     */
    public function disableOtp(Request $request)
    {
        $user = $request->user();
        
        $user->is_otp_enabled = false;
        $user->otp_verified_at = null;
        $user->save();

        return response()->json([
            'message' => 'OTP disabled successfully'
        ]);
    }
}