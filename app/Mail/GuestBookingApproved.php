<?php

namespace App\Mail;

use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class GuestBookingApproved extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Booking $booking) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: '✅ Booking Confirmed — Infinity Home Spa');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.guest_booking_approved');
    }

    public function attachments(): array
    {
        return [];
    }
}
