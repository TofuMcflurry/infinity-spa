<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\SendGuestConversionEmail;
use App\Mail\GuestBookingApproved;
use App\Mail\GuestBookingRejected;
use App\Mail\GuestConversionPromo;
use App\Models\Booking;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
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

        // ── Guest bookings pending admin action ────────────────────────────────
        $pendingGuestBookings = DB::table('bookings')
            ->join('services', 'services.id', '=', 'bookings.service_id')
            ->whereNull('bookings.customer_id')
            ->whereIn('bookings.status', ['pending', 'accepted'])
            ->select([
                'bookings.id',
                'bookings.status',
                'bookings.guest_name',
                'bookings.guest_email',
                'bookings.guest_phone',
                'bookings.location',
                'bookings.scheduled_start',
                'services.name as service_name',
            ])
            ->orderBy('bookings.created_at')
            ->get();

        // ── Completed guest bookings not yet converted (manual promo trigger) ──
        $completedGuestBookings = DB::table('bookings')
            ->join('services', 'services.id', '=', 'bookings.service_id')
            ->whereNull('bookings.customer_id')
            ->where('bookings.status', 'completed')
            ->where('bookings.is_converted', false)
            ->select([
                'bookings.id',
                'bookings.guest_name',
                'bookings.guest_email',
                'bookings.scheduled_start',
                'services.name as service_name',
            ])
            ->orderByDesc('bookings.updated_at')
            ->get();

        // Weekly revenue: last 7 days
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
            'recent_bookings'          => $recentBookings,
            'pending_guest_bookings'   => $pendingGuestBookings,
            'completed_guest_bookings' => $completedGuestBookings,
            'revenue' => [
                'weekly'  => ['labels' => $weeklyLabels, 'values' => $weeklyValues],
                'monthly' => ['labels' => $monthlyLabels, 'values' => $monthlyValues],
            ],
        ]);
    }

    // ── Approve guest booking ─────────────────────────────────────────────────
    public function approvePendingBooking(Booking $booking)
    {
        abort_unless(is_null($booking->customer_id), 403);

        $booking->update(['status' => 'accepted']);

        $booking->load('service');
        Mail::to($booking->guest_email)->send(new GuestBookingApproved($booking));

        return redirect()->route('admin.dashboard')
            ->with('success', "Booking #{$booking->id} approved and email sent.");
    }

    // ── Reject guest booking ──────────────────────────────────────────────────
    public function rejectPendingBooking(Booking $booking)
    {
        abort_unless(is_null($booking->customer_id), 403);

        $booking->update(['status' => 'rejected']);

        $booking->load('service');
        Mail::to($booking->guest_email)->send(new GuestBookingRejected($booking));

        return redirect()->route('admin.dashboard')
            ->with('success', "Booking #{$booking->id} rejected and email sent.");
    }

    // ── Mark guest booking as completed ──────────────────────────────────────
    public function completeGuestBooking(Booking $booking)
    {
        abort_unless(is_null($booking->customer_id) && $booking->status === 'accepted', 403);

        $booking->update(['status' => 'completed']);

        // Auto-dispatch promo email after 1 day
        SendGuestConversionEmail::dispatch($booking)->delay(now()->addDay());

        return redirect()->route('admin.dashboard')
            ->with('success', "Booking #{$booking->id} marked completed. Promo email queued for 24h.");
    }

    // ── Manually send conversion promo ────────────────────────────────────────
    public function sendConversionPromo(Booking $booking)
    {
        abort_unless(
            is_null($booking->customer_id)
            && $booking->status === 'completed'
            && ! $booking->is_converted,
            403
        );

        $booking->load('service');
        Mail::to($booking->guest_email)->send(new GuestConversionPromo($booking));

        return redirect()->route('admin.dashboard')
            ->with('success', "Promo email sent to {$booking->guest_email}.");
    }
}
