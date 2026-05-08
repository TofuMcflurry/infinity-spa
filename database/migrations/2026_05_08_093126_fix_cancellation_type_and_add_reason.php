<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Fix cancellation_type — replace who-cancelled with outcome type
        DB::statement("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_cancellation_type_check");
        DB::statement("ALTER TABLE bookings ADD CONSTRAINT bookings_cancellation_type_check
            CHECK (cancellation_type IS NULL OR cancellation_type::text = ANY (
                ARRAY['refunded'::text, 'forfeited'::text, 'no_show'::text]
            ))");

        // 2. Add cancellation_reason column
        Schema::table('bookings', function (Blueprint $table) {
            $table->string('cancellation_reason')->nullable()->after('cancellation_type');
        });
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_cancellation_type_check");
        DB::statement("ALTER TABLE bookings ADD CONSTRAINT bookings_cancellation_type_check
            CHECK (cancellation_type::text = ANY (
                ARRAY['customer'::text, 'admin'::text, 'therapist'::text]
            ))");

        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('cancellation_reason');
        });
    }
};