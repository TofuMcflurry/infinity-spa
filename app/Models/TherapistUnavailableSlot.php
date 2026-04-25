<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TherapistUnavailableSlot extends Model
{
    protected $table = 'therapist_unavailable_slots';

    protected $fillable = [
        'therapist_id', 'date', 'start_time', 'end_time', 'is_full_day', 'reason',
    ];

    protected $casts = [
        'is_full_day' => 'boolean',
        'date'        => 'date',
    ];

    public function therapist()
    {
        return $this->belongsTo(User::class, 'therapist_id');
    }
}
