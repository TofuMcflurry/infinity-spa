<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('therapists', function (Blueprint $table) {
            // Day off (e.g. 'Tuesday')
            $table->string('day_off')->default('Tuesday')->after('is_active');
            // Shift start (e.g. '16:00')
            $table->time('shift_start')->default('16:00')->after('day_off');
            // Shift end next day (e.g. '04:00')
            $table->time('shift_end')->default('04:00')->after('shift_start');
            // Does shift cross midnight?
            $table->boolean('crosses_midnight')->default(true)->after('shift_end');
        });
    }

    public function down(): void
    {
        Schema::table('therapists', function (Blueprint $table) {
            $table->dropColumn(['day_off', 'shift_start', 'shift_end', 'crosses_midnight']);
        });
    }
};