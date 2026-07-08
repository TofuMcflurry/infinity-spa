<?php

namespace App\Listeners;

use App\Events\Audit\AuditEvent;
use App\Services\AuditService;

class AuditLogListener
{
    /**
     * Handle any AuditEvent subclass.
     * Since all audit events extend AuditEvent and carry the same shape,
     * one listener handles everything — no need for separate listeners per event.
     */
    public function handle(AuditEvent $event): void
    {
        AuditService::log(
            event:      $event->event,
            targetType: $event->targetType,
            targetId:   $event->targetId,
            metadata:   $event->metadata,
            request:    $event->request,
        );
    }
}