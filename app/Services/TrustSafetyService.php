<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;
use App\Models\UserViolation;
use Carbon\Carbon;
use Illuminate\Support\Facades\Auth;

class TrustSafetyService
{
    // Auto-escalation threshold
    const STRIKES_BEFORE_TEMP_BLOCK = 3;
    const ESCALATION_WINDOW_MONTHS  = 6;

    /**
     * Issue a Warning (Strike 1 or 2).
     * If 3 warnings within 6 months, suggest temp block to admin.
     */
    public static function issueWarning(
        User    $user,
        string  $reason,
        ?string $description = null,
        ?int    $reportId    = null,
    ): array {
        $strikeNumber = $user->strike_count + 1;

        // Create the violation record
        $violation = UserViolation::create([
            'user_id'       => $user->id,
            'issued_by'     => Auth::id(),
            'level'         => 'warning',
            'reason'        => $reason,
            'description'   => $description,
            'report_id'     => $reportId,
            'strike_number' => $strikeNumber,
            'is_active'     => true,
        ]);

        // Update user strike count + restriction level
        $user->update([
            'strike_count'      => $strikeNumber,
            'restriction_level' => 'warned',
        ]);

        // Notify the customer
        self::notifyUser($user,
            title:   "⚠️ Account Warning — Strike {$strikeNumber}",
            message: "Your account has received a formal warning: {$reason}. Repeated violations may result in account suspension.",
        );

        // Check if auto-escalation threshold reached
        $recentStrikes = UserViolation::where('user_id', $user->id)
            ->where('level', 'warning')
            ->where('created_at', '>=', now()->subMonths(self::ESCALATION_WINDOW_MONTHS))
            ->count();

        $shouldSuggestBlock = $recentStrikes >= self::STRIKES_BEFORE_TEMP_BLOCK;

        // Log to audit trail
        AuditService::log(
            event:      'trust.warning_issued',
            targetType: 'User',
            targetId:   $user->id,
            metadata:   [
                'user_name'    => $user->name,
                'reason'       => $reason,
                'strike_number'=> $strikeNumber,
                'suggest_block'=> $shouldSuggestBlock,
            ],
        );

        return [
            'violation'           => $violation,
            'strike_number'       => $strikeNumber,
            'suggest_temp_block'  => $shouldSuggestBlock,
        ];
    }

    /**
     * Issue a Temporary Block (7 or 30 days).
     * Customer cannot login or make bookings during this period.
     */
    public static function issueTempBlock(
        User    $user,
        int     $durationDays,
        string  $reason,
        ?string $description = null,
        ?int    $reportId    = null,
    ): UserViolation {
        $expiresAt    = now()->addDays($durationDays);
        $strikeNumber = $user->strike_count + 1;

        $violation = UserViolation::create([
            'user_id'       => $user->id,
            'issued_by'     => Auth::id(),
            'level'         => 'temp_block',
            'duration_days' => $durationDays,
            'reason'        => $reason,
            'description'   => $description,
            'report_id'     => $reportId,
            'expires_at'    => $expiresAt,
            'strike_number' => $strikeNumber,
            'is_active'     => true,
        ]);

        $user->update([
            'strike_count'      => $strikeNumber,
            'restriction_level' => 'temp_blocked',
            'restricted_until'  => $expiresAt,
            'is_blocked'        => true,
            'blocked_at'        => now(),
            'block_reason'      => "Temporary block ({$durationDays} days): {$reason}",
        ]);

        self::notifyUser($user,
            title:   "🚫 Account Temporarily Suspended",
            message: "Your account has been temporarily suspended for {$durationDays} days due to: {$reason}. Access will be restored on " . $expiresAt->format('M d, Y') . ".",
        );

        AuditService::log(
            event:      'trust.temp_block_issued',
            targetType: 'User',
            targetId:   $user->id,
            metadata:   [
                'user_name'     => $user->name,
                'reason'        => $reason,
                'duration_days' => $durationDays,
                'expires_at'    => $expiresAt->toDateTimeString(),
            ],
        );

        return $violation;
    }

    /**
     * Issue a Permanent Block.
     * Customer cannot login ever again.
     */
    public static function issuePermanentBlock(
        User    $user,
        string  $reason,
        ?string $description = null,
        ?int    $reportId    = null,
    ): UserViolation {
        $violation = UserViolation::create([
            'user_id'       => $user->id,
            'issued_by'     => Auth::id(),
            'level'         => 'permanent_block',
            'reason'        => $reason,
            'description'   => $description,
            'report_id'     => $reportId,
            'is_active'     => true,
        ]);

        $user->update([
            'restriction_level' => 'permanently_blocked',
            'restricted_until'  => null,
            'is_blocked'        => true,
            'blocked_at'        => now(),
            'block_reason'      => "Permanent block: {$reason}",
        ]);

        self::notifyUser($user,
            title:   "🚫 Account Permanently Suspended",
            message: "Your account has been permanently suspended due to serious violations of our community standards: {$reason}.",
        );

        AuditService::log(
            event:      'trust.permanent_block_issued',
            targetType: 'User',
            targetId:   $user->id,
            metadata:   [
                'user_name' => $user->name,
                'reason'    => $reason,
            ],
        );

        return $violation;
    }

    /**
     * Lift a restriction (manual unblock by admin).
     */
    public static function liftRestriction(User $user, string $note = ''): void
    {
        // Deactivate all active violations
        UserViolation::where('user_id', $user->id)
            ->where('is_active', true)
            ->update(['is_active' => false]);

        $user->update([
            'is_blocked'        => false,
            'blocked_at'        => null,
            'block_reason'      => null,
            'restriction_level' => 'none',
            'restricted_until'  => null,
        ]);

        self::notifyUser($user,
            title:   '✅ Account Restriction Lifted',
            message: 'Your account restriction has been lifted. You may continue using Infinity Home Spa.',
        );

        AuditService::log(
            event:      'trust.restriction_lifted',
            targetType: 'User',
            targetId:   $user->id,
            metadata:   [
                'user_name' => $user->name,
                'note'      => $note,
            ],
        );
    }

    /**
     * Auto-expire temp blocks (run via scheduler or on login check).
     */
    public static function checkAndExpireTempBlocks(): int
    {
        $expired = User::where('restriction_level', 'temp_blocked')
            ->where('restricted_until', '<=', now())
            ->get();

        foreach ($expired as $user) {
            $user->update([
                'is_blocked'        => false,
                'blocked_at'        => null,
                'block_reason'      => null,
                'restriction_level' => 'none',
                'restricted_until'  => null,
            ]);

            UserViolation::where('user_id', $user->id)
                ->where('level', 'temp_block')
                ->where('is_active', true)
                ->update(['is_active' => false]);

            self::notifyUser($user,
                title:   '✅ Suspension Lifted',
                message: 'Your temporary suspension has expired. Your account is now active again.',
            );
        }

        return $expired->count();
    }

    /**
     * Send an in-app notification to the user.
     */
    private static function notifyUser(User $user, string $title, string $message): void
    {
        // Uses the existing notifications table
        \DB::table('notifications')->insert([
            'user_id'    => $user->id,
            'title'      => $title,
            'message'    => $message,
            'read'       => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}