<?php
namespace App\Events\Audit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Http\Request;
abstract class AuditEvent
{
    use Dispatchable;
    public function __construct(
        public readonly string  $event,
        public readonly ?string $targetType = null,
        public readonly ?int    $targetId   = null,
        public readonly array   $metadata   = [],
        public readonly ?Request $request   = null,
    ) {}
}