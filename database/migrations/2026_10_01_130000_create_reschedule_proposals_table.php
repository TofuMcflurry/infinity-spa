<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Reschedule Proposal — the admin-initiated counterpart to
     * reschedule_requests (customer/therapist-initiated). Deliberately a
     * separate table rather than a repurposed reschedule_requests row: the
     * two have opposite requester directions (requested_by_user_id is
     * always a customer/therapist there; proposed_by_user_id is always an
     * admin here) and a wider status set (5 values vs. 3), so overloading
     * one column/table for both would blur a distinction the UI (and the
     * approval flow) needs to keep sharp — see
     * docs/design/INFINITY-HOME-SPA-UI-HANDOFF.md §8.
     *
     * proposed_start_at is the admin's candidate time; the booking's own
     * scheduled_start/scheduled_end/travel_start/buffer_end are never
     * touched by this table — only BookingRescheduleService::reschedule()
     * ever writes those, and only once the customer accepts (or, for a
     * countered proposal, once the admin approves the resulting
     * reschedule_requests row via countered_into_request_id).
     */
    public function up(): void
    {
        Schema::create('reschedule_proposals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained()->cascadeOnDelete();
            $table->foreignId('proposed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('proposed_start_at');
            $table->enum('status', ['pending', 'accepted', 'countered', 'cancelled', 'expired'])->default('pending');
            $table->text('admin_reason')->nullable();
            $table->text('customer_response_note')->nullable();
            $table->timestamp('responded_at')->nullable();
            $table->timestamp('expires_at');
            $table->foreignId('countered_into_request_id')->nullable()
                ->constrained('reschedule_requests')->nullOnDelete();
            $table->timestamps();

            // Finds "is there already an active proposal for this booking" —
            // the exact check RescheduleProposalService::create() runs.
            $table->index(['booking_id', 'status']);
            // Scans for bookings:expire-reschedule-proposals' claim query.
            $table->index(['status', 'expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reschedule_proposals');
    }
};
