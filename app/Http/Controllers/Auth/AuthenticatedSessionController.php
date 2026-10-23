<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Services\AuthenticationFlowService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Illuminate\Validation\ValidationException;

// Audit Events
use App\Events\Audit\UserLoggedOut;
use App\Events\Audit\LoginFailed;

class AuthenticatedSessionController extends Controller
{
    protected $flows;

    public function __construct(AuthenticationFlowService $flows)
    {
        $this->flows = $flows;
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
            $user = $request->authenticate();
        } catch (ValidationException $e) {
            // ── Audit: failed login attempt ────────────────────────────────────
            LoginFailed::dispatch($request->input('email', ''), $request);
            throw $e;
        }

        if ($user->is_otp_enabled || !$user->email_verified_at) {
            $this->flows->begin($user, $request, 'password', $request->boolean('remember'));
            return redirect()->route('otp.form');
        }

        $this->flows->signIn($user, $request, 'password', $request->boolean('remember'));

        return redirect()->intended($this->flows->destination($user));
    }

    public function destroy(Request $request)
    {
        $this->flows->clear($request);
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
