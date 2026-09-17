<?php

namespace App\Services;

use App\Events\BookingStatusUpdated;
use App\Jobs\SendGuestConversionEmail;
use App\Models\Booking;
use App\Notifications\BookingNotification;

class BookingCompletionService
{
    /**
     * Marks a booking completed and fires the exact same side effects as
     * TherapistBookingController::complete() (broadcast, loyalty completion
     * or guest-conversion email, customer notification). Extracted so the
     * admin "Mark Completed" stale-session resolution action can trigger
     * the identical business logic instead of re-deriving it.
     */
    public static function complete(Booking $booking): void
    {
        $booking->update(['status' => 'completed']);
        broadcast(new BookingStatusUpdated($booking));
        $booking->load('service', 'serviceVariant', 'therapist.user');

        if ($booking->customer_id) {
            LoyaltyService::recordCompletion($booking->customer_id);
            $booking->load('customer');
            $booking->customer->notify(new BookingNotification($booking, 'completed'));
        } else {
            SendGuestConversionEmail::dispatch($booking)->delay(now()->addDay());
        }
    }
}
