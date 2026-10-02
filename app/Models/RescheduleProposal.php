<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RescheduleProposal extends Model
{
    // An admin-offered candidate time, awaiting the customer's response —
    // never the booking's actual schedule. Only
    // RescheduleProposalService::accept() (direct) or an approved
    // countered reschedule_requests row (via countered_into_request_id)
    // is allowed to move the booking, through BookingRescheduleService.
    protected $fillable = [
        'booking_id', 'proposed_by_user_id', 'proposed_start_at', 'status',
        'admin_reason', 'customer_response_note', 'responded_at', 'expires_at',
        'countered_into_request_id',
    ];

    protected $casts = [
        'proposed_start_at' => 'datetime',
        'responded_at'      => 'datetime',
        'expires_at'        => 'datetime',
    ];

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    // The admin who sent this proposal.
    public function proposedBy()
    {
        return $this->belongsTo(User::class, 'proposed_by_user_id');
    }

    // Set only when the customer responded "Request Another Time" — the
    // standard RescheduleRequest their counter-suggestion became, reviewed
    // through the existing admin request flow (never a second review surface).
    public function counteredIntoRequest()
    {
        return $this->belongsTo(RescheduleRequest::class, 'countered_into_request_id');
    }
}
