<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Service extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'name_ar',
        'description',
        'duration_minutes',
        'price',
        'rating',
        'is_active',
    ];

    protected $casts = [
        'is_active'        => 'boolean',
        'price'            => 'decimal:2',
        'rating'           => 'decimal:2',
        'duration_minutes' => 'integer',
    ];

    // Service has many bookings
    public function bookings()
    {
        return $this->hasMany(Booking::class);
    }
}