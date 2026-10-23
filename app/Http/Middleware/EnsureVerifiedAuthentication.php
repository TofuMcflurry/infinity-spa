<?php

namespace App\Http\Middleware;

use App\Services\AuthenticationFlowService;
use Closure;
use Illuminate\Auth\Middleware\Authenticate;
use Illuminate\Support\Facades\Auth;

class EnsureVerifiedAuthentication extends Authenticate
{
    public function handle($request, Closure $next, ...$guards)
    {
        return parent::handle($request, function ($request) use ($next) {
            // These existing recovery endpoints cannot grant OTP proof or business access.
            if ($request->routeIs('logout', 'verification.notice', 'verification.verify', 'verification.send')) {
                return $next($request);
            }
            $flows = app(AuthenticationFlowService::class);
            // Reload: an account may have been restricted since this guard's
            // identity was loaded (including long-lived/in-process sessions).
            $user = $request->user()->fresh();
            if (!$user || !$flows->completeForSession($user, $request)) {
                $flows->clear($request);
                Auth::logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();

                return $request->expectsJson()
                    ? response()->json(['message' => 'Authentication verification required.'], 401)
                    : redirect()->guest(route('login'));
            }

            Auth::setUser($user);

            return $next($request);
        }, ...$guards);
    }
}
