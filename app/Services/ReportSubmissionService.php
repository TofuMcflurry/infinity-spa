<?php

namespace App\Services;

use App\Events\Audit\CustomerReportSubmitted;
use App\Events\Audit\TherapistReportSubmitted;
use App\Models\Booking;
use App\Models\UserReport;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportSubmissionService
{
    /**
     * The migration's partial unique index — see
     * database/migrations/2026_10_23_000000_add_booking_id_to_user_reports_table.php.
     * Named explicitly here so the 23505 handler below can recognize *this*
     * constraint specifically rather than any unique violation on the table.
     */
    private const DUPLICATE_INDEX = 'idx_reports_reporter_booking_unique';

    /**
     * Creates a booking-linked UserReport and fires its audit event,
     * rejecting a second report from the same reporter for the same
     * booking with a 409.
     *
     * The audit dispatch happens *inside* the same transaction as the
     * insert, immediately after UserReport::create() and before the
     * transaction commits — mirroring BookingController::store's
     * "the synchronous audit row commits or rolls back with the booking"
     * pattern. AuditLogListener runs synchronously; if it (or anything
     * else) throws, DB::transaction rolls back the whole thing, so a
     * report row can never persist without its audit row, and vice versa.
     *
     * The booking row is locked for the duration of the duplicate check +
     * insert — the same lock-an-existing-row stand-in used by
     * BookingController::store (which locks the therapist row before its
     * own check-then-insert, since the row being created doesn't exist yet
     * to lock directly). That serializes two near-simultaneous submissions
     * for the same reporter+booking, so the second always observes the
     * first's committed row before deciding to insert.
     *
     * The migration's partial unique index is the backstop if that lock is
     * ever bypassed. Only a 23505 naming that specific index is mapped to
     * the same 409 the lock path already returns — any other unique
     * violation (a different constraint) or unrelated database error is
     * rethrown untouched.
     */
    public static function submit(
        Booking  $booking,
        int      $reporterId,
        string   $reporterType,
        int      $reportedUserId,
        string   $reportedType,
        string   $reason,
        ?string  $description,
        ?Request $request = null,
    ): UserReport {
        try {
            return DB::transaction(function () use (
                $booking, $reporterId, $reporterType, $reportedUserId, $reportedType, $reason, $description, $request
            ) {
                $locked = Booking::where('id', $booking->id)->lockForUpdate()->firstOrFail();

                if (UserReport::where('reporter_id', $reporterId)->where('booking_id', $locked->id)->exists()) {
                    abort(409, 'You have already reported this booking.');
                }

                $report = UserReport::create([
                    'reporter_id'      => $reporterId,
                    'reporter_type'    => $reporterType,
                    'reported_user_id' => $reportedUserId,
                    'reported_type'    => $reportedType,
                    'booking_id'       => $locked->id,
                    'reason'           => $reason,
                    'description'      => $description,
                    'status'           => 'pending',
                ]);

                if ($reporterType === 'customer') {
                    CustomerReportSubmitted::dispatch($report->id, $locked->id, $reportedUserId, $reason, $request);
                } else {
                    TherapistReportSubmitted::dispatch($report->id, $locked->id, $reportedUserId, $reason, $request);
                }

                return $report;
            });
        } catch (QueryException $e) {
            if ((string) $e->getCode() === '23505' && str_contains($e->getMessage(), self::DUPLICATE_INDEX)) {
                abort(409, 'You have already reported this booking.');
            }

            throw $e;
        }
    }
}
