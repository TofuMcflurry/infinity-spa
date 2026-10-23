<?php

namespace App\Services;

use App\Models\User;
use App\Models\UserViolation;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class TrustSafetyService
{
    const STRIKES_BEFORE_TEMP_BLOCK = 3;
    const ESCALATION_WINDOW_MONTHS = 6;

    public static function issueWarning(User $user, string $reason, ?string $description = null, ?int $reportId = null): array
    {
        return DB::transaction(function () use ($user, $reason, $description, $reportId) {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            // A report identifies one incident. Without a report, issuing another
            // warning remains an intentional new strike, as in the existing API.
            $violation = $reportId === null ? null : $locked->violations()
                ->where('level', 'warning')->where('report_id', $reportId)->first();
            $before = self::state($locked);
            $changed = $violation === null;
            if ($changed) {
                $strikeNumber = $locked->strike_count + 1;
                $violation = self::violation($locked, 'warning', $reason, $description, $reportId, ['strike_number' => $strikeNumber]);
                $locked->strike_count = $strikeNumber;
                // A warning must not replace a stored block, even after its
                // deadline. Only the expiry/lift transition may clear it.
                if (in_array($locked->restriction_level, ['none', 'warned'], true)) {
                    $locked->restriction_level = 'warned';
                }
                self::persist($locked);
            }
            $recentStrikes = $locked->violations()->where('level', 'warning')
                ->where('created_at', '>=', now()->subMonths(self::ESCALATION_WINDOW_MONTHS))->count();
            $suggest = $recentStrikes >= self::STRIKES_BEFORE_TEMP_BLOCK;
            if ($changed) {
                self::audit('trust.warning_issued', $locked, $before, [
                    'violation_id' => $violation->id, 'strike_number' => $violation->strike_number, 'suggest_block' => $suggest,
                ]);
                self::notifyAfterCommit($locked, "⚠️ Account Warning — Strike {$violation->strike_number}",
                    "Your account has received a formal warning: {$reason}. Repeated violations may result in account suspension.");
            }

            return ['violation' => $violation, 'strike_number' => $violation->strike_number, 'suggest_temp_block' => $suggest];
        });
    }

    public static function issueTempBlock(User $user, int $durationDays, string $reason, ?string $description = null, ?int $reportId = null): UserViolation
    {
        return DB::transaction(function () use ($user, $durationDays, $reason, $description, $reportId) {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $existing = self::matchingViolation($locked, 'temp_block', $reason, $description, $reportId)
                ->where('duration_days', $durationDays)->where('expires_at', '>', now())->first();
            if ($existing && $locked->is_blocked && $locked->restriction_level === 'temp_blocked'
                && $locked->restricted_until?->equalTo($existing->expires_at)) {
                return $existing;
            }
            $before = self::state($locked);
            $expiresAt = now()->addDays($durationDays);
            $strikeNumber = $locked->strike_count + 1;
            $violation = self::violation($locked, 'temp_block', $reason, $description, $reportId, [
                'duration_days' => $durationDays, 'expires_at' => $expiresAt, 'strike_number' => $strikeNumber,
            ]);
            $locked->strike_count = $strikeNumber;
            $locked->restriction_level = 'temp_blocked';
            $locked->restricted_until = $expiresAt;
            $locked->is_blocked = true;
            $locked->blocked_at = now();
            $locked->block_reason = "Temporary block ({$durationDays} days): {$reason}";
            self::persist($locked);
            self::audit('trust.temp_block_issued', $locked, $before, [
                'violation_id' => $violation->id, 'duration_days' => $durationDays, 'expires_at' => $expiresAt->toDateTimeString(),
            ]);
            self::notifyAfterCommit($locked, '🚫 Account Temporarily Suspended',
                "Your account has been temporarily suspended for {$durationDays} days due to: {$reason}. Access will be restored on ".$expiresAt->format('M d, Y').'.');

            return $violation;
        });
    }

    public static function issuePermanentBlock(User $user, string $reason, ?string $description = null, ?int $reportId = null): UserViolation
    {
        return DB::transaction(function () use ($user, $reason, $description, $reportId) {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $existing = self::matchingViolation($locked, 'permanent_block', $reason, $description, $reportId)->first();
            if ($existing && $locked->is_blocked && $locked->restriction_level === 'permanently_blocked') {
                return $existing;
            }
            $before = self::state($locked);
            $violation = self::violation($locked, 'permanent_block', $reason, $description, $reportId);
            $locked->restriction_level = 'permanently_blocked';
            $locked->restricted_until = null;
            $locked->is_blocked = true;
            $locked->blocked_at = now();
            $locked->block_reason = "Permanent block: {$reason}";
            self::persist($locked);
            self::audit('trust.permanent_block_issued', $locked, $before, ['violation_id' => $violation->id]);
            self::notifyAfterCommit($locked, '🚫 Account Permanently Suspended',
                'Your account has been permanently suspended due to serious violations of our community standards: '.$reason.'.');

            return $violation;
        });
    }

    public static function liftRestriction(User $user, string $note = ''): void
    {
        DB::transaction(function () use ($user) {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $before = self::state($locked);
            $active = $locked->violations()->where('is_active', true)->update(['is_active' => false]);
            self::clearRestriction($locked);
            if (!$locked->isDirty() && !$active) {
                return;
            }
            self::persist($locked);
            self::audit('trust.restriction_lifted', $locked, $before);
            self::notifyAfterCommit($locked, '✅ Account Restriction Lifted',
                'Your account restriction has been lifted. You may continue using Infinity Home Spa.');
        });
    }

    public static function checkAndExpireTempBlocks(): int
    {
        $count = 0;
        $ids = User::where('restriction_level', 'temp_blocked')->where('restricted_until', '<=', now())->orderBy('id')->pluck('id');
        foreach ($ids as $id) {
            $count += DB::transaction(function () use ($id) {
                $locked = User::whereKey($id)->lockForUpdate()->first();
                if (!$locked || $locked->restriction_level !== 'temp_blocked'
                    || !$locked->restricted_until || $locked->restricted_until->isFuture()) {
                    return 0;
                }
                $before = self::state($locked);
                self::clearRestriction($locked);
                self::persist($locked);
                $locked->violations()->where('level', 'temp_block')->where('is_active', true)->update(['is_active' => false]);
                self::audit('trust.restriction_lifted', $locked, $before, ['source' => 'automatic_expiry'], true);
                self::notifyAfterCommit($locked, '✅ Suspension Lifted', 'Your temporary suspension has expired. Your account is now active again.');
                return 1;
            });
        }

        return $count;
    }

    private static function matchingViolation(User $user, string $level, string $reason, ?string $description, ?int $reportId)
    {
        return $user->violations()->where('is_active', true)->where('level', $level)
            ->where('reason', $reason)->where('description', $description)->where('report_id', $reportId);
    }

    private static function violation(User $user, string $level, string $reason, ?string $description, ?int $reportId, array $extra = []): UserViolation
    {
        return UserViolation::create(array_merge([
            'user_id' => $user->id, 'issued_by' => Auth::id(), 'level' => $level,
            'reason' => $reason, 'description' => $description, 'report_id' => $reportId, 'is_active' => true,
        ], $extra));
    }

    private static function persist(User $user): void
    {
        if (!$user->saveOrFail()) {
            throw new \RuntimeException('Account restriction could not be saved.');
        }
    }

    private static function clearRestriction(User $user): void
    {
        $user->is_blocked = false;
        $user->blocked_at = null;
        $user->block_reason = null;
        $user->restriction_level = 'none';
        $user->restricted_until = null;
    }

    private static function state(User $user): array
    {
        return [
            'is_blocked' => (bool) $user->is_blocked, 'restriction_level' => $user->restriction_level,
            'strike_count' => (int) $user->strike_count, 'restricted_until' => $user->restricted_until?->toDateTimeString(),
        ];
    }

    private static function audit(string $event, User $user, array $before, array $extra = [], bool $systemOrigin = false): void
    {
        AuditService::log($event, 'User', $user->id, array_merge([
            'before' => $before, 'after' => self::state($user),
        ], $extra), systemOrigin: $systemOrigin);
    }

    private static function notifyAfterCommit(User $user, string $title, string $message): void
    {
        DB::afterCommit(fn () => $user->notify(new \App\Notifications\InAppNotification(title: $title, message: $message)));
    }
}
