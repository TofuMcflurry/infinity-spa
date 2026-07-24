<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Drop the empty table and recreate with proper columns
        Schema::dropIfExists('rating_logs');

        Schema::create('rating_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('therapist_id')->constrained()->cascadeOnDelete();
            $table->foreignId('review_id')->constrained()->cascadeOnDelete();
            $table->decimal('old_rating', 3, 2)->nullable(); // rating before this review
            $table->decimal('new_rating', 3, 2);             // rating after this review
            $table->decimal('csat_score', 5, 2);             // CSAT percentage (0-100)
            $table->integer('total_reviews');                 // total reviews at time of log
            $table->boolean('triggered_flag')->default(false); // did this push below 3.5?
            $table->timestamp('created_at')->useCurrent();

            $table->index('therapist_id');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rating_logs');
    }
};