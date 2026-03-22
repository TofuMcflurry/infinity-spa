<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TherapistZone extends Model
{
    use HasFactory;

    protected $fillable = [
        'therapist_id',
        'zone_name',
        'travel_minutes',
    ];

    protected $casts = [
        'travel_minutes' => 'integer',
    ];

    // Zone belongs to a Therapist
    public function therapist()
    {
        return $this->belongsTo(Therapist::class);
    }
}