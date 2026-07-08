<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class ServiceToggled extends AuditEvent
{
    public function __construct(int $serviceId, string $serviceName, bool $isActive, ?Request $request = null)
    {
        parent::__construct('service.toggled', 'Service', $serviceId, ['name' => $serviceName, 'is_active' => $isActive], $request);
    }
}