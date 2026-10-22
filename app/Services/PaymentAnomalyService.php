<?php

namespace App\Services;

use App\Events\Audit\DuplicatePaymentDetected;
use App\Models\AuditLog;
use App\Models\Booking;

/**
 * Batch #31A.2B — durable, dedupe-safe recording of a payment anomaly
 * (a second successful charge for an already-paid booking, an amount/
 * currency mismatch, or a session whose non-payability could not be
 * confirmed). Visible to admins today via the existing Audit Log page
 * (filter event = payment.anomaly_detected) — no new UI required.
 *
 * CALLER CONTRACT: $lockedBooking must already be loaded under an active
 * lockForUpdate() transaction on this booking's row before calling. This
 * method performs no Stripe calls and acquires no lock itself — it relies
 * entirely on the caller's existing lock to make the read-check-then-write
 * below atomic, which is what prevents two concurrent/retried deliveries
 * of the SAME anomalous identity from ever producing two audit rows.
 */
class PaymentAnomalyService
{
    public static function record(Booking $lockedBooking, string $kind, string $identity, array $details): void
    {
        $alreadyRecorded = AuditLog::where('event', 'payment.anomaly_detected')
            ->where('target_type', 'Booking')
            ->where('target_id', $lockedBooking->id)
            ->get()
            ->contains(fn ($row) => ($row->metadata['identity'] ?? null) === $identity);

        if ($alreadyRecorded) {
            return;
        }

        DuplicatePaymentDetected::dispatch($lockedBooking->id, array_merge([
            'kind'     => $kind,
            'identity' => $identity,
        ], $details));

        $lockedBooking->update([
            'payment_anomaly_flagged_at' => $lockedBooking->payment_anomaly_flagged_at ?? now(),
        ]);
    }
}
