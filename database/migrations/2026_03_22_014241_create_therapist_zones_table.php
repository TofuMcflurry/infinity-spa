<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('therapist_zones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('therapist_id')
                  ->constrained()
                  ->onDelete('cascade');
            $table->string('zone_name');         // "Palm Jumeirah"
            $table->integer('travel_minutes');   // 30
            $table->timestamps();

            // One therapist = one travel time per zone
            $table->unique(['therapist_id', 'zone_name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('therapist_zones');
    }
};