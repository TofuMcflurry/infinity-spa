<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_reports', function (Blueprint $table) {
            $table->id();

            // Who filed the report
            $table->foreignId('reporter_id')->constrained('users')->cascadeOnDelete();
            $table->string('reporter_type'); // 'customer' or 'therapist'

            // Who was reported
            $table->foreignId('reported_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('reported_type'); // 'customer' or 'therapist'

            // Report details
            $table->string('reason');        // short reason (e.g. "Inappropriate behavior")
            $table->text('description')->nullable(); // full description/evidence
            
            // Admin review
            $table->string('status')->default('pending'); // pending / reviewed / dismissed
            $table->text('admin_note')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();

            $table->timestamps();

            // Indexes
            $table->index('reporter_id');
            $table->index('reported_user_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_reports');
    }
};