<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Add restriction columns to users ──────────────────────────────────
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedTinyInteger('strike_count')->default(0)->after('is_blocked');
            $table->string('restriction_level')->default('none')->after('strike_count');
            // none | warned | temp_blocked | permanently_blocked
            $table->timestamp('restricted_until')->nullable()->after('restriction_level');
        });

        // ── User violations table ─────────────────────────────────────────────
        Schema::create('user_violations', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')
                ->constrained()
                ->cascadeOnDelete();

            $table->foreignId('issued_by')
                ->constrained('users')
                ->cascadeOnDelete();

            // Level of violation
            $table->string('level');
            // warning | temp_block | permanent_block

            // Duration for temp blocks (null for warnings and permanent)
            $table->unsignedInteger('duration_days')->nullable();

            // Why the violation was issued
            $table->string('reason');
            $table->text('description')->nullable();

            // Reference to the report that triggered this (optional)
            $table->foreignId('report_id')
                ->nullable()
                ->constrained('user_reports')
                ->nullOnDelete();

            // When the restriction expires (for temp blocks)
            $table->timestamp('expires_at')->nullable();

            // Whether this violation is still active
            $table->boolean('is_active')->default(true);

            // Strike number at time of issuance (1, 2, or 3)
            $table->unsignedTinyInteger('strike_number')->default(1);

            $table->timestamps();

            // Indexes
            $table->index('user_id');
            $table->index('level');
            $table->index('is_active');
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_violations');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['strike_count', 'restriction_level', 'restricted_until']);
        });
    }
};