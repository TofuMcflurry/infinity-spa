<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    // A Full Payment booking has no session-day balance, so there's no
    // cash/cashless choice to make — payment_method is legitimately null
    // for those bookings. The existing 'cash'/'cashless' CHECK constraint
    // is untouched: CHECK conditions pass on NULL, so this only relaxes
    // the NOT NULL constraint added when the column was first created.
    public function up(): void
    {
        DB::statement('ALTER TABLE bookings ALTER COLUMN payment_method DROP NOT NULL');
    }

    public function down(): void
    {
        DB::statement("UPDATE bookings SET payment_method = 'cash' WHERE payment_method IS NULL");
        DB::statement('ALTER TABLE bookings ALTER COLUMN payment_method SET NOT NULL');
    }
};
