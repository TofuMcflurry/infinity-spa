<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LoyaltyReward extends Model
{
    const STATUSES = ['in_progress', 'available', 'voucher_issued', 'redeemed', 'expired'];
    
    protected $fillable = [
        'customer_id',
        'completed_count',
        'status',
        'reward_cycle',
        'redeemed_at',
        'total_completed',
    ];

    protected $casts = [
        'redeemed_at' => 'datetime',
    ];

    const BOOKINGS_REQUIRED = 10;

    public function customer()
    {
        return $this->belongsTo(User::class, 'customer_id');
    }

    public function isAvailable(): bool
    {
        return $this->status === 'available';
    }

    public function isRedeemed(): bool
    {
        return $this->status === 'redeemed';
    }

    public function isInProgress(): bool
    {
        return $this->status === 'in_progress';
    }

    public function progressPercentage(): int
    {
        return min(100, (int) round(($this->completed_count / self::BOOKINGS_REQUIRED) * 100));
    }

    public function bookingsRemaining(): int
    {
        return max(0, self::BOOKINGS_REQUIRED - $this->completed_count);
    }
}