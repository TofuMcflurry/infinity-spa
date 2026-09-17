<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Carbon\Carbon;

class Booking extends Model
{
    use HasFactory;

    protected $fillable = [
        'customer_id',
        'therapist_id',
        'service_id',
        'service_variant_id',
        'location',
        'zone_name',
        'scheduled_start',
        'scheduled_end',
        'travel_start',
        'buffer_end',
        'payment_method',
        'status',
        'rejection_reason',
        'downpayment_amount',
        'remaining_amount',
        'downpayment_status',
        'downpayment_proof',
        'downpayment_submitted_at',
        'downpayment_verified_at',
        'cancelled_at',
        'cancellation_reason',
        'cancellation_type',
        'guest_email',
        'guest_name',
        'guest_phone',
        'is_converted',
        'converted_to_customer_id',
        'payment_type',
        'stripe_checkout_session_id',
        'stripe_payment_intent_id',
        'paid_amount',
        'payment_status',
        'voucher_code',
        'is_voucher_covered',
        'flagged_at',
        'flag_reason',
        'resolved_at',
        'resolved_by',
    ];

    protected $casts = [
        'scheduled_start' => 'datetime',
        'scheduled_end'   => 'datetime',
        'travel_start'    => 'datetime',
        'buffer_end'      => 'datetime',
        'downpayment_submitted_at' => 'datetime',
        'downpayment_verified_at'  => 'datetime',
        'cancelled_at'             => 'datetime',
        'flagged_at'               => 'datetime',
        'resolved_at'              => 'datetime',
        'downpayment_amount'       => 'decimal:2',
        'remaining_amount'         => 'decimal:2',
        'paid_amount'              => 'decimal:2',
        'is_voucher_covered'       => 'boolean',
    ];

    // Admin who resolved a stale-active-session flag
    public function resolvedBy()
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    // Booking belongs to a Customer (User)
    public function customer()
    {
        return $this->belongsTo(User::class, 'customer_id');
    }

    // Booking belongs to a Therapist
    public function therapist()
    {
        return $this->belongsTo(Therapist::class);
    }

    // Booking belongs to a Service
    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    // Booking belongs to a ServiceVariant (duration/price)
    public function serviceVariant()
    {
        return $this->belongsTo(ServiceVariant::class);
    }

    // ── Status helpers ──────────────────────────────

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    public function review()
    {
        return $this->hasOne(Review::class);
    }

    public function isAccepted(): bool
    {
        return $this->status === 'accepted';
    }

    public function isRejected(): bool
    {
        return $this->status === 'rejected';
    }

    public function isCompleted(): bool
    {
        return $this->status === 'completed';
    }

    public static function computeTimeBlocks(
        string $scheduledStart,
        int    $durationMinutes,
        int    $travelMinutes,
        int    $bufferMinutes = 30
    ): array {
        $start = Carbon::parse($scheduledStart);

        return [
            'travel_start'  => $start->copy()->subMinutes($travelMinutes),
            'scheduled_end' => $start->copy()->addMinutes($durationMinutes),
            'buffer_end'    => $start->copy()->addMinutes($durationMinutes + $bufferMinutes),
        ];
    }
}