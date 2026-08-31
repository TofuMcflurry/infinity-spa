<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loyalty_rewards', function (Blueprint $table) {
            $table->id();

            $table->foreignId('customer_id')
                ->constrained('users')
                ->cascadeOnDelete();

            // How many completed bookings in the current cycle (0-10)
            $table->unsignedInteger('completed_count')->default(0);

            // in_progress | available | redeemed
            $table->string('status')->default('in_progress');

            // Which reward cycle this is (1st, 2nd, 3rd free session...)
            $table->unsignedInteger('reward_cycle')->default(1);

            // When the customer redeemed the free session
            $table->timestamp('redeemed_at')->nullable();

            // Total completed bookings all-time (for display purposes)
            $table->unsignedInteger('total_completed')->default(0);

            $table->timestamps();

            // One loyalty record per customer per cycle
            $table->unique(['customer_id', 'reward_cycle']);

            // Indexes
            $table->index('customer_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_rewards');
    }
};