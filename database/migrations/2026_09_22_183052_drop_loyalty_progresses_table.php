<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// loyalty_progresses: an orphaned, superseded first draft of the loyalty-cycle
// feature — zero rows, zero references anywhere in app/ or resources/js/, and
// no corresponding "create" migration was ever committed for it. The feature
// it modeled is implemented today by loyalty_rewards / App\Services\LoyaltyService
// instead. Confirmed via audit before dropping.
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('loyalty_progresses');
    }

    public function down(): void
    {
        Schema::create('loyalty_progresses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->integer('completed_since_reset')->default(0);
            $table->string('status')->default('in_progress');
            $table->timestamp('available_at')->nullable();
            $table->timestamp('redeemed_at')->nullable();
            $table->integer('cycle_number')->default(1);
            $table->timestamps();
        });

        DB::statement("
            ALTER TABLE loyalty_progresses
            ADD CONSTRAINT loyalty_progresses_status_check
            CHECK (status IN ('in_progress', 'available', 'redeemed'))
        ");
    }
};
