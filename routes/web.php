<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\BookingController;
use App\Http\Controllers\TherapistBookingController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('Welcome', [
        'canLogin'       => Route::has('login'),
        'canRegister'    => Route::has('register'),
        'laravelVersion' => Application::VERSION,
        'phpVersion'     => PHP_VERSION,
    ]);
});

// ── Customer Routes ───────────────────────────────────────────────────────────
Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('/dashboard',    fn() => Inertia::render('Dashboard'))->name('dashboard');
    Route::get('/my-bookings',  fn() => Inertia::render('Bookings'))->name('bookings');
    Route::get('/my-profile',   fn() => Inertia::render('Profile'))->name('my.profile');
    Route::get('/services',     fn() => Inertia::render('Services'))->name('services');

    // ── Booking API ───────────────────────────────────────────────────────────
    Route::prefix('api')->group(function () {
        // Step 1 — Get all services
        Route::get('/services', [BookingController::class, 'getServices'])
            ->name('api.services');

        // Step 3 — Get available time slots
        Route::get('/available-slots', [BookingController::class, 'getAvailableSlots'])
            ->name('api.available-slots');

        // Step 4 — Get available therapists
        Route::get('/available-therapists', [BookingController::class, 'getAvailableTherapists'])
            ->name('api.available-therapists');

        // Step 5 — Store booking
        Route::post('/bookings', [BookingController::class, 'store'])
            ->name('api.bookings.store');

        // Customer — view own bookings
        Route::get('/my-bookings', [BookingController::class, 'myBookings'])
            ->name('api.my-bookings');
    });
});

// ── Therapist Routes ──────────────────────────────────────────────────────────
Route::middleware(['auth', 'verified'])
    ->prefix('therapist')
    ->name('therapist.')
    ->group(function () {
        // Therapist dashboard page
        Route::get('/dashboard', fn() => Inertia::render('Therapist/Dashboard'))
            ->name('dashboard');

        // Therapist booking actions
        Route::prefix('api')->group(function () {
            Route::get('/bookings',                [TherapistBookingController::class, 'index'])
                ->name('api.bookings');
            Route::post('/bookings/{booking}/accept',   [TherapistBookingController::class, 'accept'])
                ->name('api.bookings.accept');
            Route::post('/bookings/{booking}/reject',   [TherapistBookingController::class, 'reject'])
                ->name('api.bookings.reject');
            Route::post('/bookings/{booking}/complete', [TherapistBookingController::class, 'complete'])
                ->name('api.bookings.complete');
        });
    });

// ── OTP Routes ────────────────────────────────────────────────────────────────
Route::get('otp/verify',  [App\Http\Controllers\Auth\OtpController::class, 'showForm'])->name('otp.form');
Route::post('otp/send',   [App\Http\Controllers\Auth\OtpController::class, 'sendOtp'])->name('otp.send');
Route::post('otp/verify', [App\Http\Controllers\Auth\OtpController::class, 'verifyOtp'])->name('otp.verify');

Route::post('/account/set-password', [App\Http\Controllers\Auth\PasswordController::class, 'setPasswordForGoogleUser'])
    ->name('account.set.password');

// ── Social Login Routes ───────────────────────────────────────────────────────
Route::prefix('auth')->group(function () {
    Route::get('google',          [App\Http\Controllers\Auth\SocialiteController::class, 'redirectToGoogle'])
        ->name('auth.google');
    Route::get('google/callback', [App\Http\Controllers\Auth\SocialiteController::class, 'handleGoogleCallback']);
});

// ── Protected OTP Settings ────────────────────────────────────────────────────
Route::middleware('auth')->group(function () {
    Route::post('otp/enable',  [App\Http\Controllers\Auth\OtpController::class, 'enableOtp'])->name('otp.enable');
    Route::post('otp/disable', [App\Http\Controllers\Auth\OtpController::class, 'disableOtp'])->name('otp.disable');
});

// ── Profile Routes ────────────────────────────────────────────────────────────
Route::middleware('auth')->group(function () {
    Route::get('/profile',    [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile',  [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

require __DIR__.'/auth.php';