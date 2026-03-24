<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Review extends Model
{
    protected $fillable = [
        'booking_id',
        'customer_id',
        'therapist_id',
        'service_group',
        'service_id',
        'service_rating',
        'therapist_rating',
        'service_csat',
        'therapist_csat',
        'comment',
        'is_visible',
        'admin_note',
    ];

    protected $casts = [
        'is_visible'       => 'boolean',
        'service_csat'     => 'decimal:2',
        'therapist_csat'   => 'decimal:2',
    ];

    // ── Relations ─────────────────────────────────────────────────────────────
    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    public function customer()
    {
        return $this->belongsTo(User::class, 'customer_id');
    }

    public function therapist()
    {
        return $this->belongsTo(Therapist::class);
    }

    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    // ── CSAT Calculator ───────────────────────────────────────────────────────
    public static function computeCsat(int $stars): float
    {
        // Stars to points mapping
        $points = match($stars) {
            5 => 100,
            4 => 80,
            3 => 60,
            2 => 40,
            1 => 0,
            default => 0,
        };

        return $points;
    }

    // ── Recompute service rating after new review ─────────────────────────────
    public static function recomputeServiceRating(string $serviceGroup): void
    {
        $reviews = self::where('service_group', $serviceGroup)
            ->where('is_visible', true)
            ->whereNotNull('service_rating')
            ->get();

        if ($reviews->isEmpty()) return;

        // CSAT formula: SUM of points / total reviews
        $totalPoints = $reviews->sum(fn($r) => self::computeCsat($r->service_rating));
        $csat        = $totalPoints / $reviews->count();
        $stars       = round($csat / 20, 1);

        // Update all services in this group
        Service::where('group_name', $serviceGroup)
            ->update(['rating' => $stars]);
    }

    // ── Recompute therapist rating after new review ───────────────────────────
    public static function recomputeTherapistRating(int $therapistId): void
    {
        $reviews = self::where('therapist_id', $therapistId)
            ->where('is_visible', true)
            ->whereNotNull('therapist_rating')
            ->get();

        if ($reviews->isEmpty()) return;

        // CSAT formula
        $totalPoints = $reviews->sum(fn($r) => self::computeCsat($r->therapist_rating));
        $csat        = $totalPoints / $reviews->count();
        $stars       = round($csat / 20, 1);

        // Update therapist rating
        Therapist::where('id', $therapistId)
            ->update(['rating' => $stars]);

        // Flag if below 3.5 stars (70% CSAT)
        if ($stars < 3.5) {
            // TODO: Notify admin
        }
    }
}