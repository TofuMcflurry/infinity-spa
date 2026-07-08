<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class UserLoggedOut extends AuditEvent
{
    public function __construct(int $userId, string $userName, ?Request $request = null)
    {
        parent::__construct('auth.logout', 'User', $userId, ['name' => $userName], $request);
    }
}