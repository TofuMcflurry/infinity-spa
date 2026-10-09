<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Drop the unique index explicitly before the column — Postgres
            // cascades this automatically on DROP COLUMN (confirmed: this
            // migration already ran cleanly there), but SQLite leaves a
            // stale reference to the dropped column inside the index
            // definition, causing "no such column: apple_id" on a fresh
            // migration run (e.g. the SQLite test database). Harmless no-op
            // risk on Postgres/MySQL — explicit index drops are standard
            // practice there too.
            $table->dropUnique(['apple_id']);
            $table->dropColumn('apple_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('apple_id')->nullable()->unique();
        });
    }
};