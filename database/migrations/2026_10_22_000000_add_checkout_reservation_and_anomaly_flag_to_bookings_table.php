<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            // Checkout-session creation reservation (Batch #31A.2B) — a
            // short-lived claim written atomically, under a row lock, before
            // any Stripe HTTP call, so two concurrent/sequential requests for
            // the same booking can never independently create two sessions.
            // Both null means "no checkout attempt currently in flight."
            $table->string('checkout_reservation_token')->nullable()->after('stripe_checkout_session_id');
            $table->timestamp('checkout_reservation_expires_at')->nullable()->after('checkout_reservation_token');

            // Set once, durably, the first time a second successful Stripe
            // payment (or an unconfirmed-expiry orphan session) is detected
            // for a booking that already has a recorded payment. Never
            // cleared automatically — a human resolves the underlying
            // incident, visible via the existing Admin Audit Log
            // (event = 'payment.anomaly_detected').
            $table->timestamp('payment_anomaly_flagged_at')->nullable()->after('checkout_reservation_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn([
                'checkout_reservation_token',
                'checkout_reservation_expires_at',
                'payment_anomaly_flagged_at',
            ]);
        });
    }
};
