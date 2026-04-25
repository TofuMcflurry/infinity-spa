<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RescheduleRequest extends Model
{
    protected $fillable = [
        'booking_id', 'therapist_id', 'requested_date', 'requested_time',
        'reason', 'status', 'admin_notes',
    ];

    protected $casts = [
        'requested_date' => 'date',
    ];

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    public function therapist()
    {
        return $this->belongsTo(User::class, 'therapist_id');
    }
}
