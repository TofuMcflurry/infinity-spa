<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class AdminAuditController extends Controller
{
    private const CATEGORIES = [
        'auth' => ['auth.'],
        'booking' => ['booking.'],
        'service' => ['service.'],
        'therapist' => ['therapist.'],
        'customer' => ['customer.'],
        'payment' => ['payment.'],
        'trust' => ['trust.'],
        'reschedule' => ['reschedule_proposal.', 'reschedule_request.', 'booking.rescheduled'],
    ];

    public function index()
    {
        return Inertia::render('Admin/AuditLog');
    }

    /**
     * GET /admin/api/audit-logs
     */
    public function list(Request $request)
    {
        $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            // Legacy category values and exact dotted event names share this parameter.
            'event' => ['bail', 'nullable', 'string', 'max:255', function ($attribute, $value, $fail) {
                if (!isset(self::CATEGORIES[$value]) && !preg_match('/\A[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+\z/', $value)) {
                    $fail('Select a supported category or an exact dotted event name.');
                }
            }],
            'role' => ['nullable', Rule::in(['admin', 'therapist', 'customer'])],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', ...($request->filled('from') ? ['after_or_equal:from'] : [])],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $query = AuditLog::query()
            ->when($request->filled('search'), function ($q) use ($request) {
                $q->where(function ($q2) use ($request) {
                    $q2->where('user_name', 'ilike', '%' . $request->search . '%')
                       ->orWhere('event', 'ilike', '%' . $request->search . '%')
                       ->orWhere('ip_address', 'ilike', '%' . $request->search . '%');
                });
            })
            ->when($request->filled('event'), function ($q) use ($request) {
                $event = $request->input('event');
                if (!isset(self::CATEGORIES[$event])) {
                    $q->where('event', $event);
                    return;
                }
                $q->where(function ($group) use ($event) {
                    foreach (self::CATEGORIES[$event] as $prefix) {
                        // Only server-owned prefixes become LIKE patterns; escape underscores.
                        if (str_ends_with($prefix, '.')) {
                            $group->orWhere('event', 'like', str_replace('_', '\\_', $prefix) . '%');
                        } else {
                            $group->orWhere('event', $prefix);
                        }
                    }
                });
            })
            ->when($request->filled('role'),  fn($q) => $q->where('user_role', $request->role))
            ->when($request->filled('from'),  fn($q) => $q->whereDate('created_at', '>=', $request->from))
            ->when($request->filled('to'),    fn($q) => $q->whereDate('created_at', '<=', $request->to))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
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
