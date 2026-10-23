<?php

namespace App\Events\Audit;

use Illuminate\Http\Request;

class PasswordChanged extends AuditEvent
{
    public function __construct(int $userId, Request $request)
    {
        parent::__construct('auth.password_changed', 'User', $userId, request: $request);
    }
}
