<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ServiceVariant extends Model
{
    protected $fillable = [
        'service_id',
        'duration_minutes',
        'price',
        'is_active',
    ];

    protected $casts = [
        'is_active'        => 'boolean',
        'price'            => 'decimal:2',
        'duration_minutes' => 'integer',
    ];

    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    public function bookings()
    {
        return $this->hasMany(Booking::class);
    }
}