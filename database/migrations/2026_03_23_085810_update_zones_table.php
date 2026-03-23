<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Add full_address column to therapist_zones
        Schema::table('therapist_zones', function (Blueprint $table) {
            $table->string('full_address')->nullable()->after('zone_name');
        });

        // Add full_address to customer_addresses too
        Schema::table('customer_addresses', function (Blueprint $table) {
            $table->string('full_address')->nullable()->after('address');
        });
    }

    public function down(): void
    {
        Schema::table('therapist_zones', function (Blueprint $table) {
            $table->dropColumn('full_address');
        });
        Schema::table('customer_addresses', function (Blueprint $table) {
            $table->dropColumn('full_address');
        });
    }
};