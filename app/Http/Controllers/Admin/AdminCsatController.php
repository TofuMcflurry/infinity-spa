<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Review;
use App\Models\Therapist;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class AdminCsatController extends Controller
{
    public function index()
    {
        return Inertia::render('Admin/Csat');
    }

    /**
     * GET /admin/api/csat/overview
     * KPI cards for the CSAT page
     */
    public function overview()
    {
        $totalReviews    = Review::where('is_visible', true)->count();
        $avgTherapistCsat = Review::where('is_visible', true)
            ->whereNotNull('therapist_csat')
            ->avg('therapist_csat');
        $avgServiceCsat  = Review::where('is_visible', true)
            ->whereNotNull('service_csat')
            ->avg('service_csat');
        $flaggedCount    = Therapist::where('is_flagged', true)->count();

        return response()->json([
            'total_reviews'      => $totalReviews,
            'avg_therapist_csat' => $avgTherapistCsat ? round($avgTherapistCsat, 1) : 0,
            'avg_service_csat'   => $avgServiceCsat  ? round($avgServiceCsat, 1)  : 0,
            'flagged_therapists' => $flaggedCount,
        ]);
    }

    /**
     * GET /admin/api/csat/flagged-therapists
     * Therapists below 3.5 star threshold
     */
    public function flaggedTherapists()
    {
        $therapists = Therapist::with('user')
            ->where('is_flagged', true)
            ->orderBy('rating')
            ->get()
            ->map(fn($t) => $this->formatTherapist($t));

        return response()->json($therapists);
    }

    /**
     * GET /admin/api/csat/all-therapists
     * All therapists with their CSAT data
     */
    public function allTherapists()
    {
        $therapists = Therapist::with('user')
            ->where('is_active', true)
            ->orderBy('rating')
            ->get()
            ->map(fn($t) => $this->formatTherapist($t));

        return response()->json($therapists);
    }

    /**
     * GET /admin/api/csat/therapist/{therapist}/reviews
     * All reviews for a specific therapist
     */
    public function therapistReviews(Therapist $therapist)
    {
        $reviews = Review::with(['customer', 'booking'])
            ->where('therapist_id', $therapist->id)
            ->where('is_visible', true)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn($r) => [
                'id'               => $r->id,
                'customer_name'    => $r->customer?->name ?? 'Guest',
                'therapist_rating' => $r->therapist_rating,
                'therapist_csat'   => $r->therapist_csat,
                'comment'          => $r->comment,
                'admin_note'       => $r->admin_note,
                'service_group'    => $r->service_group,
                'created_at'       => $r->created_at->timezone('Asia/Dubai')->format('M d, Y g:i A'),
            ]);

        return response()->json($reviews);
    }

    /**
     * GET /admin/api/csat/therapist/{therapist}/rating-history
     * Rating trend over time
     */
    public function ratingHistory(Therapist $therapist)
    {
        $logs = \App\Models\RatingLog::where('therapist_id', $therapist->id)
            ->orderBy('created_at')
            ->get()
            ->map(fn($l) => [
                'new_rating'     => (float) $l->new_rating,
                'csat_score'     => (float) $l->csat_score,
                'total_reviews'  => $l->total_reviews,
                'triggered_flag' => $l->triggered_flag,
                'created_at'     => $l->created_at->format('M d'),
            ]);

        return response()->json($logs);
    }

    /**
     * POST /admin/api/csat/review/{review}/note
     * Add/update coaching note on a review
     */
    public function addNote(Request $request, Review $review)
    {
        $request->validate([
            'note' => 'required|string|max:1000',
        ]);

        $review->update(['admin_note' => $request->note]);

        return response()->json(['message' => 'Note saved.', 'admin_note' => $review->admin_note]);
    }

    /**
     * POST /admin/api/csat/therapist/{therapist}/resolve-flag
     * Admin manually resolves the flag after coaching
     */
    public function resolveFlag(Request $request, Therapist $therapist)
    {
        $request->validate([
            'note' => 'nullable|string|max:1000',
        ]);

        $therapist->update([
            'is_flagged'  => false,
            'flagged_at'  => null,
            'flag_reason' => null,
        ]);

        return response()->json(['message' => 'Flag resolved.']);
    }

    // ── Formatter ──────────────────────────────────────────────────────────────
    private function formatTherapist(Therapist $t): array
    {
        $reviewCount = Review::where('therapist_id', $t->id)
            ->where('is_visible', true)
            ->whereNotNull('therapist_rating')
            ->count();

        $csatScore = $t->rating ? round($t->rating / 5 * 100, 1) : 0;

        return [
            'id'           => $t->id,
            'name'         => $t->user?->name ?? '—',
            'email'        => $t->user?->email ?? '—',
            'rating'       => (float) ($t->rating ?? 0),
            'csat_score'   => $csatScore,
            'is_flagged'   => (bool) $t->is_flagged,
            'flagged_at'   => $t->flagged_at
                ? \Carbon\Carbon::parse($t->flagged_at)->timezone('Asia/Dubai')->format('M d, Y')
                : null,
            'flag_reason'  => $t->flag_reason,
            'review_count' => $reviewCount,
            'is_active'    => (bool) $t->is_active,
            'specialty'    => $t->specialty,
            'initials'     => strtoupper(substr($t->user?->name ?? 'T', 0, 1))
                              . strtoupper(substr(explode(' ', $t->user?->name ?? 'T ')[1] ?? '', 0, 1)),
        ];
    }
}