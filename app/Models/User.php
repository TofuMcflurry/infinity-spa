<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'phone',
        'role',
        'google_id',
        'avatar',
        'otp_verified_at',
        'is_otp_enabled',
        'email_verified_at'
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'otp_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_otp_enabled' => 'boolean',
        ];
    }

    public function otpCodes()
    {
        return $this->hasMany(OtpCode::class);
    }

    public function hasVerifiedOtp(): bool
    {
        return !is_null($this->otp_verified_at);
    }

    public function markOtpAsVerified(): void
    {
        $this->otp_verified_at = now();
        
        // ✅ AUTO-VERIFY EMAIL - SET EMAIL_VERIFIED_AT
        if (!$this->email_verified_at) {
            $this->email_verified_at = now();
        }
        
        $this->save();
    }

    /**
     * Check if user is fully verified (both email and OTP if enabled)
     */
    public function isFullyVerified(): bool
    {
        if (!$this->email_verified_at) {
            return false;
        }

        if ($this->is_otp_enabled && !$this->hasVerifiedOtp()) {
            return false;
        }

        return true;
    }

    /**
     * Check if user is a Google user
     */
    public function isGoogleUser(): bool
    {
        return !is_null($this->google_id);
    }
}