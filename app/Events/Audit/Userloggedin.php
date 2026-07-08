<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class UserLoggedIn extends AuditEvent
{
    public function __construct(int $userId, string $userName, string $role, ?Request $request = null)
    {
        parent::__construct('auth.login', 'User', $userId, ['name' => $userName, 'role' => $role], $request);
    }
}