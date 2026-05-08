<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Add refund tracking columns
        Schema::table('bookings', function (Blueprint $table) {
            $table->string('refund_reference')->nullable()->after('cancellation_reason');
            $table->timestamp('refund_sent_at')->nullable()->after('refund_reference');
        });

        // 2. Update downpayment_status constraint to include 'refund_sent'
        // First check what constraint exists
        DB::statement("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_downpayment_status_check");
        DB::statement("ALTER TABLE bookings ADD CONSTRAINT bookings_downpayment_status_check
            CHECK (downpayment_status IS NULL OR downpayment_status::text = ANY (
                ARRAY[
                    'pending'::text,
                    'submitted'::text,
                    'verified'::text,
                    'refunded'::text,
                    'forfeited'::text,
                    'refund_sent'::text
                ]
            ))");
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn(['refund_reference', 'refund_sent_at']);
        });

        DB::statement("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_downpayment_status_check");
        DB::statement("ALTER TABLE bookings ADD CONSTRAINT bookings_downpayment_status_check
            CHECK (downpayment_status::text = ANY (
                ARRAY[
                    'pending'::text,
                    'submitted'::text,
                    'verified'::text,
                    'refunded'::text,
                    'forfeited'::text
                ]
            ))");
    }
};