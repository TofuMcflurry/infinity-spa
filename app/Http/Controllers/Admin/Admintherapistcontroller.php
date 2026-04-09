<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Therapist;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;

class AdminTherapistController extends Controller
{
    // ── List all therapists with filters + pagination ─────────────────────────
    public function index(Request $request)
    {
        $query = Therapist::with(['user', 'zones'])
            ->join('users', 'users.id', '=', 'therapists.user_id')
            ->select('therapists.*', 'users.name', 'users.email');

        // Search by name
        if ($search = $request->get('search')) {
            $query->where('users.name', 'ilike', "%{$search}%");
        }

        // Filter by status
        $status = $request->get('status', 'all');
        if ($status === 'active') {
            $query->where('therapists.is_active', true);
        } elseif ($status === 'inactive') {
            $query->where('therapists.is_active', false);
        }
        // 'all' = no filter

        $therapists = $query
            ->orderByRaw("therapists.is_active ASC") // pending (false) first
            ->orderBy('users.name')
            ->paginate(15)
            ->withQueryString()
            ->through(fn($t) => [
                'id'             => $t->id,
                'user_id'        => $t->user_id,
                'name'           => $t->user->name,
                'email'          => $t->user->email,
                'specialty'      => $t->specialty,
                'gender'         => $t->gender,
                'rating'         => $t->rating,
                'experience_years' => $t->experience_years,
                'day_off'        => $t->day_off,
                'shift_start'    => $t->shift_start
                    ? \Carbon\Carbon::parse($t->shift_start)->format('g:i A')
                    : null,
                'shift_end'      => $t->shift_end
                    ? \Carbon\Carbon::parse($t->shift_end)->format('g:i A')
                    : null,
                'is_active'      => $t->is_active,
                'zones'          => $t->zones->pluck('zone_name')->toArray(),
                'avatar'         => strtoupper(substr($t->user->name, 0, 1))
                                    . strtoupper(substr(explode(' ', $t->user->name)[1] ?? '', 0, 1)),
                'created_at'     => $t->created_at?->format('M d, Y'),
            ]);

        return Inertia::render('Admin/Therapists', [
            'therapists' => $therapists,
            'filters'    => [
                'search' => $request->get('search', ''),
                'status' => $status,
            ],
        ]);
    }

    // ── Approve: set is_active = true ─────────────────────────────────────────
    public function approve(Therapist $therapist)
    {
        $therapist->update(['is_active' => true]);

        return back()->with('success', "{$therapist->user->name} has been approved.");
    }

    // ── Deactivate: set is_active = false ─────────────────────────────────────
    public function deactivate(Therapist $therapist)
    {
        $therapist->update(['is_active' => false]);

        return back()->with('success', "{$therapist->user->name} has been deactivated.");
    }

    // ── Reject: delete therapist + user records ───────────────────────────────
    public function reject(Therapist $therapist)
    {
        $name   = $therapist->user->name;
        $userId = $therapist->user_id;

        $therapist->delete();
        User::find($userId)?->delete();

        return back()->with('success', "{$name} has been rejected and removed.");
    }
}