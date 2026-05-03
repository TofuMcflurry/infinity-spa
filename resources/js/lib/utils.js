import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// ── Timezone-safe date helpers (Asia/Dubai = UTC+4) ──────────────────────────
export const DUBAI_TZ = 'Asia/Dubai';

/** Returns "YYYY-MM-DD" in Dubai timezone */
export function getTodayDubai() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DUBAI_TZ }).format(new Date());
}

/** Checks if a booking's scheduled_start falls on today (Dubai TZ) */
export function isToday(dateStr) {
    if (!dateStr) return false;
    const dubaiDate = new Intl.DateTimeFormat('en-CA', { timeZone: DUBAI_TZ }).format(new Date(dateStr));
    return dubaiDate === getTodayDubai();
}

/** Format date: "May 3, 2026" in Dubai TZ */
export function fmtDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
        timeZone: DUBAI_TZ,
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

/** Format time: "10:00 AM" in Dubai TZ */
export function fmtTime(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleTimeString('en-US', {
        timeZone: DUBAI_TZ,
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** Format datetime: "Sat, May 3 · 10:00 AM" in Dubai TZ */
export function fmtDateTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { timeZone: DUBAI_TZ, weekday: 'short', month: 'short', day: 'numeric' }) +
           ' · ' +
           d.toLocaleTimeString('en-US', { timeZone: DUBAI_TZ, hour: '2-digit', minute: '2-digit' });
}

/** Format datetime: "03 May 2026 10:00" in Dubai TZ (for admin) */
export function fmtDateTimeAdmin(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { timeZone: DUBAI_TZ, day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-GB', { timeZone: DUBAI_TZ, hour: '2-digit', minute: '2-digit' });
}