<?php
use Illuminate\Support\Facades\Broadcast;
use App\Models\Booking;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

Broadcast::channel('booking.{bookingId}', function ($user, $bookingId) {
    $booking = Booking::find($bookingId);
    return $booking && $booking->customer_id === $user->id;
});

Broadcast::channel('therapist.{therapistId}', function ($user, $therapistId) {
    return (int) $user->id === (int) $therapistId && $user->therapist !== null;
});

Broadcast::channel('bookings', function ($user) {
    return $user !== null && $user->therapist !== null;
});

// GPS v1 — see docs/architecture/GPS-ARCHITECTURE.md §8/§11/§20. Deliberately
// a separate channel from booking.{bookingId} above: that channel's auth is
// status-agnostic (used for every lifecycle broadcast), while GPS access must
// additionally require the booking to currently be en_route. Admin gets the
// same booking-scoped access as the customer, not a fleet-wide channel.
// Therapist self-subscription is intentionally not granted here — out of
// scope for this step.
Broadcast::channel('booking.{bookingId}.location', function ($user, $bookingId) {
    $booking = Booking::find($bookingId);

    if (! $booking || $booking->status !== 'en_route') {
        return false;
    }

    if ($user->isAdmin()) {
        return true;
    }

    return $booking->customer_id === $user->id;
});