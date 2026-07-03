<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('duration_minutes');
            $table->decimal('price', 8, 2);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            // A service shouldn't have two variants with the same duration
            $table->unique(['service_id', 'duration_minutes']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_variants');
    }
};