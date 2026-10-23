<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\UserReport;
use App\Services\ReportSubmissionService;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    // ── Customer reports the therapist assigned to their own booking ─────────
    public function store(Request $request, Booking $booking)
    {
        abort_if(auth()->id() !== $booking->customer_id, 403, 'Unauthorized.');

        $request->validate([
            'reason'      => 'required|string|in:no_show,unprofessional_conduct,payment_dispute,safety_concern,other',
            'description' => 'nullable|string|max:1000',
        ]);

        $booking->loadMissing('therapist');
        $reportedUserId = $booking->therapist?->user_id;
        abort_if(!$reportedUserId, 422, 'This booking has no reportable therapist.');

        $report = ReportSubmissionService::submit(
            booking:        $booking,
            reporterId:     auth()->id(),
            reporterType:   'customer',
            reportedUserId: $reportedUserId,
            reportedType:   'therapist',
            reason:         $request->input('reason'),
            description:    $request->input('description'),
            request:        $request,
        );

        return response()->json($this->format($report), 201);
    }

    // ── Customer's own report status for this booking ────────────────────────
    public function show(Booking $booking)
    {
        abort_if(auth()->id() !== $booking->customer_id, 403, 'Unauthorized.');

        $report = UserReport::where('booking_id', $booking->id)
            ->where('reporter_id', auth()->id())
            ->first();

        return response()->json(['report' => $report ? $this->format($report) : null]);
    }

    private function format(UserReport $report): array
    {
        return [
            'id'          => $report->id,
            'status'      => $report->status,
            'reason'      => $report->reason,
            'description' => $report->description,
            'created_at'  => $report->created_at,
        ];
    }
}
