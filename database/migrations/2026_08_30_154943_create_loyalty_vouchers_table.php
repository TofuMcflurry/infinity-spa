<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loyalty_vouchers', function (Blueprint $table) {
            $table->id();

            $table->foreignId('customer_id')
                ->constrained('users')
                ->cascadeOnDelete();

            $table->foreignId('loyalty_reward_id')
                ->constrained('loyalty_rewards')
                ->cascadeOnDelete();

            // Unique voucher code e.g. IHS-FREE-X7K2
            $table->string('code', 20)->unique();

            // Status: unused | used | expired
            $table->string('status')->default('unused');

            // Coverage — any service but 60 min only
            $table->unsignedInteger('covered_duration_minutes')->default(60);

            // When the voucher expires (30 days from generation)
            $table->timestamp('expires_at');

            // When it was used
            $table->timestamp('used_at')->nullable();

            // Which booking used this voucher
            $table->foreignId('used_in_booking_id')
                ->nullable()
                ->constrained('bookings')
                ->nullOnDelete();

            $table->timestamps();

            // Indexes
            $table->index('customer_id');
            $table->index('code');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_vouchers');
    }
};