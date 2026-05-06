<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // PostgreSQL: alter enum by adding new values
        DB::statement("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check");

        DB::statement("
            ALTER TABLE bookings
            ADD CONSTRAINT bookings_status_check
            CHECK (status IN (
                'pending',
                'accepted',
                'en_route',
                'arrived',
                'completed',
                'rejected',
                'cancelled'
            ))
        ");
    }

    public function down(): void
    {
        // First set any en_route/arrived back to accepted so constraint won't fail
        DB::statement("UPDATE bookings SET status = 'accepted' WHERE status IN ('en_route', 'arrived')");

        DB::statement("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check");

        DB::statement("
            ALTER TABLE bookings
            ADD CONSTRAINT bookings_status_check
            CHECK (status IN (
                'pending',
                'accepted',
                'completed',
                'rejected',
                'cancelled'
            ))
        ");
    }
};