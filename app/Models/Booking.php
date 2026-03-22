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
        'location',
        'zone_name',
        'scheduled_date',
        'scheduled_start',
        'scheduled_end',
        'travel_start',
        'buffer_end',
        'payment_method',
        'status',
        'rejection_reason',
    ];

    protected $casts = [
        'scheduled_date' => 'date',
    ];

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

    // ── Status helpers ──────────────────────────────

    public function isPending(): bool
    {
        return $this->status === 'pending';
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

    // ── Time computation (static helper) ────────────

    public static function computeTimeBlocks(
        string $scheduledStart,   // "10:00"
        int    $durationMinutes,  // 60
        int    $travelMinutes,    // 30
        int    $bufferMinutes = 30
    ): array {
        $start  = Carbon::createFromFormat('H:i', $scheduledStart);

        return [
            'travel_start'    => $start->copy()
                                       ->subMinutes($travelMinutes)
                                       ->format('H:i'),
            'scheduled_end'   => $start->copy()
                                       ->addMinutes($durationMinutes)
                                       ->format('H:i'),
            'buffer_end'      => $start->copy()
                                       ->addMinutes($durationMinutes)
                                       ->addMinutes($bufferMinutes)
                                       ->format('H:i'),
        ];
    }
}