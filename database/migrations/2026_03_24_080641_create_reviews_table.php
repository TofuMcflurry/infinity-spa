<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reviews', function (Blueprint $table) {
            $table->id();

            // Relations
            $table->foreignId('booking_id')
                ->constrained('bookings')
                ->onDelete('cascade');
            $table->foreignId('customer_id')
                ->constrained('users')
                ->onDelete('cascade');
            $table->foreignId('therapist_id')
                ->constrained('therapists')
                ->onDelete('cascade');

            // Service info
            $table->string('service_group');        // "Couple Massage"
            $table->foreignId('service_id')
                ->constrained('services')
                ->onDelete('cascade');

            // Ratings (nullable — pwedeng mag-rate ng isa lang)
            $table->tinyInteger('service_rating')
                ->nullable()
                ->unsigned();                       // 1-5
            $table->tinyInteger('therapist_rating')
                ->nullable()
                ->unsigned();                       // 1-5

            // Computed CSAT scores (stored for performance)
            $table->decimal('service_csat', 5, 2)
                ->nullable();                       // 0.00 - 100.00
            $table->decimal('therapist_csat', 5, 2)
                ->nullable();                       // 0.00 - 100.00

            // Review content
            $table->text('comment')->nullable();

            // Admin controls
            $table->boolean('is_visible')->default(true);
            $table->text('admin_note')->nullable();

            $table->timestamps();

            // Prevent duplicate booking reviews
            $table->unique('booking_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reviews');
    }
};