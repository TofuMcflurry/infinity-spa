<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Providers\RouteServiceProvider;
use App\Services\OtpService; // <--- ADD THIS IMPORT
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Illuminate\Validation\ValidationException;

class AuthenticatedSessionController extends Controller
{
    /**
     * OtpService instance
     */
    protected $otpService; // <--- ADD THIS PROPERTY

    /**
     * Constructor
     */
    public function __construct(OtpService $otpService) // <--- ADD THIS CONSTRUCTOR
    {
        $this->otpService = $otpService;
    }

    /**
     * Display the login view.
     */
    public function create()
    {
        return Inertia::render('Auth/Login', [
            'canResetPassword' => Route::has('password.request'),
            'status' => session('status'),
        ]);
    }

    /**
     * Handle an incoming authentication request.
     */
    public function store(LoginRequest $request)
    {
        $request->authenticate();

        $request->session()->regenerate();

        $user = Auth::user();

        // ✅ CHECK KUNG VERIFIED NA ANG EMAIL
        if (!$user->email_verified_at) {
            // Logout muna
            Auth::logout();
            
            // Generate bagong OTP
            $this->otpService->generateOtp($user);
            
            // Redirect sa OTP page
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

    /**
     * Destroy an authenticated session.
     */
    public function destroy(Request $request)
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();

        $request->session()->regenerateToken();

        return redirect('/');
    }
}