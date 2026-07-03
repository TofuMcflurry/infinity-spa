<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('services', function (Blueprint $table) {
            // Duration and price now live in service_variants.
            // Parent service rows no longer need these columns,
            // so we relax the NOT NULL constraint.
            $table->unsignedInteger('duration_minutes')->nullable()->change();
            $table->decimal('price', 8, 2)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->unsignedInteger('duration_minutes')->nullable(false)->change();
            $table->decimal('price', 8, 2)->nullable(false)->change();
        });
    }
};