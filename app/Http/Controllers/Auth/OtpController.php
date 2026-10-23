<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\AuthenticationFlowService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class OtpController extends Controller
{
    protected $flows;

    public function __construct(AuthenticationFlowService $flows)
    {
        $this->flows = $flows;
    }

    /**
     * Show OTP verification form
     */
    public function showForm(Request $request)
    {
        try {
            $user = $this->flows->pendingUser($request);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return redirect()->route('login')->withErrors($e->errors());
        }
        return Inertia::render('Auth/OtpVerification', ['email' => $user->email]);
    }

    public function sendOtp(Request $request)
    {
        $this->flows->resend($request);

        return response()->json(['message' => 'OTP sent to your email']);
    }

    public function verifyOtp(Request $request)
    {
        $request->validate(['code' => ['required', 'string', 'regex:/^[0-9]{6}$/D']]);
        $user = $this->flows->verify($request, $request->string('code')->toString());

        return redirect()->intended($this->flows->destination($user));
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
