<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RatingLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'therapist_id',
        'review_id',
        'old_rating',
        'new_rating',
        'csat_score',
        'total_reviews',
        'triggered_flag',
        'created_at',
    ];

    protected $casts = [
        'old_rating'     => 'decimal:2',
        'new_rating'     => 'decimal:2',
        'csat_score'     => 'decimal:2',
        'triggered_flag' => 'boolean',
        'created_at'     => 'datetime',
    ];

    public function therapist()
    {
        return $this->belongsTo(Therapist::class);
    }

    public function review()
    {
        return $this->belongsTo(Review::class);
    }
}