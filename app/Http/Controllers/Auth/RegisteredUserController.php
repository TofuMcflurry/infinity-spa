<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\OtpService;
use App\Models\User;
use App\Providers\RouteServiceProvider;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules;
use Inertia\Inertia;

class RegisteredUserController extends Controller
{
    /**
     * OtpService instance
     */
    protected $otpService;  // <--- NASA LOOB NG CLASS

    /**
     * Constructor
     */
    public function __construct(OtpService $otpService)  // <--- NASA LOOB NG CLASS
    {
        $this->otpService = $otpService;
    }

    /**
     * Display the registration view.
     */
    public function create()
    {
        return Inertia::render('Auth/Register');
    }

    /**
     * Handle an incoming registration request.
     */
    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|lowercase|email|max:255',
            'phone' => 'nullable|string|max:20',
            'password' => ['required', 'confirmed', Rules\Password::defaults()],
        ]);

        // Check if user already exists
        $existingUser = User::where('email', $request->email)->first();

        // If user exists and has Google ID
        if ($existingUser && $existingUser->google_id) {
            return Inertia::render('Auth/AccountExists', [
                'email' => $existingUser->email,
                'name' => $existingUser->name,
                'avatar' => $existingUser->avatar,
                'hasGoogle' => true
            ]);
        }

        // If user exists but no Google ID (regular user)
        if ($existingUser && !$existingUser->google_id) {
            return back()->withErrors([
                'email' => 'This email is already registered. Please login instead.'
            ]);
        }

        // Create new user with phone
        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'phone' => $request->phone,
            'password' => Hash::make($request->password),
            'is_otp_enabled' => true,
        ]);

        event(new Registered($user));

        // Generate and send OTP - GAMITIN ANG CONSTRUCTOR
        $this->otpService->generateOtp($user);  // <--- ITO ANG TAMA

        return redirect()->route('otp.form', ['email' => $user->email]);
    }
}