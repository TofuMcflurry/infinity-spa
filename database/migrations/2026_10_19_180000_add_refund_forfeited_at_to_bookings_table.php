<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Durable refund/voucher-forfeiture lock. Set once — the first time a
     * reschedule (direct admin reschedule, an approved reschedule request,
     * or an accepted reschedule proposal) moves a booking that was, at that
     * moment, already inside the 24-hour non-refundable window
     * (BookingCancellationService::cancel()'s existing $withinGrace rule).
     * Once set, BookingCancellationService::cancel() must treat the
     * booking as forfeited regardless of how far away the (possibly now
     * rescheduled) scheduled_start looks at actual cancellation time —
     * the exploit this closes: reschedule a within-24h booking to a
     * distant date, then cancel, and the live hours-until-session
     * computation would otherwise wrongly look "safe" again.
     *
     * Deliberately never cleared by any code path — see
     * BookingRescheduleService::reschedule(), which only ever sets this
     * once (guarded by "is it still null") and never unsets it.
     *
     * No backfill: existing bookings default to null (unaffected,
     * unchanged cancellation behavior) — see the Batch #26 report for why
     * reconstructing forfeiture retroactively from audit_logs history was
     * deliberately not attempted here.
     */
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->timestamp('refund_forfeited_at')->nullable()->after('refund_sent_at');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('refund_forfeited_at');
        });
    }
};
