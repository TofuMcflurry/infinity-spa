<?php

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withSchedule(function (Schedule $schedule): void {
        // Safety net for abandoned Stripe checkouts — the webhook handles
        // the common case immediately, this catches what it misses.
        $schedule->command('bookings:expire-stale-pending-payment')->everyTenMinutes();

        // Nothing scheduled this until now, so past-due pending/accepted
        // bookings were never actually auto-cancelled in practice.
        $schedule->command('bookings:auto-cancel-past-due')->everyTenMinutes();
    })
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->web(append: [
            \App\Http\Middleware\HandleInertiaRequests::class,
            \Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets::class,
        ]);
        $middleware->alias([
            'therapist' => \App\Http\Middleware\EnsureUserIsTherapist::class,
            'customer'  => \App\Http\Middleware\EnsureUserIsCustomer::class,
            'admin'     => \App\Http\Middleware\AdminMiddleware::class,
        ]);
        $middleware->validateCsrfTokens(except: [
            'webhooks/stripe',
        ]);
    })
    ->withProviders([
        \App\Providers\EventServiceProvider::class,
    ])
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();