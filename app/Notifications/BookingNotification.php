<?php

namespace App\Notifications;

use App\Models\Booking;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Notifications\Messages\MailMessage;

class BookingNotification extends Notification
{
    use Queueable;

    public function __construct(
        public Booking $booking,
        public string  $type,  // accepted|rejected|cancelled|en_route|arrived|completed|booking_pending|customer_cancelled|payment_succeeded|payment_failed|rescheduled|reschedule_proposed|reschedule_countered|reschedule_proposal_expired
        // Only used by 'rescheduled' — the booking's scheduled_start BEFORE
        // the admin's change, captured by the caller before it mutated the
        // model, so the notification can show old -> new. Null for every
        // other type.
        public ?Carbon $previousScheduledStart = null,
        // Only used by 'reschedule_proposed' and 'reschedule_proposal_expired'
        // — a candidate time that is NOT on the booking itself (the booking's
        // own scheduled_start stays unchanged throughout a pending proposal,
        // see RescheduleProposalService). Null for every other type.
        public ?Carbon $candidateScheduledStart = null,
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
        // Only meaningful for 'reschedule_proposed'/'reschedule_proposal_expired'
        // — falls back to the booking's own (unchanged) schedule otherwise so
        // the message never breaks if a caller forgets to pass it.
        $proposedLabel = $this->candidateScheduledStart
            ? $this->candidateScheduledStart->timezone('Asia/Dubai')->format('M j \a\t g:i A')
            : $sessionLabel;

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
            'rescheduled'           => [
                'title'   => 'Booking Rescheduled',
                'message' => "Your {$serviceName} booking has been rescheduled to {$sessionLabel}.",
                'icon'    => 'calendar',
                'color'   => 'blue',
            ],
            // ── Reschedule Proposal (admin → customer) ──────────────────────
            // 'reschedule_proposed'/'reschedule_proposal_expired' deliberately
            // never say "rescheduled" — the booking hasn't moved yet. Only
            // the 'rescheduled' type above (fired by
            // RescheduleProposalService::accept()) represents a confirmed
            // schedule change.
            // QA finding 5 — also sent to the therapist (create() now
            // notifies both), so title/message branch by role the same way
            // the 'rescheduled' type's url already does below. The
            // therapist's copy is deliberately read-only in tone: only the
            // customer can accept/counter/cancel a proposal, and the
            // booking's own confirmed schedule stays unchanged for the
            // therapist until that response.
            'reschedule_proposed'   => ($notifiable->role ?? null) === 'therapist'
                ? [
                    'title'   => 'Schedule Change Proposed',
                    'message' => "Our team proposed a new time for the {$serviceName} booking with {$customerName}: {$proposedLabel}. Your confirmed schedule stays as-is until the customer responds.",
                    'icon'    => 'calendar-clock',
                    'color'   => 'blue',
                ]
                : [
                    'title'   => 'Schedule Change Proposed',
                    'message' => "We've proposed a new time for your {$serviceName} booking: {$proposedLabel}. Waiting for your response.",
                    'icon'    => 'calendar-clock',
                    'color'   => 'blue',
                ],
            'reschedule_countered'  => [
                'title'   => 'Customer Requested Another Time',
                'message' => "{$customerName} suggested a different time for booking {$bookingRef}.",
                'icon'    => 'calendar-clock',
                'color'   => 'blue',
            ],
            'reschedule_proposal_expired' => [
                'title'   => 'Reschedule Proposal Expired',
                'message' => "The proposed schedule change for your {$serviceName} booking went unanswered, so the booking was cancelled.",
                'icon'    => 'x-circle',
                'color'   => 'red',
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
            // 'rescheduled' is the only type sent to both a customer and a
            // therapist, so — unlike every other type here — its destination
            // depends on who's receiving it, not just the notification type.
            'url'        => match (true) {
                $this->type === 'booking_pending' => '/therapist/bookings?tab=pending',
                $this->type === 'rescheduled' && ($notifiable->role ?? null) === 'therapist' => '/therapist/bookings',
                $this->type === 'reschedule_proposed' && ($notifiable->role ?? null) === 'therapist' => '/therapist/bookings',
                // Admin-facing — sent to admins when a customer counters a
                // proposal, so it routes to the admin bookings view, not
                // the customer's own.
                $this->type === 'reschedule_countered' => '/admin/bookings',
                default => '/my-bookings',
            },
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
            'rescheduled'          => "📅 Booking Rescheduled — {$bookingRef}",
            'reschedule_proposed'          => "📅 We've Proposed a New Time — {$bookingRef}",
            'reschedule_countered'         => "🔁 Customer Suggested Another Time — {$bookingRef}",
            'reschedule_proposal_expired'  => "⌛ Reschedule Proposal Expired — {$bookingRef}",
        ];

        $mail = (new MailMessage)
            ->subject($subjects[$this->type] ?? "Booking Update — {$bookingRef}")
            ->greeting("Hello, {$notifiable->name}!")
            ->line("**Booking Reference:** {$bookingRef}")
            ->line("**Service:** {$serviceName}")
            ->line("**Therapist:** {$therapistName}");

        // 'rescheduled' shows the old time alongside the new one for
        // clarity; every other type keeps the single "Date" line as before.
        if ($this->type === 'rescheduled' && $this->previousScheduledStart) {
            $mail->line('**Previous Schedule:** ' . $this->previousScheduledStart->timezone('Asia/Dubai')->format('l, d F Y \a\t g:i A'));
            $mail->line("**New Schedule:** {$date} at {$time}");
        } elseif (in_array($this->type, ['reschedule_proposed', 'reschedule_proposal_expired'], true) && $this->candidateScheduledStart) {
            // The booking's own schedule hasn't moved yet — show it
            // alongside the candidate time so neither reads as confirmed.
            $mail->line("**Current Schedule:** {$date} at {$time}");
            $mail->line('**Proposed Schedule:** ' . $this->candidateScheduledStart->timezone('Asia/Dubai')->format('l, d F Y \a\t g:i A'));
        } else {
            $mail->line("**Date:** {$date} at {$time}");
        }

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

            // Sent to both the customer and the therapist — the action link
            // routes to whichever booking view is relevant to the recipient.
            'rescheduled' => $mail
                ->line('📅 This booking\'s schedule was **changed by our team**.')
                ->line('If you have any questions about this change, please contact us.')
                ->action('View Booking', url(
                    $notifiable->role === 'therapist' ? '/therapist/bookings' : '/my-bookings'
                )),

            // Customer-facing. Deliberately never claims the booking has
            // been rescheduled — only 'rescheduled' above does that, and
            // only once the customer has actually accepted.
            // QA finding 5 — role-aware the same way 'rescheduled' above is:
            // the therapist's copy stays read-only since only the customer
            // can act on a proposal.
            'reschedule_proposed' => $notifiable->role === 'therapist'
                ? $mail
                    ->line('📅 Our team has **proposed a new time** for this booking.')
                    ->line('Your confirmed schedule stays unchanged until the customer responds.')
                    ->action('View Booking', url('/therapist/bookings'))
                : $mail
                    ->line('📅 We\'ve proposed a **new time** for your booking.')
                    ->line('Please accept this time, suggest another, or cancel your booking.')
                    ->action('Respond to Proposal', url('/my-bookings')),

            // Admin-facing — see the 'url' override in toDatabase() for the
            // matching in-app link.
            'reschedule_countered' => $mail
                ->line("🔁 A customer suggested a different time for booking {$bookingRef}.")
                ->line('Please review and respond.')
                ->action('Review Request', url('/admin/bookings')),

            'reschedule_proposal_expired' => $mail
                ->line('⌛ The proposed schedule change for your booking went **unanswered** in time.')
                ->line('Your booking has been cancelled as a result. Please see our cancellation policy for refund details.')
                ->action('View Bookings', url('/my-bookings')),

            default => $mail->action('View Booking', url('/my-bookings')),
        };

        return $mail->salutation('Warm regards, Infinity Home Spa 🌿');
    }
}