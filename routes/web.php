<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\BookingController;
use App\Http\Controllers\TherapistBookingController;
use App\Http\Controllers\CustomerProfileController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\CustomerDashboardController;
use App\Http\Controllers\DownpaymentController;
use App\Http\Controllers\ReviewController;
use App\Http\Controllers\AddressController;
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
    Route::middleware('customer')->group(function () {
        Route::get('/dashboard',    fn() => Inertia::render('Dashboard'))->name('dashboard');
        Route::get('/book-session', fn() => Inertia::render('Bookings'))->name('bookings');
        Route::get('/my-bookings',  fn() => Inertia::render('MyBookings'))->name('my.bookings');
        Route::get('/therapists',   fn() => Inertia::render('Therapists'))->name('therapists');
        Route::get('/my-profile',   fn() => Inertia::render('Profile'))->name('my.profile');
        Route::get('/services',     fn() => Inertia::render('Services'))->name('services');
    });

    // ── API Routes ────────────────────────────────────────────────────────────
    Route::prefix('api')->group(function () {

        // Dashboard
        Route::get('/dashboard-data', [CustomerDashboardController::class, 'index'])
            ->name('api.dashboard');

        Route::get('/therapists', [BookingController::class, 'getTherapists'])
            ->name('api.therapists');

        // Booking flow
        Route::get('/services',              [BookingController::class, 'getServices'])
            ->name('api.services');
        Route::get('/available-slots',       [BookingController::class, 'getAvailableSlots'])
            ->name('api.available-slots');
        Route::get('/available-therapists',  [BookingController::class, 'getAvailableTherapists'])
            ->name('api.available-therapists');
        Route::post('/bookings',             [BookingController::class, 'store'])
            ->name('api.bookings.store');
        Route::get('/my-bookings',           [BookingController::class, 'myBookings'])
            ->name('api.my-bookings');

        // Sa loob ng api group — idagdag:
        Route::get('/reviews/check',    [ReviewController::class, 'checkEligibility'])->name('api.reviews.check');
        Route::post('/reviews',         [ReviewController::class, 'store'])->name('api.reviews.store');
        Route::get('/reviews/pending',  [ReviewController::class, 'pendingReviews'])->name('api.reviews.pending');

        // Addresses
        Route::get('/addresses',                    [AddressController::class, 'index'])
            ->name('api.addresses');
        Route::post('/addresses',                   [AddressController::class, 'store'])
            ->name('api.addresses.store');
        Route::put('/addresses/{address}',          [AddressController::class, 'update'])
            ->name('api.addresses.update');
        Route::delete('/addresses/{address}',       [AddressController::class, 'destroy'])
            ->name('api.addresses.destroy');
        Route::post('/addresses/{address}/default', [AddressController::class, 'setDefault'])
            ->name('api.addresses.default');

        // Profile
        Route::get('/profile-data',    [CustomerProfileController::class, 'show'])
            ->name('api.profile');
        Route::post('/profile-update', [CustomerProfileController::class, 'update'])
            ->name('api.profile.update');
        Route::post('/profile-avatar', [CustomerProfileController::class, 'uploadAvatar'])
            ->name('api.profile.avatar');

        Route::get('/downpayment/bank-details',      [DownpaymentController::class, 'getBankDetails'])->name('api.downpayment.bank');
        Route::post('/downpayment/upload-proof',     [DownpaymentController::class, 'uploadProof'])->name('api.downpayment.upload');
        Route::post('/downpayment/cancel',           [DownpaymentController::class, 'cancel'])->name('api.downpayment.cancel');
        Route::get('/downpayment/status',            [DownpaymentController::class, 'status'])->name('api.downpayment.status');

        // Notifications
        Route::get('/notifications',             [NotificationController::class, 'index'])->name('api.notifications');
        Route::get('/notifications/unread-count',[NotificationController::class, 'unreadCount'])->name('api.notifications.count');
        Route::post('/notifications/read-all',   [NotificationController::class, 'markAllRead'])->name('api.notifications.read-all');
        Route::post('/notifications/{id}/read',  [NotificationController::class, 'markRead'])->name('api.notifications.read');

        // Downpayment verify (admin)
        Route::post('/downpayment/verify',       [DownpaymentController::class, 'verify'])->name('api.downpayment.verify');

        // Therapist status updates
        Route::middleware('therapist')->group(function () {
            Route::post('/therapist/bookings/{booking}/en-route', [TherapistBookingController::class, 'enRoute'])->name('api.therapist.en-route');
            Route::post('/therapist/bookings/{booking}/arrived',  [TherapistBookingController::class, 'arrived'])->name('api.therapist.arrived');
        });
    });
});

// ── Therapist Routes ──────────────────────────────────────────────────────────
Route::middleware(['auth', 'verified', 'therapist'])
    ->prefix('therapist')
    ->name('therapist.')
    ->group(function () {
        // Pages
        Route::get('/dashboard', fn() => Inertia::render('Therapist/Dashboard'))
            ->name('dashboard');
        Route::get('/bookings',  fn() => Inertia::render('Therapist/Bookings'))
            ->name('bookings');
        Route::get('/profile',   fn() => Inertia::render('Therapist/Profile'))
            ->name('profile');

        // API
        Route::prefix('api')->group(function () {
            Route::get('/bookings',                     [TherapistBookingController::class, 'index'])
                ->name('api.bookings');
            Route::post('/bookings/{booking}/accept',   [TherapistBookingController::class, 'accept'])
                ->name('api.bookings.accept');
            Route::post('/bookings/{booking}/reject',   [TherapistBookingController::class, 'reject'])
                ->name('api.bookings.reject');
            Route::post('/bookings/{booking}/complete', [TherapistBookingController::class, 'complete'])
                ->name('api.bookings.complete');
            Route::get('/profile',                      [TherapistBookingController::class, 'profile'])
                ->name('api.profile');
            Route::post('/profile',                     [TherapistBookingController::class, 'updateProfile'])
                ->name('api.profile.update');
            Route::post('/profile/avatar',              [TherapistBookingController::class, 'updateAvatar'])
                ->name('api.profile.avatar');
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

// ── Profile Routes (Breeze) ───────────────────────────────────────────────────
Route::middleware('auth')->group(function () {
    Route::get('/profile',    [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile',  [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

// ── Admin Routes ───────────────────────────────────────────────────────────────

Route::middleware(['auth', 'admin'])
    ->prefix('admin')
    ->name('admin.')
    ->group(function () {
        Route::get('/', [App\Http\Controllers\Admin\AdminDashboardController::class, 'index'])
            ->name('dashboard');

        // ── Therapists ────────────────────────────────────────────────────────
        Route::get('/therapists',                          [App\Http\Controllers\Admin\AdminTherapistController::class, 'index'])
            ->name('therapists');
        Route::post('/therapists/{therapist}/approve',     [App\Http\Controllers\Admin\AdminTherapistController::class, 'approve'])
            ->name('therapists.approve');
        Route::post('/therapists/{therapist}/deactivate',  [App\Http\Controllers\Admin\AdminTherapistController::class, 'deactivate'])
            ->name('therapists.deactivate');
        Route::delete('/therapists/{therapist}',           [App\Http\Controllers\Admin\AdminTherapistController::class, 'reject'])
            ->name('therapists.reject');
    });

require __DIR__.'/auth.php';