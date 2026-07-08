<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();

            // Who did the action (nullable for system/unauthenticated events like failed logins)
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('user_name')->nullable();  // snapshot — in case user is deleted later
            $table->string('user_role')->nullable();  // admin / therapist / customer

            // What happened
            $table->string('event');                  // e.g. booking.accepted, service.archived
            $table->string('target_type')->nullable(); // e.g. Booking, Service, Therapist
            $table->unsignedBigInteger('target_id')->nullable(); // e.g. 32

            // Extra context
            $table->json('metadata')->nullable();     // old/new values, reasons, etc.
            $table->string('ip_address')->nullable();
            $table->string('user_agent')->nullable();

            $table->timestamp('created_at')->useCurrent();

            // Indexes for fast querying in the audit log page
            $table->index('user_id');
            $table->index('event');
            $table->index('target_type');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};