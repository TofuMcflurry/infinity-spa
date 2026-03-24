<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ServiceRatingLog extends Model
{
    protected $fillable = [
        'customer_id',
        'service_group',
        'rated_at',
    ];

    protected $casts = [
        'rated_at' => 'datetime',
    ];

    // ── Relations ─────────────────────────────────────────────────────────────
    public function customer()
    {
        return $this->belongsTo(User::class, 'customer_id');
    }

    // ── Check if customer can rate this service group ─────────────────────────
    public static function canRate(int $customerId, string $serviceGroup): bool
    {
        // One rating per service group FOREVER
        return !self::where('customer_id', $customerId)
            ->where('service_group', $serviceGroup)
            ->exists();
    }
}