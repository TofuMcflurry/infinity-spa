<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class GoogleLoginUsed extends AuditEvent
{
    public function __construct(int $userId, string $userName, ?Request $request = null)
    {
        parent::__construct('auth.google_login', 'User', $userId, ['name' => $userName], $request);
    }
}