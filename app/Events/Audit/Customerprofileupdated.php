<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class CustomerProfileUpdated extends AuditEvent
{
    public function __construct(int $userId, ?Request $request = null)
    {
        parent::__construct('customer.profile_updated', 'User', $userId, [], $request);
    }
}