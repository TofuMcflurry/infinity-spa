<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class AdminReportController extends Controller
{
    public function index()
    {
        return Inertia::render('Admin/Reports');
    }

    /**
     * Revenue helper — joins service_variants for accurate price.
     * Falls back to services.price for old bookings without a variant link.
     */
    private function revenueQuery()
    {
        return Booking::leftJoin('service_variants', 'bookings.service_variant_id', '=', 'service_variants.id')
            ->leftJoin('services', 'bookings.service_id', '=', 'services.id')
            ->where('bookings.status', 'completed')
            ->selectRaw('COALESCE(service_variants.price, services.price, 0) as resolved_price');
    }

    private function revenueSum($query)
    {
        return DB::table(DB::raw("({$query->toSql()}) as sub"))
            ->mergeBindings($query->getQuery())
            ->sum('resolved_price');
    }

    public function overview(Request $request)
    {
        // Total revenue — use variant price, fall back to service price
        $totalRevenue = Booking::leftJoin('service_variants', 'bookings.service_variant_id', '=', 'service_variants.id')
            ->leftJoin('services', 'bookings.service_id', '=', 'services.id')
            ->where('bookings.status', 'completed')
            ->sum(DB::raw('COALESCE(service_variants.price, services.price, 0)'));

        $totalBookings  = Booking::count();
        $completedCount = Booking::where('status', 'completed')->count();
        $cancelledCount = Booking::whereIn('status', ['cancelled', 'rejected'])->count();
        $pendingCount   = Booking::whereIn('status', ['pending', 'accepted'])->count();

        $completionRate = $totalBookings > 0
            ? round(($completedCount / $totalBookings) * 100, 1)
            : 0;

        $thisMonthRevenue = Booking::leftJoin('service_variants', 'bookings.service_variant_id', '=', 'service_variants.id')
            ->leftJoin('services', 'bookings.service_id', '=', 'services.id')
            ->where('bookings.status', 'completed')
            ->whereMonth('bookings.created_at', now()->month)
            ->whereYear('bookings.created_at', now()->year)
            ->sum(DB::raw('COALESCE(service_variants.price, services.price, 0)'));

        $lastMonthRevenue = Booking::leftJoin('service_variants', 'bookings.service_variant_id', '=', 'service_variants.id')
            ->leftJoin('services', 'bookings.service_id', '=', 'services.id')
            ->where('bookings.status', 'completed')
            ->whereMonth('bookings.created_at', now()->subMonth()->month)
            ->whereYear('bookings.created_at', now()->subMonth()->year)
            ->sum(DB::raw('COALESCE(service_variants.price, services.price, 0)'));

        $revenueChange = $lastMonthRevenue > 0
            ? round((($thisMonthRevenue - $lastMonthRevenue) / $lastMonthRevenue) * 100, 1)
            : null;

        $activeTherapists = DB::table('therapists')->where('is_active', true)->count();
        $totalCustomers   = DB::table('users')->where('role', 'customer')->count();

        return response()->json([
            'total_revenue'      => (float) $totalRevenue,
            'this_month_revenue' => (float) $thisMonthRevenue,
            'revenue_change_pct' => $revenueChange,
            'total_bookings'     => $totalBookings,
            'completed_count'    => $completedCount,
            'cancelled_count'    => $cancelledCount,
            'pending_count'      => $pendingCount,
            'completion_rate'    => $completionRate,
            'active_therapists'  => $activeTherapists,
            'total_customers'    => $totalCustomers,
        ]);
    }

    public function revenueTrend(Request $request)
    {
        $months = (int) $request->input('months', 6);

        $rows = Booking::leftJoin('service_variants', 'bookings.service_variant_id', '=', 'service_variants.id')
            ->leftJoin('services', 'bookings.service_id', '=', 'services.id')
            ->where('bookings.status', 'completed')
            ->where('bookings.created_at', '>=', now()->subMonths($months - 1)->startOfMonth())
            ->select(
                DB::raw("TO_CHAR(bookings.created_at, 'YYYY-MM') as month"),
                DB::raw('SUM(COALESCE(service_variants.price, services.price, 0)) as revenue'),
                DB::raw('COUNT(bookings.id) as bookings_count')
            )
            ->groupBy('month')
            ->orderBy('month')
            ->get()
            ->keyBy('month');

        $result = [];
        for ($i = $months - 1; $i >= 0; $i--) {
            $key   = now()->subMonths($i)->format('Y-m');
            $label = now()->subMonths($i)->format('M Y');

            $result[] = [
                'month'          => $label,
                'revenue'        => isset($rows[$key]) ? (float) $rows[$key]->revenue : 0,
                'bookings_count' => isset($rows[$key]) ? (int) $rows[$key]->bookings_count : 0,
            ];
        }

        return response()->json($result);
    }

    public function topServices(Request $request)
    {
        $limit = (int) $request->input('limit', 5);

        $rows = Booking::join('services', 'bookings.service_id', '=', 'services.id')
            ->leftJoin('service_variants', 'bookings.service_variant_id', '=', 'service_variants.id')
            ->select(
                'services.id',
                'services.name',
                DB::raw('COUNT(bookings.id) as bookings_count'),
                DB::raw("SUM(CASE WHEN bookings.status = 'completed' THEN COALESCE(service_variants.price, services.price, 0) ELSE 0 END) as revenue")
            )
            ->groupBy('services.id', 'services.name')
            ->orderByDesc('bookings_count')
            ->limit($limit)
            ->get();

        return response()->json($rows);
    }

    public function topTherapists(Request $request)
    {
        $limit = (int) $request->input('limit', 5);

        $rows = Booking::join('therapists', 'bookings.therapist_id', '=', 'therapists.id')
            ->join('users', 'therapists.user_id', '=', 'users.id')
            ->leftJoin('service_variants', 'bookings.service_variant_id', '=', 'service_variants.id')
            ->leftJoin('services', 'bookings.service_id', '=', 'services.id')
            ->where('bookings.status', 'completed')
            ->select(
                'therapists.id',
                'users.name',
                DB::raw('COUNT(bookings.id) as completed_count'),
                DB::raw('SUM(COALESCE(service_variants.price, services.price, 0)) as revenue'),
                DB::raw('AVG(therapists.rating) as avg_rating')
            )
            ->groupBy('therapists.id', 'users.name')
            ->orderByDesc('completed_count')
            ->limit($limit)
            ->get();

        return response()->json($rows);
    }

    public function statusBreakdown(Request $request)
    {
        $rows = Booking::select('status', DB::raw('COUNT(*) as count'))
            ->groupBy('status')
            ->get();

        return response()->json($rows);
    }

    public function bookingsByZone(Request $request)
    {
        $rows = Booking::select('zone_name', DB::raw('COUNT(*) as count'))
            ->whereNotNull('zone_name')
            ->groupBy('zone_name')
            ->orderByDesc('count')
            ->limit(10)
            ->get();

        return response()->json($rows);
    }
}