<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserIsCustomer
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return $next($request);
        }

        if ($user->isTherapist()) {
            return redirect('/therapist/dashboard');
        }

        if ($user->isAdmin()) {
            return redirect('/admin/dashboard');
        }

        return $next($request);
    }
}
