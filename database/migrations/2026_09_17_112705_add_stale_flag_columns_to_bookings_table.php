<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->timestamp('flagged_at')->nullable()->after('cancellation_reason');
            $table->string('flag_reason')->nullable()->after('flagged_at');
            $table->timestamp('resolved_at')->nullable()->after('flag_reason');
            $table->foreignId('resolved_by')->nullable()->after('resolved_at')
                ->constrained('users')->nullOnDelete();

            // Detection job filters on flagged_at IS NOT NULL AND resolved_at IS NULL
            // (the "Needs Attention" queue) and the cron scans flagged_at IS NULL —
            // both benefit from an index on the pair.
            $table->index(['flagged_at', 'resolved_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropIndex(['flagged_at', 'resolved_at']);
            $table->dropConstrainedForeignId('resolved_by');
            $table->dropColumn(['flagged_at', 'flag_reason', 'resolved_at']);
        });
    }
};
