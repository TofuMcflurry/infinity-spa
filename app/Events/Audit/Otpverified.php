<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class OtpVerified extends AuditEvent
{
    public function __construct(int $userId, string $userName, ?Request $request = null)
    {
        parent::__construct('auth.otp_verified', 'User', $userId, ['name' => $userName], $request);
    }
}