<?php

namespace App\Events\Audit;

use Illuminate\Http\Request;

class CustomerRestrictionChanged extends AuditEvent
{
    public function __construct(int $userId, bool $blocked, ?Request $request = null)
    {
        parent::__construct($blocked ? 'customer.blocked' : 'customer.unblocked', 'User', $userId, [
            'before' => ['is_blocked' => !$blocked],
            'after' => ['is_blocked' => $blocked],
        ], $request);
    }
}
