<?php

namespace App\Http\Controllers;

use App\Models\Review;
use Carbon\Carbon;
use Illuminate\Http\Request;

class TherapistCsatController extends Controller
{
    private const CSAT_MAP       = [5 => 100, 4 => 80, 3 => 60, 2 => 40, 1 => 0];
    private const PASS_THRESHOLD = 70.0;

    public function index(Request $request)
    {
        $therapist = auth()->user()->therapist;
        $offset    = min(0, (int) $request->query('offset', 0)); // cannot go to future

        $weekStart = now()->copy()->startOfWeek(Carbon::MONDAY)->addWeeks($offset);
        $weekEnd   = $weekStart->copy()->endOfWeek(Carbon::SUNDAY)->endOfDay();

        $reviews = Review::where('therapist_id', $therapist->id)
            ->whereNotNull('therapist_rating')
            ->where('is_visible', true)
            ->whereBetween('created_at', [$weekStart, $weekEnd])
            ->orderBy('created_at', 'desc')
            ->get();

        $total         = $reviews->count();
        $positiveCount = $reviews->whereIn('therapist_rating', [4, 5])->count();
        $negativeCount = $reviews->whereIn('therapist_rating', [1, 2])->count();
        $neutralCount  = $reviews->where('therapist_rating', 3)->count();

        $sumPoints  = $reviews->sum(fn ($r) => self::CSAT_MAP[$r->therapist_rating] ?? 0);
        $csatScore  = $total > 0 ? round($sumPoints / ($total * 100) * 100, 1) : null;
        $starRating = $csatScore !== null ? round($csatScore / 20, 1) : null;
        $passing    = $csatScore !== null ? $csatScore >= self::PASS_THRESHOLD : null;

        $weekLabel = sprintf(
            'Week %d (%s – %s, %s)',
            (int) $weekStart->format('W'),
            $weekStart->format('M j'),
            $weekEnd->format('M j'),
            $weekEnd->format('Y')
        );

        return response()->json([
            'week_label'     => $weekLabel,
            'week_start'     => $weekStart->toDateString(),
            'week_end'       => $weekEnd->toDateString(),
            'offset'         => $offset,
            'total_count'    => $total,
            'positive_count' => $positiveCount,
            'positive_pct'   => $total > 0 ? round($positiveCount / $total * 100, 1) : 0.0,
            'negative_count' => $negativeCount,
            'negative_pct'   => $total > 0 ? round($negativeCount / $total * 100, 1) : 0.0,
            'neutral_count'  => $neutralCount,
            'csat_score'     => $csatScore,
            'star_rating'    => $starRating,
            'passing'        => $passing,
            'has_next'       => $offset < 0,
            'has_prev'       => true,
            'reviews'        => $reviews->map(fn ($r) => [
                'stars'      => $r->therapist_rating,
                'comment'    => $r->comment,
                'created_at' => $r->created_at->toIso8601String(),
            ])->values(),
        ]);
    }
}
