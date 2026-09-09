<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Review;
use App\Models\ServiceRatingLog;
use App\Models\TherapistRatingLog;
use Carbon\Carbon;
use Illuminate\Http\Request;

class ReviewController extends Controller
{
    // ── Check if customer can review a booking ────────────────────────────────
    public function checkEligibility(Request $request)
    {
        $request->validate([
            'booking_id' => 'required|exists:bookings,id',
        ]);

        $customerId = auth()->id();
        $booking    = Booking::with(['service', 'therapist.user'])
            ->where('id', $request->booking_id)
            ->where('customer_id', $customerId)
            ->where('status', 'completed')
            ->first();

        if (!$booking) {
            return response()->json([
                'eligible' => false,
                'message'  => 'Booking not found or not completed.',
            ]);
        }

        // ── Check 48 hour window ──────────────────────────────────────────────
        $completedAt    = Carbon::parse($booking->updated_at);
        $hoursElapsed   = $completedAt->diffInHours(Carbon::now());
        $withinWindow   = $hoursElapsed <= 48;

        if (!$withinWindow) {
            return response()->json([
                'eligible'         => false,
                'message'          => 'Review window has expired (48 hours).',
                'can_service_rate' => false,
                'can_therapist_rate' => false,
            ]);
        }

        // ── Check if already reviewed this booking ────────────────────────────
        $existingReview = Review::where('booking_id', $booking->id)->first();
        if ($existingReview) {
            return response()->json([
                'eligible' => false,
                'message'  => 'Already reviewed this booking.',
            ]);
        }

        // ── Check service rating eligibility ──────────────────────────────────
        $canServiceRate = ServiceRatingLog::canRate(
            $customerId,
            $booking->service->group_name
        );

        // ── Check therapist rating eligibility ────────────────────────────────
        $canTherapistRate = TherapistRatingLog::canRate(
            $customerId,
            $booking->therapist_id
        );

        $daysRemaining = TherapistRatingLog::daysRemaining(
            $customerId,
            $booking->therapist_id
        );

        // ── Neither can rate → not eligible ──────────────────────────────────
        if (!$canServiceRate && !$canTherapistRate) {
            return response()->json([
                'eligible'           => false,
                'message'            => 'Nothing to rate at this time.',
                'can_service_rate'   => false,
                'can_therapist_rate' => false,
                'days_remaining'     => $daysRemaining,
            ]);
        }

        return response()->json([
            'eligible'           => true,
            'booking'            => [
                'id'              => $booking->id,
                'service'         => $booking->service->name,
                'service_group'   => $booking->service->group_name,
                'therapist'       => $booking->therapist->user->name,
                'therapist_id'    => $booking->therapist_id,
                'date'            => Carbon::parse($booking->scheduled_start)->format('M d, Y'),
                'time'            => Carbon::parse($booking->scheduled_start)->format('g:i A'),
            ],
            'can_service_rate'   => $canServiceRate,
            'can_therapist_rate' => $canTherapistRate,
            'days_remaining'     => $daysRemaining,
            'hours_remaining'    => 48 - $hoursElapsed,
        ]);
    }

    // ── Submit review ─────────────────────────────────────────────────────────
    public function store(Request $request)
    {
        $request->validate([
            'booking_id'       => 'required|exists:bookings,id',
            'service_rating'   => 'nullable|integer|min:1|max:5',
            'therapist_rating' => 'nullable|integer|min:1|max:5',
            'comment'          => 'nullable|string|max:500',
        ]);

        $customerId = auth()->id();
        $booking    = Booking::with(['service', 'therapist'])
            ->where('id', $request->booking_id)
            ->where('customer_id', $customerId)
            ->where('status', 'completed')
            ->firstOrFail();

        // ── 48 hour window check ──────────────────────────────────────────────
        $hoursElapsed = Carbon::parse($booking->updated_at)->diffInHours(Carbon::now());
        if ($hoursElapsed > 48) {
            return response()->json([
                'message' => 'Review window has expired.',
            ], 422);
        }

        // ── Prevent duplicate review ──────────────────────────────────────────
        if (Review::where('booking_id', $booking->id)->exists()) {
            return response()->json([
                'message' => 'Already reviewed this booking.',
            ], 422);
        }

        $serviceGroup = $booking->service->group_name;
        $therapistId  = $booking->therapist_id;

        // ── Validate eligibility ──────────────────────────────────────────────
        $canServiceRate   = $request->service_rating
            ? ServiceRatingLog::canRate($customerId, $serviceGroup)
            : false;

        $canTherapistRate = $request->therapist_rating
            ? TherapistRatingLog::canRate($customerId, $therapistId)
            : false;

        // ── Compute CSAT scores ───────────────────────────────────────────────
        $serviceCsat   = $canServiceRate && $request->service_rating
            ? Review::computeCsat($request->service_rating)
            : null;

        $therapistCsat = $canTherapistRate && $request->therapist_rating
            ? Review::computeCsat($request->therapist_rating)
            : null;

        // ── Create review ─────────────────────────────────────────────────────
        $review = Review::create([
            'booking_id'       => $booking->id,
            'customer_id'      => $customerId,
            'therapist_id'     => $therapistId,
            'service_group'    => $serviceGroup,
            'service_id'       => $booking->service_id,
            'service_rating'   => $canServiceRate   ? $request->service_rating   : null,
            'therapist_rating' => $canTherapistRate ? $request->therapist_rating : null,
            'service_csat'     => $serviceCsat,
            'therapist_csat'   => $therapistCsat,
            'comment'          => $request->comment,
            'is_visible'       => true,
        ]);

        // ── Update logs ───────────────────────────────────────────────────────
        if ($canServiceRate && $request->service_rating) {
            ServiceRatingLog::create([
                'customer_id'   => $customerId,
                'service_group' => $serviceGroup,
                'rated_at'      => now(),
            ]);
        }

        if ($canTherapistRate && $request->therapist_rating) {
            TherapistRatingLog::updateOrCreate(
                [
                    'customer_id'  => $customerId,
                    'therapist_id' => $therapistId,
                ],
                ['last_rated_at' => now()]
            );
        }

        // ── Recompute ratings ─────────────────────────────────────────────────
        if ($canServiceRate && $request->service_rating) {
            Review::recomputeServiceRating($serviceGroup);
        }

        if ($canTherapistRate && $request->therapist_rating) {
            Review::recomputeTherapistRating($therapistId, $review->id);
        }

        return response()->json([
            'message' => 'Review submitted successfully!',
            'review'  => $review,
        ], 201);
    }

    // ── Get pending reviews for customer ──────────────────────────────────────
    public function pendingReviews()
    {
        $customerId = auth()->id();

        // Find completed bookings within 48 hours that haven't been reviewed
        $bookings = Booking::with(['service', 'therapist.user'])
            ->where('customer_id', $customerId)
            ->where('status', 'completed')
            ->where('updated_at', '>=', now()->subHours(48))
            ->whereDoesntHave('review')
            ->get();

        $pending = $bookings->filter(function ($booking) use ($customerId) {
            $canServiceRate = ServiceRatingLog::canRate(
                $customerId,
                $booking->service->group_name
            );
            $canTherapistRate = TherapistRatingLog::canRate(
                $customerId,
                $booking->therapist_id
            );
            return $canServiceRate || $canTherapistRate;
        })->map(fn($b) => [
            'booking_id'      => $b->id,
            'service'         => $b->service->name,
            'service_group'   => $b->service->group_name,
            'therapist'       => $b->therapist->user->name,
            'therapist_id'    => $b->therapist_id,
            'date'            => Carbon::parse($b->scheduled_start)->format('M d, Y'),
            'time'            => Carbon::parse($b->scheduled_start)->format('g:i A'),
            'hours_remaining' => 48 - Carbon::parse($b->updated_at)->diffInHours(now()),
            'can_service_rate'   => ServiceRatingLog::canRate($customerId, $b->service->group_name),
            'can_therapist_rate' => TherapistRatingLog::canRate($customerId, $b->therapist_id),
        ])->values();

        return response()->json($pending);
    }
}