<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->enum('payment_type', ['downpayment', 'full'])->nullable();
            $table->string('stripe_checkout_session_id')->nullable();
            $table->string('stripe_payment_intent_id')->nullable();
            $table->decimal('paid_amount', 10, 2)->nullable();
            $table->enum('payment_status', ['pending', 'paid', 'refunded', 'partially_refunded'])->default('pending');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn([
                'payment_type',
                'stripe_checkout_session_id',
                'stripe_payment_intent_id',
                'paid_amount',
                'payment_status',
            ]);
        });
    }
};
