<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserViolation extends Model
{
    protected $fillable = [
        'user_id',
        'issued_by',
        'level',
        'duration_days',
        'reason',
        'description',
        'report_id',
        'expires_at',
        'is_active',
        'strike_number',
    ];

    protected $casts = [
        'is_active'   => 'boolean',
        'expires_at'  => 'datetime',
        'created_at'  => 'datetime',
        'updated_at'  => 'datetime',
    ];

    // ── Relations ──────────────────────────────────────────────────────────────
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function issuedBy()
    {
        return $this->belongsTo(User::class, 'issued_by');
    }

    public function report()
    {
        return $this->belongsTo(UserReport::class, 'report_id');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    public function getLevelLabelAttribute(): string
    {
        return match($this->level) {
            'warning'          => 'Warning',
            'temp_block'       => "Temporary Block ({$this->duration_days} days)",
            'permanent_block'  => 'Permanent Block',
            default            => ucfirst($this->level),
        };
    }
}