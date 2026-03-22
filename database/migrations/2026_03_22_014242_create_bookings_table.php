<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')
                  ->constrained('users')
                  ->onDelete('cascade');
            $table->foreignId('therapist_id')
                  ->constrained()
                  ->onDelete('cascade');
            $table->foreignId('service_id')
                  ->constrained()
                  ->onDelete('cascade');

            // Location
            $table->string('location');            // "Home - Palm Jumeirah"
            $table->string('zone_name');           // "Palm Jumeirah"

            // Time columns
            $table->date('scheduled_date');
            $table->time('scheduled_start');       // 10:00 AM
            $table->time('scheduled_end');         // 11:00 AM (auto-computed)
            $table->time('travel_start');          // 9:30 AM  (auto-computed)
            $table->time('buffer_end');            // 11:30 AM (auto-computed)

            // Payment
            $table->enum('payment_method', ['cash', 'cashless']);

            // Status
            $table->enum('status', [
                'pending',
                'accepted',
                'rejected',
                'completed',
                'cancelled'
            ])->default('pending');

            $table->text('rejection_reason')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bookings');
    }
};