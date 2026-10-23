<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Nullable so existing user_reports rows (filed before booking-linked
     * reporting existed) remain valid — only new, booking-linked reports
     * populate this column. The partial unique index below only applies
     * where booking_id is set, so those historical rows are never
     * considered for the one-report-per-booking duplicate check.
     */
    public function up(): void
    {
        Schema::table('user_reports', function (Blueprint $table) {
            $table->foreignId('booking_id')
                ->nullable()
                ->after('reported_type')
                ->constrained('bookings')
                ->nullOnDelete();
        });

        // Partial unique index: Laravel's schema builder has no unique()
        // WHERE clause, and a plain unique(reporter_id, booking_id) would
        // reject every row after the first NULL-booking_id report from the
        // same reporter (Postgres treats non-partial unique NULLs as
        // distinct per-column but this keeps the "only booking-linked
        // reports are deduplicated" rule explicit and self-documenting).
        DB::statement(
            'CREATE UNIQUE INDEX idx_reports_reporter_booking_unique ON user_reports (reporter_id, booking_id) WHERE booking_id IS NOT NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS idx_reports_reporter_booking_unique');

        Schema::table('user_reports', function (Blueprint $table) {
            $table->dropConstrainedForeignId('booking_id');
        });
    }
};
