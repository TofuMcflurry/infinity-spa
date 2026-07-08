<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\Request;
use Inertia\Inertia;

class AdminAuditController extends Controller
{
    public function index()
    {
        return Inertia::render('Admin/AuditLog');
    }

    /**
     * GET /admin/api/audit-logs
     */
    public function list(Request $request)
    {
        $query = AuditLog::query()
            ->when($request->filled('search'), function ($q) use ($request) {
                $q->where(function ($q2) use ($request) {
                    $q2->where('user_name', 'ilike', '%' . $request->search . '%')
                       ->orWhere('event', 'ilike', '%' . $request->search . '%')
                       ->orWhere('ip_address', 'ilike', '%' . $request->search . '%');
                });
            })
            ->when($request->filled('event'), fn($q) => $q->where('event', $request->event))
            ->when($request->filled('role'),  fn($q) => $q->where('user_role', $request->role))
            ->when($request->filled('from'),  fn($q) => $q->whereDate('created_at', '>=', $request->from))
            ->when($request->filled('to'),    fn($q) => $q->whereDate('created_at', '<=', $request->to))
            ->orderByDesc('created_at')
            ->paginate(50);

        return response()->json([
            'data' => $query->map(fn($log) => [
                'id'          => $log->id,
                'event'       => $log->event,
                'user_name'   => $log->user_name ?? '—',
                'user_role'   => $log->user_role ?? '—',
                'target_type' => $log->target_type,
                'target_id'   => $log->target_id,
                'metadata'    => $log->metadata,
                'ip_address'  => $log->ip_address ?? '—',
                'created_at'  => $log->created_at?->timezone('Asia/Dubai')->format('M d, Y g:i A'),
                'time_ago'    => $log->created_at?->diffForHumans(),
            ]),
            'total'        => $query->total(),
            'current_page' => $query->currentPage(),
            'last_page'    => $query->lastPage(),
        ]);
    }

    /**
     * GET /admin/api/audit-logs/stats
     * For the KPI cards at the top
     */
    public function stats()
    {
        return response()->json([
            'total'         => AuditLog::count(),
            'today'         => AuditLog::whereDate('created_at', today())->count(),
            'failed_logins' => AuditLog::where('event', 'auth.login_failed')->count(),
            'admin_actions' => AuditLog::where('user_role', 'admin')->count(),
        ]);
    }
}