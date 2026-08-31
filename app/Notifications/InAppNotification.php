<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class InAppNotification extends Notification
{
    use Queueable;

    public function __construct(
        protected string  $title,
        protected string  $message,
        protected ?string $icon = null,
        protected ?string $color = null,
        protected ?string $url = null,
    ) {
    }

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'title'   => $this->title,
            'message' => $this->message,
            'icon'    => $this->icon,
            'color'   => $this->color,
            'url'     => $this->url,
        ];
    }
}
