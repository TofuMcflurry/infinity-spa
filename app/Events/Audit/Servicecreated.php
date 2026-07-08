<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class ServiceCreated extends AuditEvent
{
    public function __construct(int $serviceId, string $serviceName, ?Request $request = null)
    {
        parent::__construct('service.created', 'Service', $serviceId, ['name' => $serviceName], $request);
    }
}