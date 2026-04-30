<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Response;

class TherapistEarningsController extends Controller
{
    private const COMMISSION_RATE = 0.60;

    // GET /therapist/api/earnings → summary cards
    public function index()
    {
        $therapist = auth()->user()->therapist;

        $completed = Booking::with('service')
            ->where('therapist_id', $therapist->id)
            ->where('status', 'completed')
            ->get();

        $now          = now();
        $startOfWeek  = $now->copy()->startOfWeek();
        $startOfMonth = $now->copy()->startOfMonth();

        $pending = Booking::with('service')
            ->where('therapist_id', $therapist->id)
            ->whereIn('status', ['accepted', 'en_route', 'arrived'])
            ->get();

        return response()->json([
            'total_earnings'   => $this->calcEarnings($completed),
            'this_month'       => $this->calcEarnings(
                $completed->filter(fn ($b) => $b->updated_at >= $startOfMonth)
            ),
            'this_week'        => $this->calcEarnings(
                $completed->filter(fn ($b) => $b->updated_at >= $startOfWeek)
            ),
            'pending_earnings' => $this->calcEarnings($pending),
            'commission_rate'  => self::COMMISSION_RATE,
        ]);
    }

    // GET /therapist/api/earnings/chart?view=weekly|monthly
    public function chart(Request $request)
    {
        $therapist = auth()->user()->therapist;
        $view      = $request->query('view', 'weekly');

        $completed = Booking::with('service')
            ->where('therapist_id', $therapist->id)
            ->where('status', 'completed')
            ->get();

        if ($view === 'monthly') {
            $data = [];
            for ($i = 5; $i >= 0; $i--) {
                $month  = now()->copy()->subMonths($i);
                $data[] = [
                    'label'  => $month->format('M'),
                    'amount' => $this->calcEarnings(
                        $completed->filter(fn ($b) =>
                            $b->updated_at->year  === (int) $month->format('Y') &&
                            $b->updated_at->month === (int) $month->format('n')
                        )
                    ),
                ];
            }
        } else {
            $data = [];
            for ($i = 3; $i >= 0; $i--) {
                $weekStart = now()->copy()->startOfWeek()->subWeeks($i);
                $weekEnd   = $weekStart->copy()->endOfWeek();
                $data[]    = [
                    'label'  => 'Week ' . (4 - $i),
                    'amount' => $this->calcEarnings(
                        $completed->filter(fn ($b) =>
                            $b->updated_at >= $weekStart && $b->updated_at <= $weekEnd
                        )
                    ),
                ];
            }
        }

        return response()->json(['data' => $data, 'view' => $view]);
    }

    // GET /therapist/api/earnings/transactions?page=1&per_page=10&sort=date_desc
    public function transactions(Request $request)
    {
        $therapist = auth()->user()->therapist;
        $perPage   = min((int) $request->query('per_page', 10), 50);
        $sort      = $request->query('sort', 'date_desc');

        $query = Booking::with(['service', 'customer'])
            ->where('therapist_id', $therapist->id)
            ->where('status', 'completed');

        match ($sort) {
            'date_asc'    => $query->orderBy('updated_at', 'asc'),
            'amount_desc' => $query->leftJoin('services', 'services.id', '=', 'bookings.service_id')
                                   ->orderBy('services.price', 'desc')
                                   ->select('bookings.*'),
            'amount_asc'  => $query->leftJoin('services', 'services.id', '=', 'bookings.service_id')
                                   ->orderBy('services.price', 'asc')
                                   ->select('bookings.*'),
            default       => $query->orderBy('updated_at', 'desc'),
        };

        $paginated = $query->paginate($perPage);

        $paginated->getCollection()->transform(function ($booking) {
            $price = (float) ($booking->service?->price ?? 0);
            return [
                'id'             => $booking->id,
                'service_name'   => $booking->service?->name ?? '—',
                'customer_name'  => $booking->customer?->name ?? $booking->guest_name ?? 'Guest',
                'date_completed' => $booking->updated_at->format('Y-m-d'),
                'service_price'  => $price,
                'earned'         => round($price * self::COMMISSION_RATE, 2),
                'status'         => 'released',
            ];
        });

        return response()->json($paginated);
    }

    // GET /therapist/api/earnings/export → CSV download
    public function export()
    {
        $therapist = auth()->user()->therapist;

        $bookings = Booking::with(['service', 'customer'])
            ->where('therapist_id', $therapist->id)
            ->where('status', 'completed')
            ->orderBy('updated_at', 'desc')
            ->get();

        $rows = ["Service,Customer,Date Completed,Service Price (AED),Your Earnings (AED),Status\n"];

        foreach ($bookings as $booking) {
            $price  = (float) ($booking->service?->price ?? 0);
            $earned = round($price * self::COMMISSION_RATE, 2);
            $rows[] = implode(',', [
                '"' . str_replace('"', '""', $booking->service?->name ?? '—') . '"',
                '"' . str_replace('"', '""', $booking->customer?->name ?? $booking->guest_name ?? 'Guest') . '"',
                $booking->updated_at->format('Y-m-d'),
                number_format($price, 2, '.', ''),
                number_format($earned, 2, '.', ''),
                'Released',
            ]) . "\n";
        }

        $therapistName = preg_replace('/[^a-zA-Z0-9]/', '_', auth()->user()->name);
        $filename      = "earnings_{$therapistName}_" . now()->format('Y-m-d') . '.csv';

        return Response::make(implode('', $rows), 200, [
            'Content-Type'        => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    private function calcEarnings($bookings): float
    {
        return round(
            $bookings->sum(fn ($b) => (float) ($b->service?->price ?? 0) * self::COMMISSION_RATE),
            2
        );
    }
}
