<?php

namespace App\Notifications;

use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Notifications\Messages\MailMessage;

class BookingNotification extends Notification
{
    use Queueable;

    public function __construct(
        public Booking $booking,
        public string  $type,  // accepted|rejected|en_route|arrived|completed|downpayment_verified
    ) {}

    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    // ── In-app notification data ──────────────────────────────────────────────
    public function toDatabase(object $notifiable): array
    {
        $therapistName = $this->booking->therapist->user->name;
        $serviceName   = $this->booking->service->name;
        $bookingRef    = 'IHS-' . str_pad($this->booking->id, 5, '0', STR_PAD_LEFT);

        $messages = [
            'accepted'              => [
                'title'   => 'Booking Confirmed! 🎉',
                'message' => "Your session with {$therapistName} has been confirmed!",
                'icon'    => 'check-circle',
                'color'   => 'green',
            ],
            'rejected'              => [
                'title'   => 'Booking Declined',
                'message' => "Unfortunately, your booking was declined by {$therapistName}.",
                'icon'    => 'x-circle',
                'color'   => 'red',
            ],
            'en_route'              => [
                'title'   => 'Therapist On The Way! 🚗',
                'message' => "{$therapistName} is on her way! ETA 45 mins.",
                'icon'    => 'navigation',
                'color'   => 'blue',
            ],
            'arrived'               => [
                'title'   => 'Therapist Arrived! 📍',
                'message' => "Your therapist {$therapistName} has arrived!",
                'icon'    => 'map-pin',
                'color'   => 'gold',
            ],
            'completed'             => [
                'title'   => 'Session Complete! ⭐',
                'message' => "How was your session with {$therapistName}? Rate now!",
                'icon'    => 'star',
                'color'   => 'gold',
            ],
            'downpayment_verified'  => [
                'title'   => 'Payment Verified! ✅',
                'message' => "Your downpayment for {$bookingRef} has been verified!",
                'icon'    => 'check',
                'color'   => 'green',
            ],
        ];

        $msg = $messages[$this->type] ?? [
            'title'   => 'Booking Update',
            'message' => "Your booking {$bookingRef} has been updated.",
            'icon'    => 'bell',
            'color'   => 'gray',
        ];

        return [
            'type'       => $this->type,
            'booking_id' => $this->booking->id,
            'booking_ref'=> $bookingRef,
            'title'      => $msg['title'],
            'message'    => $msg['message'],
            'icon'       => $msg['icon'],
            'color'      => $msg['color'],
            'url'        => '/my-bookings',
        ];
    }

    // ── Email notification ────────────────────────────────────────────────────
    public function toMail(object $notifiable): MailMessage
    {
        $therapistName = $this->booking->therapist->user->name;
        $serviceName   = $this->booking->service->name;
        $bookingRef    = 'IHS-' . str_pad($this->booking->id, 5, '0', STR_PAD_LEFT);
        $date          = \Carbon\Carbon::parse($this->booking->scheduled_start)->format('l, d F Y');
        $time          = \Carbon\Carbon::parse($this->booking->scheduled_start)->format('g:i A');

        $subjects = [
            'accepted'             => "✅ Booking Confirmed — {$bookingRef}",
            'rejected'             => "❌ Booking Declined — {$bookingRef}",
            'en_route'             => "🚗 Your Therapist is On The Way!",
            'arrived'              => "📍 Your Therapist Has Arrived!",
            'completed'            => "⭐ How was your session?",
            'downpayment_verified' => "✅ Downpayment Verified — {$bookingRef}",
        ];

        $mail = (new MailMessage)
            ->subject($subjects[$this->type] ?? "Booking Update — {$bookingRef}")
            ->greeting("Hello, {$notifiable->name}!")
            ->line("**Booking Reference:** {$bookingRef}")
            ->line("**Service:** {$serviceName}")
            ->line("**Therapist:** {$therapistName}")
            ->line("**Date:** {$date} at {$time}");

        match ($this->type) {
            'accepted' => $mail
                ->line('🎉 Great news! Your booking has been **confirmed** by your therapist.')
                ->line('Please ensure you are ready at your location at the scheduled time.')
                ->action('View Booking', url('/my-bookings')),

            'rejected' => $mail
                ->line('We regret to inform you that your booking was **declined** by the therapist.')
                ->line('Please book again with another available therapist.')
                ->action('Book Again', url('/book-session')),

            'en_route' => $mail
                ->line("🚗 {$therapistName} is **on the way** to your location!")
                ->line('Please be ready to receive your therapist. ETA is approximately 45 minutes.')
                ->action('View Booking', url('/my-bookings')),

            'arrived' => $mail
                ->line("📍 {$therapistName} has **arrived** at your location!")
                ->line('Enjoy your session! 🧘')
                ->action('View Booking', url('/my-bookings')),

            'completed' => $mail
                ->line('✅ Your session has been **completed**. We hope you enjoyed it!')
                ->line('Please take a moment to rate your experience within 48 hours.')
                ->action('Rate Your Session', url('/my-bookings')),

            'downpayment_verified' => $mail
                ->line('✅ Your **downpayment has been verified** by our team.')
                ->line('Your booking is now confirmed and waiting for therapist acceptance.')
                ->action('View Booking', url('/my-bookings')),

            default => $mail->action('View Booking', url('/my-bookings')),
        };

        return $mail->salutation('Warm regards, Infinity Home Spa 🌿');
    }
}