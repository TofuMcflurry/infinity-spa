<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class ServiceArchived extends AuditEvent
{
    public function __construct(int $serviceId, string $serviceName, ?Request $request = null)
    {
        parent::__construct('service.archived', 'Service', $serviceId, ['name' => $serviceName], $request);
    }
}