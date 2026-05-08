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
use App\Http\Controllers\GuestBookingController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Broadcast::routes(['middleware' => ['web', 'auth']]);

Route::get('/api/guest/services', [GuestBookingController::class, 'services'])->name('guest.services');
Route::post('/guest-booking', [GuestBookingController::class, 'store'])->name('guest.booking.store');

Route::get('/', function () {
    return Inertia::render('Welcome', [
        'canLogin'       => Route::has('login'),
        'canRegister'    => Route::has('register'),
        'laravelVersion' => Application::VERSION,
        'phpVersion'     => PHP_VERSION,
    ]);
});

Route::middleware(['auth', 'verified'])->group(function () {
    Route::middleware('customer')->group(function () {
        Route::get('/dashboard',    fn() => Inertia::render('Dashboard'))->name('dashboard');
        Route::get('/book-session', fn() => Inertia::render('Bookings'))->name('bookings');
        Route::get('/my-bookings',  fn() => Inertia::render('MyBookings'))->name('my.bookings');
        Route::get('/therapists',   fn() => Inertia::render('Therapists'))->name('therapists');
        Route::get('/my-profile',   fn() => Inertia::render('Profile'))->name('my.profile');
        Route::get('/services',     fn() => Inertia::render('Services'))->name('services');
    });

    Route::prefix('api')->group(function () {
        Route::get('/dashboard-data',               [CustomerDashboardController::class, 'index'])->name('api.dashboard');
        Route::get('/therapists',                   [BookingController::class, 'getTherapists'])->name('api.therapists');
        Route::get('/services',                     [BookingController::class, 'getServices'])->name('api.services');
        Route::get('/available-slots',              [BookingController::class, 'getAvailableSlots'])->name('api.available-slots');
        Route::get('/available-therapists',         [BookingController::class, 'getAvailableTherapists'])->name('api.available-therapists');
        Route::post('/bookings',                    [BookingController::class, 'store'])->name('api.bookings.store');
        Route::get('/my-bookings',                  [BookingController::class, 'myBookings'])->name('api.my-bookings');
        Route::get('/reviews/check',                [ReviewController::class, 'checkEligibility'])->name('api.reviews.check');
        Route::post('/reviews',                     [ReviewController::class, 'store'])->name('api.reviews.store');
        Route::get('/reviews/pending',              [ReviewController::class, 'pendingReviews'])->name('api.reviews.pending');
        Route::get('/addresses',                    [AddressController::class, 'index'])->name('api.addresses');
        Route::post('/addresses',                   [AddressController::class, 'store'])->name('api.addresses.store');
        Route::put('/addresses/{address}',          [AddressController::class, 'update'])->name('api.addresses.update');
        Route::delete('/addresses/{address}',       [AddressController::class, 'destroy'])->name('api.addresses.destroy');
        Route::post('/addresses/{address}/default', [AddressController::class, 'setDefault'])->name('api.addresses.default');
        Route::get('/profile-data',                 [CustomerProfileController::class, 'show'])->name('api.profile');
        Route::post('/profile-update',              [CustomerProfileController::class, 'update'])->name('api.profile.update');
        Route::post('/profile-avatar',              [CustomerProfileController::class, 'uploadAvatar'])->name('api.profile.avatar');
        Route::get('/downpayment/bank-details',     [DownpaymentController::class, 'getBankDetails'])->name('api.downpayment.bank');
        Route::post('/downpayment/upload-proof',    [DownpaymentController::class, 'uploadProof'])->name('api.downpayment.upload');
        Route::post('/downpayment/cancel',          [DownpaymentController::class, 'cancel'])->name('api.downpayment.cancel');
        Route::get('/downpayment/status',           [DownpaymentController::class, 'status'])->name('api.downpayment.status');
        Route::post('/downpayment/verify',          [DownpaymentController::class, 'verify'])->name('api.downpayment.verify');
        Route::get('/notifications',                [NotificationController::class, 'index'])->name('api.notifications');
        Route::get('/notifications/unread-count',   [NotificationController::class, 'unreadCount'])->name('api.notifications.count');
        Route::post('/notifications/read-all',      [NotificationController::class, 'markAllRead'])->name('api.notifications.read-all');
        Route::post('/notifications/{id}/read',     [NotificationController::class, 'markRead'])->name('api.notifications.read');
    });
});

Route::middleware(['auth', 'verified', 'therapist'])
    ->prefix('therapist')
    ->name('therapist.')
    ->group(function () {
        Route::get('/dashboard', fn() => Inertia::render('Therapist/Dashboard'))->name('dashboard');
        Route::get('/bookings',  fn() => Inertia::render('Therapist/Bookings'))->name('bookings');
        Route::get('/profile',   fn() => Inertia::render('Therapist/Profile'))->name('profile');
        Route::get('/schedule',  [App\Http\Controllers\TherapistScheduleController::class, 'index'])->name('schedule');
        Route::get('/earnings',  fn() => Inertia::render('Therapist/Earnings'))->name('earnings');

        Route::prefix('api')->name('api.')->group(function () {
            Route::get('/bookings',                         [TherapistBookingController::class, 'index'])->name('bookings');
            Route::get('/bookings/stats',                   [TherapistBookingController::class, 'stats'])->name('bookings.stats');

            // ── Booking state machine ─────────────────────────────────────────
            Route::post('/bookings/{booking}/accept',       [TherapistBookingController::class, 'accept'])->name('bookings.accept');
            Route::post('/bookings/{booking}/reject',       [TherapistBookingController::class, 'reject'])->name('bookings.reject');
            Route::post('/bookings/{booking}/cancel',       [TherapistBookingController::class, 'cancel'])->name('bookings.cancel');
            Route::post('/bookings/{booking}/start',        [TherapistBookingController::class, 'start'])->name('bookings.start');   // ← NEW
            Route::post('/bookings/{booking}/arrived',      [TherapistBookingController::class, 'arrived'])->name('bookings.arrived');
            Route::post('/bookings/{booking}/complete',     [TherapistBookingController::class, 'complete'])->name('bookings.complete');

            // ── Profile ───────────────────────────────────────────────────────
            Route::get('/profile',                          [TherapistBookingController::class, 'profile'])->name('profile');
            Route::post('/profile',                         [TherapistBookingController::class, 'updateProfile'])->name('profile.update');
            Route::post('/profile/avatar',                  [TherapistBookingController::class, 'updateAvatar'])->name('profile.avatar');

            // ── Schedule ──────────────────────────────────────────────────────
            Route::get('/schedule',                         [App\Http\Controllers\TherapistScheduleController::class, 'schedule'])->name('schedule');
            Route::post('/unavailable',                     [App\Http\Controllers\TherapistScheduleController::class, 'storeUnavailable'])->name('unavailable.store');
            Route::delete('/unavailable/{slot}',            [App\Http\Controllers\TherapistScheduleController::class, 'destroyUnavailable'])->name('unavailable.destroy');
            Route::post('/reschedule-request',              [App\Http\Controllers\TherapistScheduleController::class, 'storeRescheduleRequest'])->name('reschedule.store');
            Route::post('/rest-day-request',                [App\Http\Controllers\TherapistScheduleController::class, 'storeRestDayRequest'])->name('rest-day.store');
            Route::get('/rest-day-requests',                [App\Http\Controllers\TherapistScheduleController::class, 'restDayRequests'])->name('rest-day.index');

            // ── Earnings ──────────────────────────────────────────────────────
            Route::get('/earnings',                         [App\Http\Controllers\TherapistEarningsController::class, 'index'])->name('earnings');
            Route::get('/earnings/chart',                   [App\Http\Controllers\TherapistEarningsController::class, 'chart'])->name('earnings.chart');
            Route::get('/earnings/transactions',            [App\Http\Controllers\TherapistEarningsController::class, 'transactions'])->name('earnings.transactions');
            Route::get('/earnings/export',                  [App\Http\Controllers\TherapistEarningsController::class, 'export'])->name('earnings.export');
        });
    });

Route::get('otp/verify',  [App\Http\Controllers\Auth\OtpController::class, 'showForm'])->name('otp.form');
Route::post('otp/send',   [App\Http\Controllers\Auth\OtpController::class, 'sendOtp'])->name('otp.send');
Route::post('otp/verify', [App\Http\Controllers\Auth\OtpController::class, 'verifyOtp'])->name('otp.verify');
Route::post('/account/set-password', [App\Http\Controllers\Auth\PasswordController::class, 'setPasswordForGoogleUser'])->name('account.set.password');

Route::prefix('auth')->group(function () {
    Route::get('google',          [App\Http\Controllers\Auth\SocialiteController::class, 'redirectToGoogle'])->name('auth.google');
    Route::get('google/callback', [App\Http\Controllers\Auth\SocialiteController::class, 'handleGoogleCallback']);
});

Route::middleware('auth')->group(function () {
    Route::post('otp/enable',  [App\Http\Controllers\Auth\OtpController::class, 'enableOtp'])->name('otp.enable');
    Route::post('otp/disable', [App\Http\Controllers\Auth\OtpController::class, 'disableOtp'])->name('otp.disable');
    Route::get('/profile',     [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile',   [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile',  [ProfileController::class, 'destroy'])->name('profile.destroy');
});

Route::middleware(['auth', 'admin'])
    ->prefix('admin')
    ->name('admin.')
    ->group(function () {

        // ── Pages ──────────────────────────────────────────────────────────
        Route::get('/', [App\Http\Controllers\Admin\AdminDashboardController::class, 'index'])
            ->name('dashboard');

        // ── Therapists ─────────────────────────────────────────────────────
        Route::get('/therapists', [App\Http\Controllers\Admin\AdminTherapistController::class, 'index'])
            ->name('therapists');
        Route::post('/therapists/{therapist}/approve',    [App\Http\Controllers\Admin\AdminTherapistController::class, 'approve'])
            ->name('therapists.approve');
        Route::post('/therapists/{therapist}/deactivate', [App\Http\Controllers\Admin\AdminTherapistController::class, 'deactivate'])
            ->name('therapists.deactivate');
        Route::delete('/therapists/{therapist}',          [App\Http\Controllers\Admin\AdminTherapistController::class, 'reject'])
            ->name('therapists.reject');

        // ── Guest Bookings ─────────────────────────────────────────────────
        Route::post('/guest-bookings/{booking}/approve',    [App\Http\Controllers\Admin\AdminDashboardController::class, 'approvePendingBooking'])
            ->name('guest-bookings.approve');
        Route::post('/guest-bookings/{booking}/reject',     [App\Http\Controllers\Admin\AdminDashboardController::class, 'rejectPendingBooking'])
            ->name('guest-bookings.reject');
        Route::post('/guest-bookings/{booking}/complete',   [App\Http\Controllers\Admin\AdminDashboardController::class, 'completeGuestBooking'])
            ->name('guest-bookings.complete');
        Route::post('/guest-bookings/{booking}/send-promo', [App\Http\Controllers\Admin\AdminDashboardController::class, 'sendConversionPromo'])
            ->name('guest-bookings.send-promo');

        // ── Refunds ────────────────────────────────────────────────────────
        Route::get('/refunds',                [App\Http\Controllers\Admin\AdminBookingController::class, 'pendingRefunds'])
            ->name('refunds.pending');
        Route::post('/refunds/mark-sent',     [App\Http\Controllers\Admin\AdminBookingController::class, 'markRefundSent'])
            ->name('refunds.mark-sent');
        Route::get('/refunds/history',        [App\Http\Controllers\Admin\AdminBookingController::class, 'cancelledHistory'])
            ->name('refunds.history');
    });

require __DIR__.'/auth.php';