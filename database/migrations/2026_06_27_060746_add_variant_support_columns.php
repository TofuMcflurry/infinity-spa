<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('services', function (Blueprint $table) {
            // Soft "archive" instead of hard delete — keeps history/report integrity intact.
            $table->timestamp('archived_at')->nullable()->after('is_active');
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->foreignId('service_variant_id')
                ->nullable()
                ->after('service_id')
                ->constrained('service_variants')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('service_variant_id');
        });

        Schema::table('services', function (Blueprint $table) {
            $table->dropColumn('archived_at');
        });
    }
};