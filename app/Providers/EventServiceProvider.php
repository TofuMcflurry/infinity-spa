<?php

namespace App\Providers;

use Illuminate\Foundation\Support\Providers\EventServiceProvider as ServiceProvider;

// Audit Events
use App\Events\Audit\BookingAccepted;
use App\Events\Audit\BookingRejected;
use App\Events\Audit\BookingCancelled;
use App\Events\Audit\BookingCompleted;
use App\Events\Audit\DownpaymentVerified;
use App\Events\Audit\RefundSent;
use App\Events\Audit\ServiceCreated;
use App\Events\Audit\ServiceUpdated;
use App\Events\Audit\ServiceArchived;
use App\Events\Audit\ServiceRestored;
use App\Events\Audit\ServiceToggled;
use App\Events\Audit\TherapistApproved;
use App\Events\Audit\TherapistDeactivated;
use App\Events\Audit\TherapistRejected;
use App\Events\Audit\UserLoggedIn;
use App\Events\Audit\UserLoggedOut;
use App\Events\Audit\LoginFailed;
use App\Events\Audit\OtpVerified;
use App\Events\Audit\GoogleLoginUsed;
use App\Events\Audit\CustomerBookingCreated;
use App\Events\Audit\CustomerBookingCancelled;
use App\Events\Audit\CustomerDownpaymentUploaded;
use App\Events\Audit\CustomerReviewSubmitted;
use App\Events\Audit\CustomerProfileUpdated;

// Listener
use App\Listeners\AuditLogListener;

class EventServiceProvider extends ServiceProvider
{
    protected $listen = [
        // ── Booking ──────────────────────────────────────────────────────────
        BookingAccepted::class       => [AuditLogListener::class],
        BookingRejected::class       => [AuditLogListener::class],
        BookingCancelled::class      => [AuditLogListener::class],
        BookingCompleted::class      => [AuditLogListener::class],
        DownpaymentVerified::class   => [AuditLogListener::class],
        RefundSent::class            => [AuditLogListener::class],

        // ── Service ───────────────────────────────────────────────────────────
        ServiceCreated::class        => [AuditLogListener::class],
        ServiceUpdated::class        => [AuditLogListener::class],
        ServiceArchived::class       => [AuditLogListener::class],
        ServiceRestored::class       => [AuditLogListener::class],
        ServiceToggled::class        => [AuditLogListener::class],

        // ── Therapist ─────────────────────────────────────────────────────────
        TherapistApproved::class     => [AuditLogListener::class],
        TherapistDeactivated::class  => [AuditLogListener::class],
        TherapistRejected::class     => [AuditLogListener::class],

        // ── Auth ──────────────────────────────────────────────────────────────
        UserLoggedIn::class          => [AuditLogListener::class],
        UserLoggedOut::class         => [AuditLogListener::class],
        LoginFailed::class           => [AuditLogListener::class],
        OtpVerified::class           => [AuditLogListener::class],
        GoogleLoginUsed::class       => [AuditLogListener::class],

        // ── Customer ──────────────────────────────────────────────────────────
        CustomerBookingCreated::class      => [AuditLogListener::class],
        CustomerBookingCancelled::class    => [AuditLogListener::class],
        CustomerDownpaymentUploaded::class => [AuditLogListener::class],
        CustomerReviewSubmitted::class     => [AuditLogListener::class],
        CustomerProfileUpdated::class      => [AuditLogListener::class],

        // ── Trust & Safety ────────────────────────────────────────────────────
        \App\Events\Audit\TrustWarningIssued::class       => [AuditLogListener::class],
        \App\Events\Audit\TrustTempBlockIssued::class     => [AuditLogListener::class],
        \App\Events\Audit\TrustPermanentBlock::class      => [AuditLogListener::class],
        \App\Events\Audit\TrustRestrictionLifted::class   => [AuditLogListener::class],
    ];
}