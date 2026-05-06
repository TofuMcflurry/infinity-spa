<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check");

        DB::statement("
            ALTER TABLE bookings
            ADD CONSTRAINT bookings_status_check
            CHECK (status IN (
                'pending',
                'pending_payment',
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
        DB::statement("UPDATE bookings SET status = 'pending' WHERE status IN ('en_route', 'arrived', 'pending_payment')");

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