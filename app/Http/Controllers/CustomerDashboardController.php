<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Therapist;
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

        // ── Favorite Therapist (most booked) ──────────────────────────────────
        $favoriteTherapist = Booking::where('customer_id', $customerId)
            ->whereIn('status', ['completed', 'accepted'])
            ->select('therapist_id', DB::raw('COUNT(*) as booking_count'))
            ->groupBy('therapist_id')
            ->orderByDesc('booking_count')
            ->with('therapist.user')
            ->first();

        // ── Upcoming Booking ──────────────────────────────────────────────────
        $upcomingBooking = Booking::where('customer_id', $customerId)
            ->whereIn('status', ['pending', 'accepted'])
            ->where('scheduled_date', '>=', now()->toDateString())
            ->with(['service', 'therapist.user'])
            ->orderBy('scheduled_date')
            ->orderBy('scheduled_start')
            ->first();

        // ── Your Usual (auto-detected from history) ───────────────────────────
        $yourUsual = null;
        $lastBooking = Booking::where('customer_id', $customerId)
            ->where('status', 'completed')
            ->with(['service', 'therapist.user'])
            ->latest('scheduled_date')
            ->first();

        if ($lastBooking) {
            // Most used time
            $preferredTime = Booking::where('customer_id', $customerId)
                ->where('status', 'completed')
                ->select('scheduled_start', DB::raw('COUNT(*) as cnt'))
                ->groupBy('scheduled_start')
                ->orderByDesc('cnt')
                ->value('scheduled_start');

            // Most used location
            $preferredLocation = Booking::where('customer_id', $customerId)
                ->where('status', 'completed')
                ->select('zone_name', DB::raw('COUNT(*) as cnt'))
                ->groupBy('zone_name')
                ->orderByDesc('cnt')
                ->value('zone_name');

            // Most used payment
            $preferredPayment = Booking::where('customer_id', $customerId)
                ->where('status', 'completed')
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
                'time'      => $preferredTime
                    ? \Carbon\Carbon::createFromFormat('H:i', $preferredTime)
                                    ->format('g:i A')
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
                // Check if customer has booked this therapist before
                $isFamiliar = Booking::where('customer_id', $customerId)
                    ->where('therapist_id', $therapist->id)
                    ->exists();

                return [
                    'id'        => $therapist->id,
                    'name'      => $therapist->user->name,
                    'specialty' => $therapist->specialty,
                    'rating'    => $therapist->rating,
                    'experience'=> $therapist->experience_years,
                    'gender'    => $therapist->gender,
                    'avatar'    => strtoupper(substr($therapist->user->name, 0, 1))
                                   . strtoupper(substr(explode(' ', $therapist->user->name)[1] ?? '', 0, 1)),
                    'familiar'  => $isFamiliar,
                ];
            });

        // ── Recent Activity ───────────────────────────────────────────────────
        $recentActivity = Booking::where('customer_id', $customerId)
            ->with(['service', 'therapist.user'])
            ->orderByDesc('scheduled_date')
            ->take(3)
            ->get()
            ->map(fn($b) => [
                'id'         => $b->id,
                'service'    => $b->service->name,
                'therapist'  => $b->therapist->user->name,
                'date'       => $b->scheduled_date->format('M d, Y'),
                'duration'   => $b->service->duration_minutes,
                'status'     => $b->status,
                'service_id' => $b->service_id,
                'therapist_id' => $b->therapist_id,
                'zone_name'  => $b->zone_name,
                'location'   => $b->location,
                'payment_method' => $b->payment_method,
            ]);

        // ── Preferences ───────────────────────────────────────────────────────
        $preferences = null;
        if ($totalSessions > 0) {
            $prefTime = Booking::where('customer_id', $customerId)
                ->where('status', 'completed')
                ->select('scheduled_start', DB::raw('COUNT(*) as cnt'))
                ->groupBy('scheduled_start')
                ->orderByDesc('cnt')
                ->value('scheduled_start');

            $prefLocation = Booking::where('customer_id', $customerId)
                ->where('status', 'completed')
                ->select('zone_name', DB::raw('COUNT(*) as cnt'))
                ->groupBy('zone_name')
                ->orderByDesc('cnt')
                ->value('zone_name');

            $prefPayment = Booking::where('customer_id', $customerId)
                ->where('status', 'completed')
                ->select('payment_method', DB::raw('COUNT(*) as cnt'))
                ->groupBy('payment_method')
                ->orderByDesc('cnt')
                ->value('payment_method');

            $preferences = [
                'time'     => $prefTime
                    ? \Carbon\Carbon::createFromFormat('H:i', $prefTime)->format('g:i A')
                    : null,
                'location' => $prefLocation,
                'payment'  => $prefPayment === 'cash' ? 'Cash on completion' : 'Cashless',
            ];
        }

        // ── Return all ────────────────────────────────────────────────────────
        return response()->json([
            'stats' => [
                'total_sessions'     => $totalSessions,
                'total_spent'        => number_format($totalSpent, 2),
                'favorite_therapist' => $favoriteTherapist
                    ? $favoriteTherapist->therapist->user->name
                    : null,
            ],
            'upcoming_booking' => $upcomingBooking ? [
                'id'              => $upcomingBooking->id,
                'service'         => $upcomingBooking->service->name,
                'therapist'       => $upcomingBooking->therapist->user->name,
                'date'            => $upcomingBooking->scheduled_date->format('l, d F Y'),
                'time'            => \Carbon\Carbon::createFromFormat('H:i', $upcomingBooking->scheduled_start)
                                                   ->format('g:i A'),
                'location'        => $upcomingBooking->location,
                'status'          => $upcomingBooking->status,
                'duration'        => $upcomingBooking->service->duration_minutes,
            ] : null,
            'your_usual'       => $yourUsual,
            'top_therapists'   => $topTherapists,
            'recent_activity'  => $recentActivity,
            'preferences'      => $preferences,
        ]);
    }
}