<?php

namespace App\Services;

use App\Models\LoyaltyReward;
use App\Models\LoyaltyVoucher;
use App\Models\User;
use App\Notifications\InAppNotification;
use Illuminate\Support\Str;

class LoyaltyService
{
    /**
     * Get or create the current loyalty record for a customer.
     */
    public static function getOrCreate(int $customerId): LoyaltyReward
    {
        // Find the latest non-redeemed cycle
        $loyalty = LoyaltyReward::where('customer_id', $customerId)
            ->whereIn('status', ['in_progress', 'available', 'voucher_issued'])
            ->latest()
            ->first();

        if ($loyalty) return $loyalty;

        // Find the last cycle number
        $lastCycle = LoyaltyReward::where('customer_id', $customerId)
            ->max('reward_cycle') ?? 0;

        return LoyaltyReward::create([
            'customer_id'     => $customerId,
            'completed_count' => 0,
            'status'          => 'in_progress',
            'reward_cycle'    => $lastCycle + 1,
            'total_completed' => LoyaltyReward::where('customer_id', $customerId)->sum('total_completed'),
        ]);
    }

    /**
     * Called when a booking is marked as completed.
     * Increments the count and marks reward as available at 10.
     */
    public static function recordCompletion(int $customerId): LoyaltyReward
    {
        $loyalty = self::getOrCreate($customerId);

        // Already available — don't double count
        if ($loyalty->isAvailable()) return $loyalty;

        $newCount = $loyalty->completed_count + 1;
        $newTotal = $loyalty->total_completed + 1;

        $isReady  = $newCount >= LoyaltyReward::BOOKINGS_REQUIRED;

        $loyalty->update([
            'completed_count' => $isReady ? LoyaltyReward::BOOKINGS_REQUIRED : $newCount,
            'total_completed' => $newTotal,
            'status'          => $isReady ? 'available' : 'in_progress',
        ]);

        // Notify customer when reward becomes available
        if ($isReady) {
            $user = User::find($customerId);
            $user?->notify(new InAppNotification(
                title:   '🎉 Your Free Session is Ready!',
                message: 'Congratulations! You have completed 10 sessions and earned a complimentary 1-hour spa session. Claim it on your dashboard.',
            ));
        }

        return $loyalty->fresh();
    }

    /**
     * Generate a unique voucher code.
     * Format: IHS-FREE-XXXX (4 random alphanumeric chars)
     */
    private static function generateCode(): string
    {
        do {
            $code = 'IHS-FREE-' . strtoupper(Str::random(4));
        } while (LoyaltyVoucher::where('code', $code)->exists());

        return $code;
    }

    /**
     * Generate a voucher for the customer (called when they click "Claim").
     * Marks the loyalty reward as "voucher_issued" and creates the voucher.
     */
    public static function generateVoucher(int $customerId): array
    {
        $loyalty = LoyaltyReward::where('customer_id', $customerId)
            ->where('status', 'available')
            ->latest()
            ->first();

        if (!$loyalty) {
            return ['success' => false, 'message' => 'No reward available to claim.'];
        }

        // Check if voucher already exists for this reward
        $existing = LoyaltyVoucher::where('loyalty_reward_id', $loyalty->id)
            ->where('status', 'unused')
            ->first();

        if ($existing) {
            return [
                'success' => true,
                'voucher' => self::formatVoucher($existing),
                'message' => 'You already have an active voucher.',
            ];
        }

        $voucher = LoyaltyVoucher::create([
            'customer_id'               => $customerId,
            'loyalty_reward_id'         => $loyalty->id,
            'code'                      => self::generateCode(),
            'status'                    => 'unused',
            'covered_duration_minutes'  => 60,
            'expires_at'                => now()->addDays(30),
        ]);

        // Update loyalty reward status
        $loyalty->update(['status' => 'voucher_issued']);

        // Notify customer
        $user = User::find($customerId);
        $user?->notify(new InAppNotification(
            title:   '🎫 Your Voucher Code is Ready!',
            message: "Your free session voucher code is: {$voucher->code}. Valid for any 60-min service. Expires in 30 days.",
        ));

        return [
            'success' => true,
            'voucher' => self::formatVoucher($voucher),
            'message' => 'Voucher generated successfully!',
        ];
    }

    /**
     * Validate a voucher code during booking.
     * Returns voucher details if valid, error if not.
     */
    public static function validateVoucher(string $code, int $customerId): array
    {
        $voucher = LoyaltyVoucher::where('code', strtoupper(trim($code)))
            ->where('customer_id', $customerId)
            ->first();

        if (!$voucher) {
            return ['valid' => false, 'message' => 'Invalid voucher code.'];
        }

        if ($voucher->status === 'used') {
            return ['valid' => false, 'message' => 'This voucher has already been used.'];
        }

        if ($voucher->status === 'expired' || $voucher->expires_at < now()) {
            $voucher->update(['status' => 'expired']);
            return ['valid' => false, 'message' => 'This voucher has expired.'];
        }

        return [
            'valid'                    => true,
            'voucher'                  => self::formatVoucher($voucher),
            'covered_duration_minutes' => $voucher->covered_duration_minutes,
            'message'                  => "Voucher valid! Free 60-min session applied.",
        ];
    }

    /**
     * Use a voucher — called when booking is confirmed with voucher code.
     * Marks voucher as used and starts a new loyalty cycle.
     */
    public static function useVoucher(string $code, int $customerId, int $bookingId): array
    {
        $voucher = LoyaltyVoucher::where('code', strtoupper(trim($code)))
            ->where('customer_id', $customerId)
            ->where('status', 'unused')
            ->first();

        if (!$voucher || $voucher->expires_at < now()) {
            return ['success' => false, 'message' => 'Invalid or expired voucher.'];
        }

        // Mark voucher as used
        $voucher->update([
            'status'              => 'used',
            'used_at'             => now(),
            'used_in_booking_id'  => $bookingId,
        ]);

        // Find the associated loyalty reward and mark as redeemed
        $loyalty = LoyaltyReward::where('id', $voucher->loyalty_reward_id)->first();
        if ($loyalty) {
            $loyalty->update([
                'status' => 'redeemed',
                'redeemed_at' => now(),
            ]);
        }

        // Start new loyalty cycle
        $lastCycle = LoyaltyReward::where('customer_id', $customerId)->max('reward_cycle') ?? 0;

        LoyaltyReward::create([
            'customer_id'     => $customerId,
            'completed_count' => 0,
            'status'          => 'in_progress',
            'reward_cycle'    => $lastCycle + 1,
            'total_completed' => LoyaltyReward::where('customer_id', $customerId)->sum('total_completed'),
        ]);

        // Notify customer
        $user = User::find($customerId);
        $user?->notify(new InAppNotification(
            title:   '✅ Voucher Applied!',
            message: "Your free session voucher {$code} has been applied. Enjoy your complimentary 60-min session! Your next reward cycle has started.",
        ));

        return ['success' => true, 'message' => 'Voucher applied successfully!'];
    }

    /**
     * Restore a voucher back to 'unused' after its booking was cancelled
     * within the cancellation grace period. Keeps the same code and
     * original expires_at (does not extend it), and does NOT touch the
     * loyalty reward cycle that was already started when the voucher was
     * originally used — only the voucher record itself is restored.
     */
    public static function restoreVoucher(int $bookingId, int $customerId): array
    {
        $voucher = LoyaltyVoucher::where('customer_id', $customerId)
            ->where('used_in_booking_id', $bookingId)
            ->where('status', 'used')
            ->first();

        if (!$voucher) {
            return ['success' => false, 'message' => 'No used voucher found for this booking.'];
        }

        $voucher->update([
            'status'             => 'unused',
            'used_at'            => null,
            'used_in_booking_id' => null,
        ]);

        $user = User::find($customerId);
        $user?->notify(new InAppNotification(
            title:   '🎫 Voucher Restored',
            message: "Your voucher {$voucher->code} has been restored since you cancelled more than 24 hours before your session. You can use it on a future booking.",
        ));

        return [
            'success' => true,
            'voucher' => self::formatVoucher($voucher),
            'message' => 'Voucher restored successfully.',
        ];
    }

    /**
     * Get the active voucher for a customer (if any).
     */
    public static function getActiveVoucher(int $customerId): ?array
    {
        $voucher = LoyaltyVoucher::where('customer_id', $customerId)
            ->where('status', 'unused')
            ->where('expires_at', '>', now())
            ->latest()
            ->first();

        return $voucher ? self::formatVoucher($voucher) : null;
    }

    /**
     * Auto-expire vouchers that have passed their expiry date.
     */
    public static function expireOldVouchers(): int
    {
        return LoyaltyVoucher::where('status', 'unused')
            ->where('expires_at', '<=', now())
            ->update(['status' => 'expired']);
    }

    /**
     * Format voucher data for API/frontend response.
     */
    private static function formatVoucher(LoyaltyVoucher $v): array
    {
        return [
            'id'                       => $v->id,
            'code'                     => $v->code,
            'status'                   => $v->status,
            'covered_duration_minutes' => $v->covered_duration_minutes,
            'expires_at'               => $v->expires_at->format('M d, Y'),
            'days_until_expiry'        => max(0, (int) floor(now()->diffInDays($v->expires_at))),
            'used_at'                  => $v->used_at?->format('M d, Y'),
            'is_valid'                 => $v->status === 'unused' && $v->expires_at > now(),
        ];
    }

    /**
     * Customer redeems the free session (legacy method — kept for compatibility).
     * Marks current cycle as redeemed and starts a new cycle.
     */
    public static function redeem(int $customerId): array
    {
        $loyalty = LoyaltyReward::where('customer_id', $customerId)
            ->where('status', 'available')
            ->latest()
            ->first();

        if (!$loyalty) {
            return ['success' => false, 'message' => 'No reward available to redeem.'];
        }

        // Mark current cycle as redeemed
        $loyalty->update([
            'status'      => 'redeemed',
            'redeemed_at' => now(),
        ]);

        // Start new cycle automatically
        $newCycle = LoyaltyReward::create([
            'customer_id'     => $customerId,
            'completed_count' => 0,
            'status'          => 'in_progress',
            'reward_cycle'    => $loyalty->reward_cycle + 1,
            'total_completed' => $loyalty->total_completed,
        ]);

        // Notify customer
        $user = User::find($customerId);
        $user?->notify(new InAppNotification(
            title:   '✅ Free Session Redeemed!',
            message: 'Your complimentary 1-hour session has been redeemed. Keep booking to earn your next reward!',
        ));

        return [
            'success'    => true,
            'message'    => 'Reward redeemed successfully! Your next cycle has started.',
            'new_cycle'  => $newCycle,
        ];
    }

    /**
     * Get loyalty summary for dashboard display.
     */
    public static function getSummary(int $customerId): array
    {
        $loyalty = self::getOrCreate($customerId);

        $totalRedeemed = LoyaltyReward::where('customer_id', $customerId)
            ->where('status', 'redeemed')
            ->count();

        return [
            'completed_count'    => $loyalty->completed_count,
            'bookings_required'  => LoyaltyReward::BOOKINGS_REQUIRED,
            'bookings_remaining' => $loyalty->bookingsRemaining(),
            'progress_percentage'=> $loyalty->progressPercentage(),
            'status'             => $loyalty->status,
            'reward_cycle'       => $loyalty->reward_cycle,
            'total_completed'    => $loyalty->total_completed,
            'total_redeemed'     => $totalRedeemed,
            'redeemed_at'        => $loyalty->redeemed_at?->format('M d, Y'),
            'is_available'       => $loyalty->isAvailable(),
            'active_voucher'     => self::getActiveVoucher($customerId),
        ];
    }
}