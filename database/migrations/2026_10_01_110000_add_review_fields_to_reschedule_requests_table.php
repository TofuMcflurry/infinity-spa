<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Adds the admin-review resolution fields to reschedule_requests.
     *
     * requested_start_at (existing) is the requester's preference and is
     * never overwritten. resolved_start_at is the separate, admin-chosen
     * FINAL schedule — it may differ from requested_start_at (see
     * AdminBookingController::approveRescheduleRequest()) — so the UI can
     * always show "Requested X · Final Y" without reconstructing anything
     * from the audit log. reviewed_at/reviewed_by_user_id record who acted
     * on the request and when, for both approval and rejection.
     */
    public function up(): void
    {
        Schema::table('reschedule_requests', function (Blueprint $table) {
            $table->timestamp('resolved_start_at')->nullable()->after('admin_notes');
            $table->timestamp('reviewed_at')->nullable()->after('resolved_start_at');
            $table->foreignId('reviewed_by_user_id')->nullable()->after('reviewed_at')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('reschedule_requests', function (Blueprint $table) {
            $table->dropForeign(['reviewed_by_user_id']);
            $table->dropColumn(['resolved_start_at', 'reviewed_at', 'reviewed_by_user_id']);
        });
    }
};
