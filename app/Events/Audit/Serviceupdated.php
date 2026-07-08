<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class ServiceUpdated extends AuditEvent
{
    public function __construct(int $serviceId, string $serviceName, array $changes = [], ?Request $request = null)
    {
        parent::__construct('service.updated', 'Service', $serviceId, ['name' => $serviceName, 'changes' => $changes], $request);
    }
}