<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class TherapistApproved extends AuditEvent
{
    public function __construct(int $therapistId, string $therapistName, ?Request $request = null)
    {
        parent::__construct('therapist.approved', 'Therapist', $therapistId, ['name' => $therapistName], $request);
    }
}