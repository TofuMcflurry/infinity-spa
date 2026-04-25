<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RestDayRequest extends Model
{
    protected $fillable = [
        'therapist_id', 'requested_date', 'reason', 'status', 'admin_notes',
    ];

    protected $casts = [
        'requested_date' => 'date',
    ];

    public function therapist()
    {
        return $this->belongsTo(User::class, 'therapist_id');
    }
}
