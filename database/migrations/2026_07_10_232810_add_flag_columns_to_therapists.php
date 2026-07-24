<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('therapists', function (Blueprint $table) {
            // Flagged when CSAT drops below 3.5 stars (70%)
            $table->boolean('is_flagged')->default(false)->after('rating');
            $table->timestamp('flagged_at')->nullable()->after('is_flagged');
            $table->text('flag_reason')->nullable()->after('flagged_at');
        });
    }

    public function down(): void
    {
        Schema::table('therapists', function (Blueprint $table) {
            $table->dropColumn(['is_flagged', 'flagged_at', 'flag_reason']);
        });
    }
};