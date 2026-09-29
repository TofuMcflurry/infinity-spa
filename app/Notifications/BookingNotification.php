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
        public string  $type,  // accepted|rejected|cancelled|en_route|arrived|completed|booking_pending|customer_cancelled|payment_succeeded|payment_failed
    ) {}

    // In-app-only types: the therapist's "new request" alert and the
    // customer's own-cancellation confirmation. Both are evaluated for email
    // separately — kept database-only here so this step doesn't add mail.
    private const DATABASE_ONLY_TYPES = ['booking_pending', 'customer_cancelled'];

    public function via(object $notifiable): array
    {
        if (in_array($this->type, self::DATABASE_ONLY_TYPES, true)) {
            return ['database'];
        }

        return ['database', 'mail'];
    }

    // ── In-app notification data ──────────────────────────────────────────────
    public function toDatabase(object $notifiable): array
    {
        $therapistName = $this->booking->therapist->user->name;
        $serviceName   = $this->booking->service->name;
        $customerName  = $this->shortCustomerDisplayName();
        $bookingRef    = 'IHS-' . str_pad($this->booking->id, 5, '0', STR_PAD_LEFT);
        $sessionLabel  = \Carbon\Carbon::parse($this->booking->scheduled_start)
            ->timezone('Asia/Dubai')
            ->format('M j \a\t g:i A');

        $messages = [
            'booking_pending'       => [
                'title'   => 'New Booking Request',
                'message' => "{$customerName} requested a {$serviceName} for {$sessionLabel}.",
                'icon'    => 'calendar-plus',
                'color'   => 'blue',
            ],
            'customer_cancelled'    => [
                'title'   => 'Booking Cancelled',
                'message' => "Your {$serviceName} booking for {$sessionLabel} has been cancelled.",
                'icon'    => 'x-circle',
                'color'   => 'red',
            ],
            // Therapist-initiated cancellation (TherapistBookingController::cancel()
            // passes type 'cancelled') — distinct from the customer's own
            // 'customer_cancelled', but was previously missing from this map
            // entirely and fell through to the generic "Booking Update" default.
            'cancelled'             => [
                'title'   => 'Booking Cancelled',
                'message' => "Your {$serviceName} booking for {$sessionLabel} has been cancelled.",
                'icon'    => 'x-circle',
                'color'   => 'red',
            ],
            'payment_succeeded'     => [
                'title'   => 'Payment Successful',
                'message' => "Your payment of AED {$this->booking->paid_amount} for {$serviceName} was successful.",
                'icon'    => 'check',
                'color'   => 'green',
            ],
            'payment_failed'        => [
                'title'   => 'Payment Failed',
                'message' => "Your payment for {$serviceName} could not be completed.",
                'icon'    => 'x-circle',
                'color'   => 'red',
            ],
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
            'url'        => $this->type === 'booking_pending'
                ? '/therapist/bookings?tab=pending'
                : '/my-bookings',
        ];
    }

    // A short, customer-facing-safe display name for the therapist's
    // notification — "Maria S." rather than the full legal name.
    private function shortCustomerDisplayName(): string
    {
        $fullName = $this->booking->customer->name;
        $parts    = preg_split('/\s+/', trim($fullName));
        $first    = $parts[0] ?? $fullName;
        $lastInitial = (isset($parts[1]) && $parts[1] !== '')
            ? strtoupper(substr($parts[1], 0, 1)) . '.'
            : '';

        return trim($first . ' ' . $lastInitial);
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
            'payment_succeeded'    => "✅ Payment Successful — {$bookingRef}",
            'payment_failed'       => "❌ Payment Failed — {$bookingRef}",
            'cancelled'            => "Your Infinity Home Spa booking has been cancelled",
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

            'cancelled' => $mail
                ->line('Unfortunately, your booking has been **cancelled** by your therapist.')
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

            'payment_succeeded' => $mail
                ->line("✅ Your payment of **AED {$this->booking->paid_amount}** has been received.")
                ->line('Your booking payment is confirmed.')
                ->action('View Booking', url('/my-bookings')),

            'payment_failed' => $mail
                ->line('❌ Unfortunately, your payment **could not be completed**.')
                ->line('Please try booking again or use a different payment method.')
                ->action('Book Again', url('/book-session')),

            default => $mail->action('View Booking', url('/my-bookings')),
        };

        return $mail->salutation('Warm regards, Infinity Home Spa 🌿');
    }
}