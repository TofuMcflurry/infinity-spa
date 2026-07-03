<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Service extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'name_ar',
        'description',
        'image',
        'category',
        'group_name',
        'group_name_ar',
        'is_active',
        'rating',
        'archived_at',
    ];

    protected $casts = [
        'is_active'   => 'boolean',
        'rating'      => 'decimal:2',
        'archived_at' => 'datetime',
    ];

    public function variants()
    {
        return $this->hasMany(ServiceVariant::class)->orderBy('duration_minutes');
    }

    public function bookings()
    {
        return $this->hasMany(Booking::class);
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }
}