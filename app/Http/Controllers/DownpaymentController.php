<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DownpaymentController extends Controller
{
    // ── Get bank details ──────────────────────────────────────────────────────
    public function getBankDetails()
    {
        return response()->json([
            'bank_name'      => 'Emirates NBD',
            'account_name'   => 'Infinity Home Spa',
            'account_number' => 'XXXX-XXXX-XXXX',
            'iban'           => 'AE00 0000 0000 0000 0000 000',
            'swift'          => 'EBILAEAD',
            'note'           => 'Please use your Booking Reference as payment reference.',
        ]);
    }

    // ── Upload downpayment proof ──────────────────────────────────────────────
    public function uploadProof(Request $request)
    {
        $request->validate([
            'booking_id' => 'required|exists:bookings,id',
            'proof'      => 'required|image|mimes:jpg,jpeg,png|max:5120', // 5MB max
        ]);

        $customerId = auth()->id();
        $booking    = Booking::where('id', $request->booking_id)
            ->where('customer_id', $customerId)
            ->where('downpayment_status', 'pending')
            ->firstOrFail();

        // Store the proof image
        $path = $request->file('proof')->store(
            'downpayments/' . $booking->id,
            'public'
        );

        // Update booking
        $booking->update([
            'downpayment_proof'        => Storage::url($path),
            'downpayment_status'       => 'submitted',
            'downpayment_submitted_at' => now(),
            'status'                   => 'pending', // Move from pending_payment to pending
        ]);

        return response()->json([
            'message'      => 'Payment proof uploaded successfully!',
            'proof_url'    => Storage::url($path),
            'booking_id'   => $booking->id,
        ]);
    }

    // ── Cancel booking ────────────────────────────────────────────────────────
    public function cancel(Request $request)
    {
        $request->validate([
            'booking_id' => 'required|exists:bookings,id',
        ]);

        $customerId = auth()->id();
        $booking    = Booking::with('service')
            ->where('id', $request->booking_id)
            ->where('customer_id', $customerId)
            ->whereIn('status', ['pending_payment', 'pending', 'accepted'])
            ->firstOrFail();

        // ── Check grace period (24 hours before session) ──────────────────
        $sessionStart   = Carbon::parse($booking->scheduled_start);
        $hoursUntil     = now()->diffInHours($sessionStart, false); // false = signed diff
        $withinGrace    = $hoursUntil > 24; // more than 24hrs away = within grace

        // Determine cancellation type
        if ($booking->downpayment_status === 'pending') {
            // Downpayment not yet submitted — just cancel, no charge
            $cancellationType    = 'refunded';
            $downpaymentStatus   = 'refunded';
        } elseif ($withinGrace) {
            // Cancelled before 24hrs → REFUND
            $cancellationType    = 'refunded';
            $downpaymentStatus   = 'refunded';
        } else {
            // Cancelled within 24hrs → FORFEITED
            $cancellationType    = 'forfeited';
            $downpaymentStatus   = 'forfeited';
        }

        $booking->update([
            'status'             => 'cancelled',
            'cancelled_at'       => now(),
            'cancellation_type'  => $cancellationType,
            'downpayment_status' => $downpaymentStatus,
        ]);

        return response()->json([
            'message'           => 'Booking cancelled.',
            'cancellation_type' => $cancellationType,
            'downpayment'       => $cancellationType === 'refunded'
                ? 'Your downpayment will be refunded within 3-5 business days.'
                : 'Your downpayment has been forfeited as per our cancellation policy.',
        ]);
    }

    // ── Get downpayment status ────────────────────────────────────────────────
    public function status(Request $request)
    {
        $request->validate([
            'booking_id' => 'required|exists:bookings,id',
        ]);

        $customerId = auth()->id();
        $booking    = Booking::with('service')
            ->where('id', $request->booking_id)
            ->where('customer_id', $customerId)
            ->firstOrFail();

        return response()->json([
            'booking_id'               => $booking->id,
            'booking_ref'              => 'IHS-' . str_pad($booking->id, 5, '0', STR_PAD_LEFT),
            'service'                  => $booking->service->name,
            'total_amount'             => $booking->service->price,
            'downpayment_amount'       => $booking->downpayment_amount,
            'remaining_amount'         => $booking->remaining_amount,
            'downpayment_status'       => $booking->downpayment_status,
            'downpayment_proof'        => $booking->downpayment_proof,
            'downpayment_submitted_at' => $booking->downpayment_submitted_at
                ? Carbon::parse($booking->downpayment_submitted_at)->format('M d, Y g:i A')
                : null,
            'downpayment_verified_at'  => $booking->downpayment_verified_at
                ? Carbon::parse($booking->downpayment_verified_at)->format('M d, Y g:i A')
                : null,
            'session_start'            => Carbon::parse($booking->scheduled_start)->format('l, d F Y g:i A'),
            'hours_until_session'      => now()->diffInHours(Carbon::parse($booking->scheduled_start), false),
            'can_cancel_with_refund'   => now()->diffInHours(Carbon::parse($booking->scheduled_start), false) > 24,
        ]);
    }
}