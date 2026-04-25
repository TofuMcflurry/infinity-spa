<?php

namespace App\Jobs;

use App\Mail\GuestConversionPromo;
use App\Models\Booking;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Mail;

class SendGuestConversionEmail implements ShouldQueue
{
    use Queueable;

    public function __construct(public Booking $booking) {}

    public function handle(): void
    {
        // Skip if the guest already converted to a customer
        if ($this->booking->is_converted || ! $this->booking->guest_email) {
            return;
        }

        Mail::to($this->booking->guest_email)
            ->send(new GuestConversionPromo($this->booking));
    }
}
