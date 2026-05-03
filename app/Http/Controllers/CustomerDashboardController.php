<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Therapist;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustomerDashboardController extends Controller
{
    public function index()
    {
        $customerId = auth()->id();

        // ── Stats ─────────────────────────────────────────────────────────────
        $totalSessions = Booking::where('customer_id', $customerId)
            ->where('status', 'completed')
            ->count();

        $totalSpent = Booking::where('customer_id', $customerId)
            ->where('status', 'completed')
            ->join('services', 'bookings.service_id', '=', 'services.id')
            ->sum('services.price');

        // ── Favorite Therapist ────────────────────────────────────────────────
        $favoriteTherapist = Booking::where('customer_id', $customerId)
            ->whereIn('status', ['pending_payment', 'pending', 'accepted'])
            ->select('therapist_id', DB::raw('COUNT(*) as booking_count'))
            ->groupBy('therapist_id')
            ->orderByDesc('booking_count')
            ->with('therapist.user')
            ->first();

        // ── Upcoming Booking ──────────────────────────────────────────────────
        $upcomingBooking = Booking::where('customer_id', $customerId)
            ->whereIn('status', ['en_route', 'arrived', 'accepted', 'pending', 'pending_payment']) // ✅
            ->where('scheduled_start', '>=', now())
            ->with(['service', 'therapist.user'])
            ->orderByRaw("CASE
                WHEN status = 'en_route'        THEN 1
                WHEN status = 'arrived'         THEN 2
                WHEN status = 'accepted'        THEN 3
                WHEN status = 'pending'         THEN 4
                WHEN status = 'pending_payment' THEN 5
                ELSE 6 END")
            ->orderBy('scheduled_start')
            ->first();

        // ── Your Usual ────────────────────────────────────────────────────────
        $yourUsual   = null;
        $lastBooking = Booking::where('customer_id', $customerId)
            ->whereIn('status', ['completed', 'pending', 'accepted'])
            ->with(['service', 'therapist.user'])
            ->latest('scheduled_start')
            ->first();

        if ($lastBooking) {
            $preferredHour = Booking::where('customer_id', $customerId)
                ->whereIn('status', ['completed', 'pending', 'accepted'])
                ->select(
                    DB::raw('EXTRACT(HOUR FROM scheduled_start) as hour'),
                    DB::raw('COUNT(*) as cnt')
                )
                ->groupBy(DB::raw('EXTRACT(HOUR FROM scheduled_start)'))
                ->orderByDesc('cnt')
                ->value(DB::raw('EXTRACT(HOUR FROM scheduled_start)'));

            $preferredLocation = Booking::where('customer_id', $customerId)
                ->whereIn('status', ['completed', 'pending', 'accepted'])
                ->select('zone_name', DB::raw('COUNT(*) as cnt'))
                ->groupBy('zone_name')
                ->orderByDesc('cnt')
                ->value('zone_name');

            $preferredPayment = Booking::where('customer_id', $customerId)
                ->whereIn('status', ['completed', 'pending', 'accepted'])
                ->select('payment_method', DB::raw('COUNT(*) as cnt'))
                ->groupBy('payment_method')
                ->orderByDesc('cnt')
                ->value('payment_method');

            $yourUsual = [
                'service'   => [
                    'id'   => $lastBooking->service->id,
                    'name' => $lastBooking->service->name,
                ],
                'therapist' => [
                    'id'   => $lastBooking->therapist->id,
                    'name' => $lastBooking->therapist->user->name,
                ],
                'time'      => $preferredHour !== null
                    ? Carbon::today()->setHour((int)$preferredHour)->setMinute(0)->format('g:i A')
                    : null,
                'location'  => $preferredLocation,
                'payment'   => $preferredPayment,
            ];
        }

        // ── Top Therapists ────────────────────────────────────────────────────
        $topTherapists = Therapist::with('user')
            ->where('is_active', true)
            ->orderByDesc('rating')
            ->take(4)
            ->get()
            ->map(function ($therapist) use ($customerId) {
                $isFamiliar = Booking::where('customer_id', $customerId)
                    ->where('therapist_id', $therapist->id)
                    ->exists();

                return [
                    'id'         => $therapist->id,
                    'name'       => $therapist->user->name,
                    'specialty'  => $therapist->specialty,
                    'rating'     => $therapist->rating,
                    'experience' => $therapist->experience_years,
                    'gender'     => $therapist->gender,
                    'avatar'     => strtoupper(substr($therapist->user->name, 0, 1))
                                    . strtoupper(substr(explode(' ', $therapist->user->name)[1] ?? '', 0, 1)),
                    'familiar'   => $isFamiliar,
                ];
            });

        // ── Recent Activity ───────────────────────────────────────────────────
        $recentActivity = Booking::where('customer_id', $customerId)
            ->with(['service', 'therapist.user'])
            ->orderByDesc('scheduled_start')
            ->take(3)
            ->get()
            ->map(fn($b) => [
                'id'             => $b->id,
                'service'        => $b->service->name,
                'therapist'      => $b->therapist->user->name,
                'datetime'       => Carbon::parse($b->scheduled_start)->timezone('Asia/Dubai')->format('F j, Y · g:i A'),
                'duration'       => $b->service->duration_minutes,
                'status'         => $b->status,
                'service_id'     => $b->service_id,
                'therapist_id'   => $b->therapist_id,
                'zone_name'      => $b->zone_name,
                'location'       => $b->location,
                'payment_method' => $b->payment_method,
            ]);

        // ── Preferences (from completed bookings only) ────────────────────────
        $preferences = null;
        $anyBooking  = Booking::where('customer_id', $customerId)->exists();

        if ($anyBooking) {
            $prefHour = Booking::where('customer_id', $customerId)
                ->whereIn('status', ['completed', 'pending', 'accepted'])
                ->select(
                    DB::raw('EXTRACT(HOUR FROM scheduled_start) as hour'),
                    DB::raw('COUNT(*) as cnt')
                )
                ->groupBy(DB::raw('EXTRACT(HOUR FROM scheduled_start)'))
                ->orderByDesc('cnt')
                ->value(DB::raw('EXTRACT(HOUR FROM scheduled_start)'));

            $prefLocation = Booking::where('customer_id', $customerId)
                ->whereIn('status', ['completed', 'pending', 'accepted'])
                ->select('zone_name', DB::raw('COUNT(*) as cnt'))
                ->groupBy('zone_name')
                ->orderByDesc('cnt')
                ->value('zone_name');

            $prefPayment = Booking::where('customer_id', $customerId)
                ->whereIn('status', ['completed', 'pending', 'accepted'])
                ->select('payment_method', DB::raw('COUNT(*) as cnt'))
                ->groupBy('payment_method')
                ->orderByDesc('cnt')
                ->value('payment_method');

            $preferences = [
                'time'     => $prefHour !== null
                    ? Carbon::today()->setHour((int)$prefHour)->setMinute(0)->format('g:i A')
                    : null,
                'location' => $prefLocation,
                'payment'  => $prefPayment === 'cash' ? 'Cash on completion' : 'Cashless',
            ];
        }

        return response()->json([
            'stats' => [
                'total_sessions'     => $totalSessions,
                'total_spent'        => number_format((float)$totalSpent, 2),
                'favorite_therapist' => $favoriteTherapist
                    ? $favoriteTherapist->therapist->user->name
                    : null,
            ],
            'upcoming_booking' => $upcomingBooking ? [
                'id'        => $upcomingBooking->id,
                'service'   => $upcomingBooking->service->name,
                'therapist' => $upcomingBooking->therapist->user->name,
                'datetime'  => Carbon::parse($upcomingBooking->scheduled_start)->timezone('Asia/Dubai')->format('F j, Y · g:i A'),
                'location'  => $upcomingBooking->location,
                'zone_name' => $upcomingBooking->zone_name,
                'status'    => $upcomingBooking->status,
                'duration'  => $upcomingBooking->service->duration_minutes,
            ] : null,
            'your_usual'      => $yourUsual,
            'top_therapists'  => $topTherapists,
            'recent_activity' => $recentActivity,
            'preferences'     => $preferences,
        ]);
    }
}