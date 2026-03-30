<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            // Downpayment amounts
            $table->decimal('downpayment_amount', 8, 2)
                ->nullable()
                ->after('payment_method');
            $table->decimal('remaining_amount', 8, 2)
                ->nullable()
                ->after('downpayment_amount');

            // Downpayment status
            $table->enum('downpayment_status', [
                'pending',    // waiting for customer to pay
                'submitted',  // customer uploaded proof
                'verified',   // admin verified
                'refunded',   // cancelled within grace period
                'forfeited',  // cancelled outside grace period
            ])->nullable()->after('remaining_amount');

            // Proof of payment (screenshot)
            $table->string('downpayment_proof')
                ->nullable()
                ->after('downpayment_status');

            // Timestamps
            $table->timestamp('downpayment_submitted_at')
                ->nullable()
                ->after('downpayment_proof');
            $table->timestamp('downpayment_verified_at')
                ->nullable()
                ->after('downpayment_submitted_at');

            // Cancellation
            $table->timestamp('cancelled_at')
                ->nullable()
                ->after('downpayment_verified_at');
            $table->enum('cancellation_type', [
                'refunded',   // cancelled before 24hrs = refund
                'forfeited',  // cancelled within 24hrs = forfeited
                'no_show',    // customer no-show = forfeited
            ])->nullable()->after('cancelled_at');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn([
                'downpayment_amount',
                'remaining_amount',
                'downpayment_status',
                'downpayment_proof',
                'downpayment_submitted_at',
                'downpayment_verified_at',
                'cancelled_at',
                'cancellation_type',
            ]);
        });
    }
};