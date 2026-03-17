<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('google_id')->nullable()->unique();
            $table->string('apple_id')->nullable()->unique();
            $table->string('avatar')->nullable();
            $table->string('phone')->nullable()->change(); 
            $table->timestamp('otp_verified_at')->nullable();
            $table->boolean('is_otp_enabled')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'google_id',
                'apple_id',
                'avatar',
                'otp_verified_at',
                'is_otp_enabled'
            ]);
        });
    }
};