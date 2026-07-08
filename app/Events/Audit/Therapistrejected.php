<?php
namespace App\Events\Audit;
use Illuminate\Http\Request;
class TherapistRejected extends AuditEvent
{
    public function __construct(int $therapistId, string $therapistName, ?Request $request = null)
    {
        parent::__construct('therapist.rejected', 'Therapist', $therapistId, ['name' => $therapistName], $request);
    }
}