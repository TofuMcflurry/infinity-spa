<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_cancellation_type_check");
        DB::statement("ALTER TABLE bookings ADD CONSTRAINT bookings_cancellation_type_check
            CHECK (cancellation_type IS NULL OR cancellation_type::text = ANY (
                ARRAY['refunded'::text, 'forfeited'::text, 'no_show'::text, 'expired'::text]
            ))");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_cancellation_type_check");
        DB::statement("ALTER TABLE bookings ADD CONSTRAINT bookings_cancellation_type_check
            CHECK (cancellation_type IS NULL OR cancellation_type::text = ANY (
                ARRAY['refunded'::text, 'forfeited'::text, 'no_show'::text]
            ))");
    }
};
