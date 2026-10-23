<?php

namespace App\Events\Audit;

use Illuminate\Http\Request;

class PasswordResetCompleted extends AuditEvent
{
    public function __construct(int $userId, Request $request)
    {
        // Token possession establishes the reset target, not an authenticated
        // human actor. Never attribute this to an unrelated ambient session.
        parent::__construct('auth.password_reset', 'User', $userId, request: $request, systemOrigin: true);
    }
}
