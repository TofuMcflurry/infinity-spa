<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Generalizes reschedule_requests from a therapist-only request table
     * into a shared customer+therapist request system.
     *
     * The old `therapist_id` column stored the REQUESTING therapist's own
     * users.id (see TherapistScheduleController::storeRescheduleRequest) —
     * not the booking's assigned therapist — which has no equivalent
     * meaning for a customer-submitted request. Rather than silently
     * repurposing it, it's replaced with requested_by_user_id +
     * requested_by_role, and the separate requested_date/requested_time
     * columns are replaced with a single requested_start_at datetime
     * (same single-field, Asia/Dubai-wall-clock convention the rest of the
     * booking system already uses for scheduled_start et al.).
     */
    public function up(): void
    {
        Schema::table('reschedule_requests', function (Blueprint $table) {
            $table->foreignId('requested_by_user_id')->nullable()->after('booking_id')
                ->constrained('users')->nullOnDelete();
            $table->string('requested_by_role')->nullable()->after('requested_by_user_id');
            $table->timestamp('requested_start_at')->nullable()->after('requested_by_role');
        });

        // Backfill any existing rows — every pre-existing row was
        // therapist-submitted, so the mapping is unambiguous. Postgres
        // supports `date + time` arithmetic directly, producing a
        // timestamp, so this is a single statement rather than a PHP loop.
        DB::statement("
            UPDATE reschedule_requests
            SET requested_by_user_id = therapist_id,
                requested_by_role    = 'therapist',
                requested_start_at   = (requested_date + requested_time)::timestamp
        ");

        Schema::table('reschedule_requests', function (Blueprint $table) {
            $table->dropForeign(['therapist_id']);
            $table->dropColumn(['therapist_id', 'requested_date', 'requested_time']);
        });

        DB::statement('ALTER TABLE reschedule_requests ALTER COLUMN requested_by_user_id SET NOT NULL');
        DB::statement('ALTER TABLE reschedule_requests ALTER COLUMN requested_by_role SET NOT NULL');
        DB::statement('ALTER TABLE reschedule_requests ALTER COLUMN requested_start_at SET NOT NULL');
        DB::statement("
            ALTER TABLE reschedule_requests
            ADD CONSTRAINT reschedule_requests_role_check
            CHECK (requested_by_role IN ('customer', 'therapist'))
        ");

        // Replaces the old (therapist_id, status) index with the new
        // requester column — same shape, same purpose.
        Schema::table('reschedule_requests', function (Blueprint $table) {
            $table->index(['requested_by_user_id', 'status'], 'reschedule_requests_requester_status_index');
        });
    }

    public function down(): void
    {
        Schema::table('reschedule_requests', function (Blueprint $table) {
            $table->dropIndex('reschedule_requests_requester_status_index');
        });

        DB::statement('ALTER TABLE reschedule_requests DROP CONSTRAINT IF EXISTS reschedule_requests_role_check');

        Schema::table('reschedule_requests', function (Blueprint $table) {
            $table->foreignId('therapist_id')->nullable()->after('booking_id')
                ->constrained('users')->cascadeOnDelete();
            $table->date('requested_date')->nullable();
            $table->time('requested_time')->nullable();
        });

        DB::statement("
            UPDATE reschedule_requests
            SET therapist_id   = requested_by_user_id,
                requested_date = requested_start_at::date,
                requested_time = requested_start_at::time
            WHERE requested_by_role = 'therapist'
        ");

        Schema::table('reschedule_requests', function (Blueprint $table) {
            $table->dropForeign(['requested_by_user_id']);
            $table->dropColumn(['requested_by_user_id', 'requested_by_role', 'requested_start_at']);
        });

        DB::statement('ALTER TABLE reschedule_requests ALTER COLUMN therapist_id SET NOT NULL');
        DB::statement('ALTER TABLE reschedule_requests ALTER COLUMN requested_date SET NOT NULL');
        DB::statement('ALTER TABLE reschedule_requests ALTER COLUMN requested_time SET NOT NULL');
    }
};
