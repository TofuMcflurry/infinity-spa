<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use Illuminate\Http\Request;
use App\Notifications\BookingNotification;
use App\Events\BookingStatusUpdated;
use Illuminate\Support\Facades\DB;

class TherapistBookingController extends Controller
{
    public function index(Request $request)
    {
        $therapist = auth()->user()->therapist;
        $perPage   = $request->query('per_page', 15);
        $status    = $request->query('status');

        // Past-due pending/accepted bookings are handled centrally by the
        // scheduled bookings:auto-cancel-past-due / bookings:flag-stale-active-sessions
        // commands (App\Console\Commands) — this used to duplicate that sweep
        // inline (and inconsistently, without setting cancellation_type/cancelled_at,
        // while also wrongly treating 'accepted' the same as 'pending').

        $query = Booking::with(['customer', 'service', 'serviceVariant'])
            ->where('therapist_id', $therapist->id)
            ->orderBy('scheduled_start', 'asc');

        if ($status) {
            $statusList = array_filter(array_map('trim', explode(',', $status)));
            if (!empty($statusList)) {
                $query->whereIn('status', $statusList);
            }
        }

        return response()->json($query->paginate($perPage));
    }

    public function stats()
    {
        $therapist = auth()->user()->therapist;

        $todayCount = Booking::where('therapist_id', $therapist->id)
            ->whereDate('scheduled_start', now()->toDateString())
            ->count();

        // 'pending_payment' is still therapist-actionable (see Bookings.jsx TAB_STATUSES),
        // so it counts as "pending" here too — keeps this KPI consistent with the
        // Pending Approval section below it.
        $pendingCount = Booking::where('therapist_id', $therapist->id)
            ->whereIn('status', ['pending', 'pending_payment'])
            ->count();

        $completedCount = Booking::where('therapist_id', $therapist->id)
            ->where('status', 'completed')
            ->count();

        $weekEarnings = Booking::where('therapist_id', $therapist->id)
            ->where('status', 'completed')
            ->whereBetween('updated_at', [now()->startOfWeek(), now()->endOfWeek()])
            ->with('service')
            ->get()
            ->sum(fn($b) => ($b->service?->price ?? 0) * 0.60);

        return response()->json([
            'today_sessions'  => $todayCount,
            'pending_count'   => $pendingCount,
            'completed_count' => $completedCount,
            'week_earnings'   => round($weekEarnings, 2),
        ]);
    }

    // Row-locks the booking and re-checks it's still awaiting the therapist's
    // decision before accepting — guards against a double-click, a retried
    // request, or two overlapping requests each re-sending the "accepted"
    // notification/email for the same booking. A second, concurrent request
    // blocks on the lock until the first commits, then sees the fresh
    // 'accepted' status and aborts here — before either notification fires.
    public function accept(Booking $booking)
    {
        $this->authorizeTherapist($booking);

        $locked = DB::transaction(function () use ($booking) {
            $locked = Booking::where('id', $booking->id)->lockForUpdate()->firstOrFail();

            abort_if(
                !in_array($locked->status, ['pending', 'pending_payment']),
                422,
                'This booking can no longer be accepted.'
            );

            $locked->update(['status' => 'accepted']);

            return $locked;
        });

        broadcast(new BookingStatusUpdated($locked));

        $locked->load('customer', 'service', 'serviceVariant', 'therapist.user');
        $locked->customer->notify(new BookingNotification($locked, 'accepted'));

        return response()->json(['message' => 'Booking accepted!', 'booking' => $locked]);
    }

    public function reject(Request $request, Booking $booking)
    {
        $this->authorizeTherapist($booking);
        $request->validate(['reason' => 'nullable|string|max:255']);

        $booking->update(['status' => 'rejected', 'rejection_reason' => $request->reason]);
        $booking->load('customer', 'service', 'serviceVariant', 'therapist.user');
        broadcast(new BookingStatusUpdated($booking));
        $booking->customer->notify(new BookingNotification($booking, 'rejected'));

        return response()->json(['message' => 'Booking rejected.', 'booking' => $booking]);
    }

    public function cancel(Request $request, Booking $booking)
    {
        $this->authorizeTherapist($booking);
        $request->validate(['reason' => 'nullable|string|max:255']);

        abort_if(
            in_array($booking->status, ['completed', 'rejected', 'cancelled']),
            422,
            'This booking cannot be cancelled.'
        );

        $booking->update([
            'status'            => 'cancelled',
            'cancelled_at'      => now(),
            'cancellation_type' => 'therapist',
            'rejection_reason'  => $request->reason,
        ]);

        // ✅ Load ONCE, outside the if — para may relations ang broadcast
        $booking->load('customer', 'service', 'serviceVariant', 'therapist.user');
        broadcast(new BookingStatusUpdated($booking));

        // ✅ Notify only if may customer
        if ($booking->customer_id && $booking->customer) {
            $booking->customer->notify(new BookingNotification($booking, 'cancelled'));
        }

        return response()->json(['message' => 'Booking cancelled.', 'booking' => $booking]);
    }

    // ── Start session: Upcoming → Active (en_route) ───────────────────────────
    // Therapist taps this when they are actually leaving for the client.
    // Guard: only one active session allowed at a time.
    public function start(Booking $booking)
    {
        $this->authorizeTherapist($booking);

        $therapistId = auth()->user()->therapist->id;

        // Row-lock the booking so two concurrent start requests can't both
        // read status === 'accepted' and both transition it. The second
        // request blocks on the lock until the first's transaction commits,
        // then re-reads the now-'en_route' row and aborts here — only the
        // request that actually performs the transition reaches the
        // notify() call below.
        $locked = DB::transaction(function () use ($booking, $therapistId) {
            $locked = Booking::where('id', $booking->id)->lockForUpdate()->firstOrFail();

            abort_if(
                $locked->status !== 'accepted',
                422,
                'Only accepted bookings can be started.'
            );

            $hasActive = Booking::where('therapist_id', $therapistId)
                ->whereIn('status', ['en_route', 'arrived'])
                ->exists();

            abort_if($hasActive, 422, 'You already have an active session in progress.');

            $locked->update(['status' => 'en_route']);

            return $locked;
        });

        broadcast(new BookingStatusUpdated($locked));
        $locked->load('customer', 'service', 'serviceVariant', 'therapist.user');
        $locked->customer->notify(new BookingNotification($locked, 'en_route'));

        return response()->json(['message' => 'Session started! Head on over.', 'booking' => $locked]);
    }

    public function arrived(Booking $booking)
    {
        $this->authorizeTherapist($booking);
        abort_if($booking->status !== 'en_route', 422, 'Therapist must be en route first.');

        $booking->update(['status' => 'arrived']);
        broadcast(new BookingStatusUpdated($booking));
        $booking->load('customer', 'service', 'serviceVariant', 'therapist.user');
        $booking->customer->notify(new BookingNotification($booking, 'arrived'));

        return response()->json(['message' => 'Arrived!', 'booking' => $booking]);
    }

    public function complete(Booking $booking)
    {
        $this->authorizeTherapist($booking);
        abort_if($booking->status !== 'arrived', 422, 'Therapist must have arrived first.');

        \App\Services\BookingCompletionService::complete($booking);

        return response()->json(['message' => 'Booking marked as completed!', 'booking' => $booking]);
    }

    public function profile()
    {
        $therapist = auth()->user()->therapist;
        $therapist->load('user', 'zones');

        return response()->json([
            'name'             => $therapist->user->name,
            'email'            => $therapist->user->email,
            'phone'            => $therapist->user->phone,
            'avatar'           => $therapist->user->avatar,
            'bio'              => $therapist->bio,
            'specialty'        => $therapist->specialty,
            'experience_years' => $therapist->experience_years,
            'gender'           => $therapist->gender,
            'base_location'    => $therapist->base_location,
            'rating'           => $therapist->rating,
            'is_active'        => $therapist->is_active,
            'day_off'          => $therapist->day_off,
            'shift_start'      => $therapist->shift_start,
            'shift_end'        => $therapist->shift_end,
            'crosses_midnight' => $therapist->crosses_midnight,
            'zones'            => $therapist->zones,
        ]);
    }

    public function updateProfile(Request $request)
    {
        $request->validate(['bio' => 'nullable|string|max:1000', 'phone' => 'nullable|string|max:20']);

        $user      = auth()->user();
        $therapist = $user->therapist;

        if ($request->has('bio'))   $therapist->update(['bio'   => $request->bio]);
        if ($request->has('phone')) $user->update(['phone' => $request->phone]);

        return response()->json(['message' => 'Profile updated successfully.']);
    }

    public function updateAvatar(Request $request)
    {
        $request->validate(['avatar' => 'required|image|mimes:jpeg,png,jpg,webp|max:2048']);

        $user = auth()->user();
        $path = $request->file('avatar')->store('avatars', 'public');
        $url  = asset('storage/' . $path);
        $user->update(['avatar' => $url]);

        return response()->json(['message' => 'Avatar updated.', 'avatar' => $url]);
    }

    private function authorizeTherapist(Booking $booking): void
    {
        abort_if($booking->therapist_id !== auth()->user()->therapist->id, 403, 'Unauthorized.');
    }
}