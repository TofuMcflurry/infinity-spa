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

    // ── Relations ──────────────────────────────────────────────────────────────
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

    // ── CSAT Calculator ────────────────────────────────────────────────────────
    public static function computeCsat(int $stars): float
    {
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

    // ── Recompute service rating after new review ──────────────────────────────
    public static function recomputeServiceRating(string $serviceGroup): void
    {
        $reviews = self::where('service_group', $serviceGroup)
            ->where('is_visible', true)
            ->whereNotNull('service_rating')
            ->get();

        if ($reviews->isEmpty()) return;

        $totalPoints = $reviews->sum(fn($r) => self::computeCsat($r->service_rating));
        $csat        = $totalPoints / $reviews->count();
        $stars       = round($csat / 20, 1);

        Service::where('group_name', $serviceGroup)
            ->update(['rating' => $stars]);
    }

    // ── Recompute therapist rating after new review ────────────────────────────
    public static function recomputeTherapistRating(int $therapistId, int $reviewId): void
    {
        $therapist = Therapist::find($therapistId);
        if (!$therapist) return;

        $reviews = self::where('therapist_id', $therapistId)
            ->where('is_visible', true)
            ->whereNotNull('therapist_rating')
            ->get();

        if ($reviews->isEmpty()) return;

        $oldRating   = $therapist->rating;
        $totalPoints = $reviews->sum(fn($r) => self::computeCsat($r->therapist_rating));
        $csat        = $totalPoints / $reviews->count();
        $newStars    = round($csat / 20, 1);
        $isFlagged   = $newStars < 3.5;

        // ── Update therapist rating + flag status ──────────────────────────────
        $therapist->update([
            'rating'      => $newStars,
            'is_flagged'  => $isFlagged,
            'flagged_at'  => $isFlagged && !$therapist->is_flagged ? now() : $therapist->flagged_at,
            'flag_reason' => $isFlagged
                ? "CSAT dropped to {$newStars} stars ({$csat}%) based on {$reviews->count()} review(s). Threshold: 3.5 stars (70%)."
                : $therapist->flag_reason, // keep existing reason if no longer flagged
        ]);

        // ── Write to rating_logs for history ───────────────────────────────────
        \App\Models\RatingLog::create([
            'therapist_id'   => $therapistId,
            'review_id'      => $reviewId,
            'old_rating'     => $oldRating,
            'new_rating'     => $newStars,
            'csat_score'     => $csat,
            'total_reviews'  => $reviews->count(),
            'triggered_flag' => $isFlagged && !$therapist->getOriginal('is_flagged'),
        ]);
    }
}