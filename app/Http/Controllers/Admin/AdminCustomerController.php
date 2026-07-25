<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\User;
use App\Models\UserReport;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class AdminCustomerController extends Controller
{
    public function index()
    {
        return Inertia::render('Admin/Customers');
    }

    /**
     * GET /admin/api/customers
     * List all customers with stats
     */
    public function list(Request $request)
    {
        $query = User::where('role', 'customer')
            ->when($request->filled('search'), fn($q) =>
                $q->where(function ($q2) use ($request) {
                    $q2->where('name', 'ilike', '%' . $request->search . '%')
                       ->orWhere('email', 'ilike', '%' . $request->search . '%')
                       ->orWhere('phone', 'ilike', '%' . $request->search . '%');
                })
            )
            ->when($request->filled('status'), function ($q) use ($request) {
                if ($request->status === 'blocked') {
                    $q->where('is_blocked', true);
                } elseif ($request->status === 'active') {
                    $q->where('is_blocked', false);
                }
            })
            ->withCount([
                'bookings as total_bookings',
                'bookings as completed_bookings' => fn($q) => $q->where('status', 'completed'),
            ])
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json([
            'data' => $query->map(fn($u) => $this->formatCustomer($u)),
            'total'        => $query->total(),
            'current_page' => $query->currentPage(),
            'last_page'    => $query->lastPage(),
        ]);
    }

    /**
     * GET /admin/api/customers/stats
     */
    public function stats()
    {
        return response()->json([
            'total'         => User::where('role', 'customer')->count(),
            'active'        => User::where('role', 'customer')->where('is_blocked', false)->count(),
            'blocked'       => User::where('role', 'customer')->where('is_blocked', true)->count(),
            'new_this_month'=> User::where('role', 'customer')
                                ->whereMonth('created_at', now()->month)
                                ->whereYear('created_at', now()->year)
                                ->count(),
        ]);
    }

    /**
     * GET /admin/api/customers/{user}/bookings
     */
    public function bookings(User $user)
    {
        $bookings = Booking::with(['service', 'therapist.user'])
            ->where('customer_id', $user->id)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn($b) => [
                'id'              => $b->id,
                'ref'             => 'IHS-' . str_pad($b->id, 5, '0', STR_PAD_LEFT),
                'service_name'    => $b->service?->name ?? '—',
                'therapist_name'  => $b->therapist?->user?->name ?? '—',
                'status'          => $b->status,
                'payment_method'  => $b->payment_method,
                'zone_name'       => $b->zone_name,
                'scheduled_start' => $b->scheduled_start
                    ? Carbon::parse($b->scheduled_start)->timezone('Asia/Dubai')->format('M d, Y g:i A')
                    : null,
                'created_at'      => Carbon::parse($b->created_at)->timezone('Asia/Dubai')->format('M d, Y'),
            ]);

        return response()->json($bookings);
    }

    /**
     * GET /admin/api/customers/{user}/reports
     * Reports filed AGAINST this customer
     */
    public function reports(User $user)
    {
        $reports = UserReport::with('reporter')
            ->where('reported_user_id', $user->id)
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

    /**
     * POST /admin/api/customers/{user}/block
     */
    public function block(Request $request, User $user)
    {
        $request->validate([
            'reason' => 'required|string|max:500',
        ]);

        $user->update([
            'is_blocked'   => true,
            'blocked_at'   => now(),
            'block_reason' => $request->reason,
        ]);

        return response()->json([
            'message'  => "{$user->name} has been blocked.",
            'customer' => $this->formatCustomer($user->fresh()),
        ]);
    }

    /**
     * POST /admin/api/customers/{user}/unblock
     */
    public function unblock(User $user)
    {
        $user->update([
            'is_blocked'   => false,
            'blocked_at'   => null,
            'block_reason' => null,
        ]);

        return response()->json([
            'message'  => "{$user->name} has been unblocked.",
            'customer' => $this->formatCustomer($user->fresh()),
        ]);
    }

    /**
     * POST /admin/api/customers/{user}/reports/{report}/review
     * Admin reviews/dismisses a report
     */
    public function reviewReport(Request $request, User $user, UserReport $report)
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

    // ── Formatter ──────────────────────────────────────────────────────────────
    private function formatCustomer(User $u): array
    {
        // Get total spent from completed bookings
        $totalSpent = Booking::where('customer_id', $u->id)
            ->where('status', 'completed')
            ->leftJoin('service_variants', 'bookings.service_variant_id', '=', 'service_variants.id')
            ->leftJoin('services', 'bookings.service_id', '=', 'services.id')
            ->sum(DB::raw('COALESCE(service_variants.price, services.price, 0)'));

        $pendingReports = UserReport::where('reported_user_id', $u->id)
            ->where('status', 'pending')
            ->count();

        return [
            'id'              => $u->id,
            'name'            => $u->name,
            'email'           => $u->email,
            'phone'           => $u->phone,
            'avatar'          => $u->avatar,
            'is_blocked'      => (bool) $u->is_blocked,
            'blocked_at'      => $u->blocked_at
                ? Carbon::parse($u->blocked_at)->timezone('Asia/Dubai')->format('M d, Y')
                : null,
            'block_reason'    => $u->block_reason,
            'total_bookings'  => $u->total_bookings ?? Booking::where('customer_id', $u->id)->count(),
            'completed_bookings' => $u->completed_bookings ?? Booking::where('customer_id', $u->id)->where('status', 'completed')->count(),
            'total_spent'     => (float) $totalSpent,
            'pending_reports' => $pendingReports,
            'member_since'    => Carbon::parse($u->created_at)->format('M Y'),
            'initials'        => strtoupper(substr($u->name, 0, 1))
                                 . strtoupper(substr(explode(' ', $u->name)[1] ?? '', 0, 1)),
        ];
    }
}