<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Therapist extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'base_location',
        'bio',
        'experience_years',
        'rating',
        'gender',
        'specialty',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'rating'    => 'decimal:2',
    ];

    // Therapist belongs to a User
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    // Therapist has many zones (travel times)
    public function zones()
    {
        return $this->hasMany(TherapistZone::class);
    }

    // Therapist has many bookings
    public function bookings()
    {
        return $this->hasMany(Booking::class);
    }

    // Get travel time for a specific zone
    public function getTravelTime(string $zoneName): int
    {
        $zone = $this->zones()->where('zone_name', $zoneName)->first();
        return $zone ? $zone->travel_minutes : 30; // default 30 min
    }
}