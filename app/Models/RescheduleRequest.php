<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RescheduleRequest extends Model
{
    // A preference for a new time, captured for later admin review — never
    // the booking's actual schedule. Only AdminBookingController's
    // approve/reject endpoints may resolve a request, and only
    // approveRescheduleRequest() is allowed to move the booking, via
    // BookingRescheduleService.
    protected $fillable = [
        'booking_id', 'requested_by_user_id', 'requested_by_role',
        'requested_start_at', 'reason', 'status', 'admin_notes',
        'resolved_start_at', 'reviewed_at', 'reviewed_by_user_id',
    ];

    protected $casts = [
        'requested_start_at' => 'datetime',
        'resolved_start_at'  => 'datetime',
        'reviewed_at'        => 'datetime',
    ];

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    // The user who submitted the request — a customer or a therapist,
    // see requested_by_role. Replaces the old therapist-only therapist()
    // relation now that this table serves both.
    public function requestedBy()
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    // The admin who approved or rejected this request — distinct from
    // requestedBy(), which is whoever originally submitted it.
    public function reviewedBy()
    {
        return $this->belongsTo(User::class, 'reviewed_by_user_id');
    }

    // Set only when this request exists because a customer countered a
    // RescheduleProposal (admin -> customer) instead of accepting it — the
    // inverse of RescheduleProposal::counteredIntoRequest(). Lets the admin
    // review flow show a "Countered Proposal" tag without a second review
    // surface (docs/design/INFINITY-HOME-SPA-UI-HANDOFF.md §8.8).
    public function counteredFromProposal()
    {
        return $this->hasOne(RescheduleProposal::class, 'countered_into_request_id');
    }
}
