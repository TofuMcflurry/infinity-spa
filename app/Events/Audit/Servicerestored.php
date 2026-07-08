<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class ServiceRestored extends AuditEvent
{
    public function __construct(int $serviceId, string $serviceName, ?Request $request = null)
    {
        parent::__construct('service.restored', 'Service', $serviceId, ['name' => $serviceName], $request);
    }
}