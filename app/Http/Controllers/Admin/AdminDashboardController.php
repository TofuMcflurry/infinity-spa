<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class AdminDashboardController extends Controller
{
    public function index(): InertiaResponse
    {
        $today      = now()->toDateString();
        $monthStart = now()->startOfMonth();
        $monthEnd   = now()->endOfMonth();

        $totalBookingsToday = DB::table('bookings')
            ->whereDate('scheduled_start', $today)
            ->count();

        $monthlyRevenue = (float) (DB::table('bookings')
            ->where('status', 'completed')
            ->whereBetween('scheduled_start', [$monthStart, $monthEnd])
            ->selectRaw('COALESCE(SUM(COALESCE(downpayment_amount,0) + COALESCE(remaining_amount,0)),0) as total')
            ->value('total') ?? 0);

        $activeTherapists = DB::table('therapists')
            ->where('is_active', true)
            ->count();

        $pendingApprovals = DB::table('therapists')
            ->where('is_active', false)
            ->count();

        $recentBookings = DB::table('bookings')
            ->leftJoin('users as customers', 'customers.id', '=', 'bookings.customer_id')
            ->leftJoin('therapists', 'therapists.id', '=', 'bookings.therapist_id')
            ->leftJoin('users as therapist_users', 'therapist_users.id', '=', 'therapists.user_id')
            ->leftJoin('services', 'services.id', '=', 'bookings.service_id')
            ->select([
                'bookings.id',
                'bookings.status',
                'bookings.payment_method',
                'bookings.scheduled_start',
                'bookings.scheduled_end',
                'bookings.downpayment_amount',
                'bookings.remaining_amount',
                'bookings.zone_name',
                'bookings.location',
                'customers.name as customer_name',
                'therapist_users.name as therapist_name',
                'services.group_name as service_name',
            ])
            ->orderByDesc('bookings.scheduled_start')
            ->limit(10)
            ->get();

        // Weekly revenue
        $start7     = now()->startOfDay()->subDays(6);
        $weeklyRows = DB::table('bookings')
            ->where('status', 'completed')
            ->whereBetween('scheduled_start', [$start7, now()->endOfDay()])
            ->selectRaw('DATE(scheduled_start) as d')
            ->selectRaw('COALESCE(SUM(COALESCE(downpayment_amount,0) + COALESCE(remaining_amount,0)),0) as revenue')
            ->groupByRaw('DATE(scheduled_start)')
            ->orderByRaw('DATE(scheduled_start)')
            ->get()
            ->keyBy('d');

        $weeklyLabels = [];
        $weeklyValues = [];
        for ($i = 0; $i < 7; $i++) {
            $d              = $start7->copy()->addDays($i)->toDateString();
            $weeklyLabels[] = date('D', strtotime($d));
            $weeklyValues[] = (float) (($weeklyRows[$d]->revenue ?? 0) ?: 0);
        }

        // Monthly revenue
        $monthRows = DB::table('bookings')
            ->where('status', 'completed')
            ->whereBetween('scheduled_start', [$monthStart->copy()->startOfDay(), $monthEnd->copy()->endOfDay()])
            ->selectRaw('DATE(scheduled_start) as d')
            ->selectRaw('COALESCE(SUM(COALESCE(downpayment_amount,0) + COALESCE(remaining_amount,0)),0) as revenue')
            ->groupByRaw('DATE(scheduled_start)')
            ->orderByRaw('DATE(scheduled_start)')
            ->get()
            ->keyBy('d');

        $daysInMonth   = (int) now()->daysInMonth;
        $monthlyLabels = [];
        $monthlyValues = [];
        for ($day = 1; $day <= $daysInMonth; $day++) {
            $d               = now()->copy()->startOfMonth()->addDays($day - 1)->toDateString();
            $monthlyLabels[] = (string) $day;
            $monthlyValues[] = (float) (($monthRows[$d]->revenue ?? 0) ?: 0);
        }

        return Inertia::render('Admin/Dashboard', [
            'stats' => [
                'bookings_today'    => $totalBookingsToday,
                'monthly_revenue'   => $monthlyRevenue,
                'active_therapists' => $activeTherapists,
                'pending_approvals' => $pendingApprovals,
            ],
            'recent_bookings' => $recentBookings,
            'revenue' => [
                'weekly'  => ['labels' => $weeklyLabels, 'values' => $weeklyValues],
                'monthly' => ['labels' => $monthlyLabels, 'values' => $monthlyValues],
            ],
        ]);
    }
}