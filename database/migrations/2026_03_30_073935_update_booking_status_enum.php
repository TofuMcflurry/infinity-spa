<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // PostgreSQL — drop old constraint and add new one with pending_payment
        DB::statement("
            ALTER TABLE bookings
            DROP CONSTRAINT IF EXISTS bookings_status_check
        ");

        DB::statement("
            ALTER TABLE bookings
            ADD CONSTRAINT bookings_status_check
            CHECK (status IN (
                'pending_payment',
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
        DB::statement("
            ALTER TABLE bookings
            DROP CONSTRAINT IF EXISTS bookings_status_check
        ");

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
};