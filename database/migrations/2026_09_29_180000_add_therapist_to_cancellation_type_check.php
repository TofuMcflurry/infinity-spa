<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * TherapistBookingController::cancel() has always set
     * cancellation_type => 'therapist' for a therapist-initiated
     * cancellation, but bookings_cancellation_type_check (see
     * 2026_09_06_170000_add_expired_to_cancellation_type_check.php) never
     * allowed it — only 'refunded'|'forfeited'|'no_show'|'expired' — so that
     * action throws a QueryException in Postgres today. This only widens the
     * constraint to also allow the value the app already writes; no booking
     * data is touched and no other allowed value changes.
     */
    public function up(): void
    {
        DB::statement("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_cancellation_type_check");
        DB::statement("ALTER TABLE bookings ADD CONSTRAINT bookings_cancellation_type_check
            CHECK (cancellation_type IS NULL OR cancellation_type::text = ANY (
                ARRAY['refunded'::text, 'forfeited'::text, 'no_show'::text, 'expired'::text, 'therapist'::text]
            ))");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_cancellation_type_check");
        DB::statement("ALTER TABLE bookings ADD CONSTRAINT bookings_cancellation_type_check
            CHECK (cancellation_type IS NULL OR cancellation_type::text = ANY (
                ARRAY['refunded'::text, 'forfeited'::text, 'no_show'::text, 'expired'::text]
            ))");
    }
};
