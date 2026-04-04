<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserIsTherapist
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user() || ! $request->user()->isTherapist()) {
            abort(403, 'Access denied. Therapist account required.');
        }

        return $next($request);
    }
}
