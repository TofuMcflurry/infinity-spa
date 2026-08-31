<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LoyaltyVoucher extends Model
{
    protected $fillable = [
        'customer_id',
        'loyalty_reward_id',
        'code',
        'status',
        'covered_duration_minutes',
        'expires_at',
        'used_at',
        'used_in_booking_id',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'used_at'    => 'datetime',
    ];

    // ── Relations ──────────────────────────────────────────────────────────────
    public function customer()
    {
        return $this->belongsTo(User::class, 'customer_id');
    }

    public function loyaltyReward()
    {
        return $this->belongsTo(LoyaltyReward::class);
    }

    public function usedInBooking()
    {
        return $this->belongsTo(Booking::class, 'used_in_booking_id');
    }

    // ── Helpers ────────────────────────────────────────────────────────────────
    public function isUnused(): bool
    {
        return $this->status === 'unused';
    }

    public function isUsed(): bool
    {
        return $this->status === 'used';
    }

    public function isExpired(): bool
    {
        return $this->status === 'expired'
            || ($this->status === 'unused' && $this->expires_at->isPast());
    }

    public function isValid(): bool
    {
        return $this->isUnused() && !$this->isExpired();
    }

    public function daysUntilExpiry(): int
    {
        return max(0, (int) now()->diffInDays($this->expires_at, false));
    }
}