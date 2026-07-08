<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Services\OtpService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Illuminate\Validation\ValidationException;

// Audit Events
use App\Events\Audit\UserLoggedIn;
use App\Events\Audit\UserLoggedOut;
use App\Events\Audit\LoginFailed;

class AuthenticatedSessionController extends Controller
{
    protected $otpService;

    public function __construct(OtpService $otpService)
    {
        $this->otpService = $otpService;
    }

    public function create()
    {
        return Inertia::render('Auth/Login', [
            'canResetPassword' => Route::has('password.request'),
            'status'           => session('status'),
        ]);
    }

    public function store(LoginRequest $request)
    {
        try {
            $request->authenticate();
        } catch (ValidationException $e) {
            // ── Audit: failed login attempt ────────────────────────────────────
            LoginFailed::dispatch($request->input('email', ''), $request);
            throw $e;
        }

        $request->session()->regenerate();

        $user = Auth::user();

        // ── Audit: successful login ────────────────────────────────────────────
        UserLoggedIn::dispatch($user->id, $user->name, $user->role, $request);

        // Check if email is verified
        if (!$user->email_verified_at) {
            Auth::logout();
            $this->otpService->generateOtp($user);
            return redirect()->route('otp.form', ['email' => $user->email]);
        }

        if ($user->role === 'admin') {
            $destination = '/admin';
        } elseif ($user->isTherapist()) {
            $destination = '/therapist/dashboard';
        } else {
            $destination = '/dashboard';
        }

        return redirect()->intended($destination);
    }

    public function destroy(Request $request)
    {
        $user = Auth::user();

        // ── Audit: logout ──────────────────────────────────────────────────────
        if ($user) {
            UserLoggedOut::dispatch($user->id, $user->name, $request);
        }

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }
}