<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuditService
{
    /**
     * Record an audit log entry.
     *
     * @param  string       $event       e.g. 'booking.accepted'
     * @param  string|null  $targetType  e.g. 'Booking'
     * @param  int|null     $targetId    e.g. 32
     * @param  array        $metadata    any extra context (old/new values, reason, etc.)
     * @param  Request|null $request     for IP + user agent capture
     */
    public static function log(
        string  $event,
        ?string $targetType = null,
        ?int    $targetId   = null,
        array   $metadata   = [],
        ?Request $request   = null,
    ): void {
        $user = Auth::user();

        AuditLog::create([
            'user_id'     => $user?->id,
            'user_name'   => $user?->name,
            'user_role'   => $user?->role,
            'event'       => $event,
            'target_type' => $targetType,
            'target_id'   => $targetId,
            'metadata'    => empty($metadata) ? null : $metadata,
            'ip_address'  => $request?->ip(),
            'user_agent'  => $request?->userAgent(),
            'created_at'  => now(),
        ]);
    }
}