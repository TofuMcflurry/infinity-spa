<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            // Drop old TIME columns
            $table->dropColumn([
                'scheduled_date',
                'scheduled_start',
                'scheduled_end',
                'travel_start',
                'buffer_end',
            ]);
        });

        Schema::table('bookings', function (Blueprint $table) {
            // Add new DATETIME columns
            $table->timestamp('scheduled_start')->nullable()->after('zone_name');
            $table->timestamp('scheduled_end')->nullable()->after('scheduled_start');
            $table->timestamp('travel_start')->nullable()->after('scheduled_end');
            $table->timestamp('buffer_end')->nullable()->after('travel_start');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn([
                'scheduled_start',
                'scheduled_end',
                'travel_start',
                'buffer_end',
            ]);
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->date('scheduled_date')->nullable();
            $table->time('scheduled_start')->nullable();
            $table->time('scheduled_end')->nullable();
            $table->time('travel_start')->nullable();
            $table->time('buffer_end')->nullable();
        });
    }
};