<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    public $timestamps = false; // we only have created_at, no updated_at

    protected $fillable = [
        'user_id',
        'user_name',
        'user_role',
        'event',
        'target_type',
        'target_id',
        'metadata',
        'ip_address',
        'user_agent',
        'created_at',
    ];

    protected $casts = [
        'metadata'   => 'array',
        'created_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}