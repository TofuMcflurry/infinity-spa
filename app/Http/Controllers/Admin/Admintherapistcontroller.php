<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Review;
use App\Models\Therapist;
use App\Models\User;
use App\Models\UserReport;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Inertia\Inertia;

// Audit Events
use App\Events\Audit\TherapistApproved;
use App\Events\Audit\TherapistDeactivated;
use App\Events\Audit\TherapistRejected;

class AdminTherapistController extends Controller
{
    public function index(Request $request)
    {
        $query = Therapist::with(['user', 'zones'])
            ->join('users', 'users.id', '=', 'therapists.user_id')
            ->select('therapists.*', 'users.name', 'users.email');

        if ($search = $request->get('search')) {
            $query->where('users.name', 'ilike', "%{$search}%");
        }

        $status = $request->get('status', 'all');
        if ($status === 'active') {
            $query->where('therapists.is_active', true);
        } elseif ($status === 'inactive') {
            $query->where('therapists.is_active', false);
        }

        $therapists = $query
            ->orderByRaw("therapists.is_active ASC")
            ->orderBy('users.name')
            ->paginate(15)
            ->withQueryString()
            ->through(fn($t) => [
                'id'               => $t->id,
                'user_id'          => $t->user_id,
                'name'             => $t->user->name,
                'email'            => $t->user->email,
                'specialty'        => $t->specialty,
                'gender'           => $t->gender,
                'rating'           => $t->rating,
                'experience_years' => $t->experience_years,
                'day_off'          => $t->day_off,
                'shift_start'      => $t->shift_start
                    ? Carbon::parse($t->shift_start)->format('g:i A')
                    : null,
                'shift_end'        => $t->shift_end
                    ? Carbon::parse($t->shift_end)->format('g:i A')
                    : null,
                'is_active'        => $t->is_active,
                'is_flagged'       => (bool) $t->is_flagged,
                'zones'            => $t->zones->pluck('zone_name')->toArray(),
                'avatar'           => strtoupper(substr($t->user->name, 0, 1))
                                      . strtoupper(substr(explode(' ', $t->user->name)[1] ?? '', 0, 1)),
                'created_at'       => $t->created_at?->format('M d, Y'),
            ]);

        return Inertia::render('Admin/Therapists', [
            'therapists' => $therapists,
            'filters'    => [
                'search' => $request->get('search', ''),
                'status' => $status,
            ],
        ]);
    }

    public function approve(Request $request, Therapist $therapist)
    {
        $therapist->update(['is_active' => true]);
        TherapistApproved::dispatch($therapist->id, $therapist->user->name, $request);
        return back()->with('success', "{$therapist->user->name} has been approved.");
    }

    public function deactivate(Request $request, Therapist $therapist)
    {
        $therapist->update(['is_active' => false]);
        TherapistDeactivated::dispatch($therapist->id, $therapist->user->name, $request);
        return back()->with('success', "{$therapist->user->name} has been deactivated.");
    }

    public function reject(Request $request, Therapist $therapist)
    {
        $name        = $therapist->user->name;
        $therapistId = $therapist->id;
        $userId      = $therapist->user_id;

        TherapistRejected::dispatch($therapistId, $name, $request);

        $therapist->delete();
        User::find($userId)?->delete();

        return back()->with('success', "{$name} has been rejected and removed.");
    }

    // ── Drawer API endpoints ───────────────────────────────────────────────────

    public function bookings(Therapist $therapist)
    {
        $bookings = Booking::with(['service', 'customer'])
            ->where('therapist_id', $therapist->id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn($b) => [
                'id'              => $b->id,
                'ref'             => 'IHS-' . str_pad($b->id, 5, '0', STR_PAD_LEFT),
                'service_name'    => $b->service?->name ?? '—',
                'customer_name'   => $b->customer?->name ?? $b->guest_name ?? 'Guest',
                'status'          => $b->status,
                'zone_name'       => $b->zone_name,
                'scheduled_start' => $b->scheduled_start
                    ? Carbon::parse($b->scheduled_start)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                    : null,
                'created_at'      => Carbon::parse($b->created_at)->timezone('Asia/Dubai')->format('M d, Y'),
            ]);

        return response()->json($bookings);
    }

    public function reviews(Therapist $therapist)
    {
        $reviews = Review::with('customer')
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
                'created_at'       => $r->created_at->timezone('Asia/Dubai')->format('M d, Y g:i A'),
            ]);

        return response()->json([
            'reviews'     => $reviews,
            'avg_rating'  => $therapist->rating,
            'is_flagged'  => (bool) $therapist->is_flagged,
            'flag_reason' => $therapist->flag_reason,
            'flagged_at'  => $therapist->flagged_at
                ? Carbon::parse($therapist->flagged_at)->format('M d, Y')
                : null,
        ]);
    }

    public function reports(Therapist $therapist)
    {
        $reports = UserReport::with('reporter')
            ->where('reported_user_id', $therapist->user_id)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn($r) => [
                'id'            => $r->id,
                'reporter_name' => $r->reporter?->name ?? '—',
                'reporter_type' => $r->reporter_type,
                'reason'        => $r->reason,
                'description'   => $r->description,
                'status'        => $r->status,
                'admin_note'    => $r->admin_note,
                'created_at'    => Carbon::parse($r->created_at)->timezone('Asia/Dubai')->format('M d, Y g:i A'),
            ]);

        return response()->json($reports);
    }

    public function addReviewNote(Request $request, Therapist $therapist, Review $review)
    {
        $request->validate(['note' => 'required|string|max:1000']);
        $review->update(['admin_note' => $request->note]);
        return response()->json(['message' => 'Note saved.', 'admin_note' => $review->admin_note]);
    }

    public function reviewReport(Request $request, Therapist $therapist, UserReport $report)
    {
        $request->validate([
            'status'     => 'required|in:reviewed,dismissed',
            'admin_note' => 'nullable|string|max:1000',
        ]);

        $report->update([
            'status'      => $request->status,
            'admin_note'  => $request->admin_note,
            'reviewed_by' => auth()->id(),
            'reviewed_at' => now(),
        ]);

        return response()->json(['message' => 'Report updated.']);
    }
}