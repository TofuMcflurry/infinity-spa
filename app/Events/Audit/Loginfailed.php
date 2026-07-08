<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class LoginFailed extends AuditEvent
{
    public function __construct(string $email, ?Request $request = null)
    {
        parent::__construct('auth.login_failed', null, null, ['email' => $email], $request);
    }
}