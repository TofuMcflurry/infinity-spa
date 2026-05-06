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