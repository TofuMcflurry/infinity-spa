<?php

namespace App\Notifications;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;

class EnforcementNotification extends InAppNotification implements ShouldQueue
{
    public int $tries = 3;

    public function __construct(string $title, string $message)
    {
        parent::__construct($title, $message);
        // Both writes belong to the enforcement transaction. Workers cannot see
        // the mail job until commit; SMTP never runs in the enforcement request.
        $this->beforeCommit();
    }

    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    public function viaConnections(): array
    {
        return ['database' => 'sync', 'mail' => 'database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject($this->title)
            ->greeting('Hello,')
            ->line($this->message)
            ->salutation('Infinity Home Spa');
    }

    public function shouldSend(object $notifiable, string $channel): bool
    {
        $notice = $notifiable->notifications()->find($this->id);

        return $channel === 'database'
            ? $notice === null
            : $notice !== null && empty($notice->data['mail_sent_at']);
    }

    public function afterSending(object $notifiable, string $channel, mixed $response): void
    {
        if ($channel === 'mail') {
            $notice = $notifiable->notifications()->findOrFail($this->id);
            $notice->update(['data' => array_merge($notice->data, ['mail_sent_at' => now()->toISOString()])]);
        }
    }
}
