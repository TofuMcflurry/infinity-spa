<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\UserViolation;
use App\Services\TrustSafetyService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Inertia\Inertia;

class AdminTrustSafetyController extends Controller
{
    /**
     * GET /admin/trust-safety
     */
    public function index()
    {
        return Inertia::render('Admin/TrustSafety');
    }

    /**
     * GET /admin/api/trust-safety/overview
     */
    public function overview()
    {
        // Auto-expire any temp blocks first
        TrustSafetyService::checkAndExpireTempBlocks();

        return response()->json([
            'total_violations'   => UserViolation::count(),
            'active_warnings'    => UserViolation::where('level', 'warning')->where('is_active', true)->count(),
            'temp_blocked'       => User::where('restriction_level', 'temp_blocked')->count(),
            'permanently_blocked'=> User::where('restriction_level', 'permanently_blocked')->count(),
            'pending_escalation' => $this->getPendingEscalations()->count(),
        ]);
    }

    /**
     * GET /admin/api/trust-safety/flagged-users
     * Users with active restrictions or pending escalation
     */
    public function flaggedUsers()
    {
        $users = User::where('role', 'customer')
            ->where(function ($q) {
                $q->where('restriction_level', '!=', 'none')
                  ->orWhere('strike_count', '>=', 2);
            })
            ->with(['violations' => fn($q) => $q->orderByDesc('created_at')->limit(5)])
            ->orderByDesc('strike_count')
            ->get()
            ->map(fn($u) => $this->formatUser($u));

        return response()->json($users);
    }

    /**
     * GET /admin/api/trust-safety/user/{user}/violations
     */
    public function userViolations(User $user)
    {
        $violations = UserViolation::with('issuedBy')
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn($v) => [
                'id'            => $v->id,
                'level'         => $v->level,
                'level_label'   => $v->level_label,
                'reason'        => $v->reason,
                'description'   => $v->description,
                'strike_number' => $v->strike_number,
                'duration_days' => $v->duration_days,
                'expires_at'    => $v->expires_at?->timezone('Asia/Dubai')->format('M d, Y g:i A'),
                'is_active'     => $v->is_active,
                'is_expired'    => $v->isExpired(),
                'issued_by'     => $v->issuedBy?->name ?? '—',
                'created_at'    => Carbon::parse($v->created_at)->timezone('Asia/Dubai')->format('M d, Y g:i A'),
            ]);

        // Check if auto-escalation suggestion applies
        $recentWarnings = UserViolation::where('user_id', $user->id)
            ->where('level', 'warning')
            ->where('created_at', '>=', now()->subMonths(6))
            ->count();

        return response()->json([
            'violations'           => $violations,
            'strike_count'         => $user->strike_count,
            'restriction_level'    => $user->restriction_level,
            'restricted_until'     => $user->restricted_until
                ?->timezone('Asia/Dubai')->format('M d, Y'),
            'suggest_temp_block'   => $recentWarnings >= 3
                && $user->restriction_level === 'warned',
        ]);
    }

    /**
     * POST /admin/api/trust-safety/user/{user}/warn
     */
    public function warn(Request $request, User $user)
    {
        $request->validate([
            'reason'      => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
            'report_id'   => 'nullable|exists:user_reports,id',
        ]);

        $result = TrustSafetyService::issueWarning(
            user:        $user,
            reason:      $request->reason,
            description: $request->description,
            reportId:    $request->report_id,
        );

        return response()->json([
            'message'            => "Warning issued to {$user->name} (Strike {$result['strike_number']}).",
            'suggest_temp_block' => $result['suggest_temp_block'],
            'strike_number'      => $result['strike_number'],
            'user'               => $this->formatUser($user->fresh()),
        ]);
    }

    /**
     * POST /admin/api/trust-safety/user/{user}/temp-block
     */
    public function tempBlock(Request $request, User $user)
    {
        $request->validate([
            'duration_days' => 'required|in:7,30',
            'reason'        => 'required|string|max:255',
            'description'   => 'nullable|string|max:1000',
            'report_id'     => 'nullable|exists:user_reports,id',
        ]);

        TrustSafetyService::issueTempBlock(
            user:         $user,
            durationDays: $request->duration_days,
            reason:       $request->reason,
            description:  $request->description,
            reportId:     $request->report_id,
        );

        return response()->json([
            'message' => "{$user->name} has been temporarily blocked for {$request->duration_days} days.",
            'user'    => $this->formatUser($user->fresh()),
        ]);
    }

    /**
     * POST /admin/api/trust-safety/user/{user}/permanent-block
     */
    public function permanentBlock(Request $request, User $user)
    {
        $request->validate([
            'reason'      => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
        ]);

        TrustSafetyService::issuePermanentBlock(
            user:        $user,
            reason:      $request->reason,
            description: $request->description,
        );

        return response()->json([
            'message' => "{$user->name} has been permanently blocked.",
            'user'    => $this->formatUser($user->fresh()),
        ]);
    }

    /**
     * POST /admin/api/trust-safety/user/{user}/lift
     */
    public function liftRestriction(Request $request, User $user)
    {
        $request->validate([
            'note' => 'nullable|string|max:500',
        ]);

        TrustSafetyService::liftRestriction($user, $request->note ?? '');

        return response()->json([
            'message' => "Restriction lifted for {$user->name}.",
            'user'    => $this->formatUser($user->fresh()),
        ]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private function getPendingEscalations()
    {
        return User::where('role', 'customer')
            ->where('restriction_level', 'warned')
            ->whereHas('violations', fn($q) =>
                $q->where('level', 'warning')
                  ->where('created_at', '>=', now()->subMonths(6))
                  ->havingRaw('COUNT(*) >= 3')
                  ->groupBy('user_id')
            );
    }

    private function formatUser(User $user): array
    {
        $recentWarnings = UserViolation::where('user_id', $user->id)
            ->where('level', 'warning')
            ->where('created_at', '>=', now()->subMonths(6))
            ->count();

        return [
            'id'                  => $user->id,
            'name'                => $user->name,
            'email'               => $user->email,
            'avatar'              => $user->avatar,
            'strike_count'        => $user->strike_count,
            'restriction_level'   => $user->restriction_level,
            'restricted_until'    => $user->restricted_until
                ?->timezone('Asia/Dubai')->format('M d, Y'),
            'is_blocked'          => (bool) $user->is_blocked,
            'suggest_temp_block'  => $recentWarnings >= 3
                && $user->restriction_level === 'warned',
            'initials'            => strtoupper(substr($user->name, 0, 1))
                                     . strtoupper(substr(explode(' ', $user->name)[1] ?? '', 0, 1)),
            'member_since'        => Carbon::parse($user->created_at)->format('M Y'),
        ];
    }
}