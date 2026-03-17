<?php

use App\Http\Controllers\ProfileController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('Welcome', [
        'canLogin' => Route::has('login'),
        'canRegister' => Route::has('register'),
        'laravelVersion' => Application::VERSION,
        'phpVersion' => PHP_VERSION,
    ]);
});

Route::get('/dashboard', function () {
    return Inertia::render('Dashboard');
})->middleware(['auth', 'verified'])->name('dashboard');

// OTP Routes
Route::middleware('guest')->group(function () {
    Route::get('otp/verify', [App\Http\Controllers\Auth\OtpController::class, 'showForm'])
        ->name('otp.form');
    Route::post('otp/send', [App\Http\Controllers\Auth\OtpController::class, 'sendOtp'])
        ->name('otp.send');
    Route::post('otp/verify', [App\Http\Controllers\Auth\OtpController::class, 'verifyOtp'])
        ->name('otp.verify');
});

Route::post('/account/set-password', [App\Http\Controllers\Auth\PasswordController::class, 'setPasswordForGoogleUser'])
    ->name('account.set.password');

// Social Login Routes
Route::prefix('auth')->group(function () {
    Route::get('google', [App\Http\Controllers\Auth\SocialiteController::class, 'redirectToGoogle'])
        ->name('auth.google');
    Route::get('google/callback', [App\Http\Controllers\Auth\SocialiteController::class, 'handleGoogleCallback']);
});

// Protected OTP settings
Route::middleware('auth')->group(function () {
    Route::post('otp/enable', [App\Http\Controllers\Auth\OtpController::class, 'enableOtp'])
        ->name('otp.enable');
    Route::post('otp/disable', [App\Http\Controllers\Auth\OtpController::class, 'disableOtp'])
        ->name('otp.disable');
});

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

require __DIR__.'/auth.php';
