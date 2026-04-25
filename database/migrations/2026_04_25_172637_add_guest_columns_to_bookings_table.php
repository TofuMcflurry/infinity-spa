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
        Schema::table('bookings', function (Blueprint $table) {
            $table->string('guest_email')->nullable()->after('id');
            $table->string('guest_name')->nullable()->after('guest_email');
            $table->string('guest_phone')->nullable()->after('guest_name');
            $table->boolean('is_converted')->default(false)->after('guest_phone');
            $table->foreignId('converted_to_customer_id')->nullable()->after('is_converted')->constrained('users')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropForeign(['converted_to_customer_id']);
            $table->dropColumn(['guest_email', 'guest_name', 'guest_phone', 'is_converted', 'converted_to_customer_id']);
        });
    }
};
