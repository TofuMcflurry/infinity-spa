<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\UserReport;
use App\Services\ReportSubmissionService;
use Illuminate\Http\Request;

class TherapistReportController extends Controller
{
    // ── Therapist reports the customer on their own assigned booking ─────────
    public function store(Request $request, Booking $booking)
    {
        abort_if($booking->therapist_id !== auth()->user()->therapist->id, 403, 'Unauthorized.');

        $request->validate([
            'reason'      => 'required|string|in:no_show,unprofessional_conduct,payment_dispute,safety_concern,other',
            'description' => 'nullable|string|max:1000',
        ]);

        $reportedUserId = $booking->customer_id;
        abort_if(!$reportedUserId, 422, 'This booking has no reportable customer account.');

        $report = ReportSubmissionService::submit(
            booking:        $booking,
            reporterId:     auth()->id(),
            reporterType:   'therapist',
            reportedUserId: $reportedUserId,
            reportedType:   'customer',
            reason:         $request->input('reason'),
            description:    $request->input('description'),
            request:        $request,
        );

        return response()->json($this->format($report), 201);
    }

    // ── Therapist's own report status for this booking ───────────────────────
    public function show(Booking $booking)
    {
        abort_if($booking->therapist_id !== auth()->user()->therapist->id, 403, 'Unauthorized.');

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
