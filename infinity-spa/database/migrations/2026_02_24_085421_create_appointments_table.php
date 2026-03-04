<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('appointments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->foreignId('therapist_id')->constrained();
            $table->foreignId('service_id')->constrained();
            
            $table->timestamp('start_time');
            $table->timestamp('end_time'); // We will calculate this in the Controller
            
            $table->string('status')->default('pending'); // pending, confirmed, completed, cancelled
            $table->text('home_address');
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('appointments');
    }
};
