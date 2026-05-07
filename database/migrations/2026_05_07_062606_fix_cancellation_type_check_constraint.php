<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Drop old constraint kung meron
        DB::statement("
            ALTER TABLE bookings 
            DROP CONSTRAINT IF EXISTS bookings_cancellation_type_check
        ");

        // 2. Clean up any bad existing data first
        DB::statement("
            UPDATE bookings 
            SET cancellation_type = NULL 
            WHERE cancellation_type NOT IN ('customer', 'admin', 'therapist')
        ");

        // 3. Now add the new constraint
        DB::statement("
            ALTER TABLE bookings 
            ADD CONSTRAINT bookings_cancellation_type_check 
            CHECK (cancellation_type IN ('customer', 'admin', 'therapist'))
        ");
    }

    public function down(): void
    {
        DB::statement("
            ALTER TABLE bookings 
            DROP CONSTRAINT IF EXISTS bookings_cancellation_type_check
        ");

        DB::statement("
            ALTER TABLE bookings 
            ADD CONSTRAINT bookings_cancellation_type_check 
            CHECK (cancellation_type IN ('customer', 'admin'))
        ");
    }
};