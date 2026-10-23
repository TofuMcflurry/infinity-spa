<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\User;
use App\Providers\RouteServiceProvider;
use App\Services\AuthenticationFlowService;
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
    protected $flows;  // <--- NASA LOOB NG CLASS

    /**
     * Constructor
     */
    public function __construct(AuthenticationFlowService $flows)  // <--- NASA LOOB NG CLASS
    {
        $this->flows = $flows;
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
        $this->flows->clear($request);
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

        // Convert any guest bookings tied to this email
        Booking::where('guest_email', $user->email)
            ->whereNull('customer_id')
            ->update([
                'customer_id'               => $user->id,
                'is_converted'              => true,
                'converted_to_customer_id'  => $user->id,
            ]);

        // Generate and send OTP - GAMITIN ANG CONSTRUCTOR
        $this->flows->begin($user->refresh(), $request, 'registration');  // <--- ITO ANG TAMA

        return redirect()->route('otp.form');
    }
}