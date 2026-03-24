<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;

class TherapistRatingLog extends Model
{
    protected $fillable = [
        'customer_id',
        'therapist_id',
        'last_rated_at',
    ];

    protected $casts = [
        'last_rated_at' => 'datetime',
    ];

    // ── Relations ─────────────────────────────────────────────────────────────
    public function customer()
    {
        return $this->belongsTo(User::class, 'customer_id');
    }

    public function therapist()
    {
        return $this->belongsTo(Therapist::class);
    }

    // ── Check if customer can rate this therapist ─────────────────────────────
    public static function canRate(int $customerId, int $therapistId): bool
    {
        $log = self::where('customer_id', $customerId)
            ->where('therapist_id', $therapistId)
            ->first();

        // Never rated before → can rate
        if (!$log) return true;

        // 12 calendar days cooldown from last rating
        $daysSinceLastRating = $log->last_rated_at->diffInDays(Carbon::now());

        return $daysSinceLastRating >= 12;
    }

    // ── Get days remaining before can rate again ──────────────────────────────
    public static function daysRemaining(int $customerId, int $therapistId): int
    {
        $log = self::where('customer_id', $customerId)
            ->where('therapist_id', $therapistId)
            ->first();

        if (!$log) return 0;

        $daysSince = $log->last_rated_at->diffInDays(Carbon::now());
        $remaining = 12 - $daysSince;

        return max(0, $remaining);
    }
}