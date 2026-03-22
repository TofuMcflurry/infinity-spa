<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CustomerAddress extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'label',
        'address',
        'zone_name',
        'is_default',
    ];

    protected $casts = [
        'is_default' => 'boolean',
    ];

    // Address belongs to a User
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}