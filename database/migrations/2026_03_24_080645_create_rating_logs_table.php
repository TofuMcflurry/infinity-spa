<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Service rating log ────────────────────────────────────────────────
        // Tracks which service groups have been rated by each customer (FOREVER)
        Schema::create('service_rating_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')
                ->constrained('users')
                ->onDelete('cascade');
            $table->string('service_group');        // "Couple Massage"
            $table->timestamp('rated_at');          // when they rated

            $table->timestamps();

            // One rating per customer per service group FOREVER
            $table->unique(['customer_id', 'service_group']);
        });

        // ── Therapist rating log ──────────────────────────────────────────────
        // Tracks last rating date per customer-therapist pair (12 day cooldown)
        Schema::create('therapist_rating_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')
                ->constrained('users')
                ->onDelete('cascade');
            $table->foreignId('therapist_id')
                ->constrained('therapists')
                ->onDelete('cascade');
            $table->timestamp('last_rated_at');     // when they last rated

            $table->timestamps();

            // One log per customer-therapist pair
            $table->unique(['customer_id', 'therapist_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('therapist_rating_logs');
        Schema::dropIfExists('service_rating_logs');
    }
};