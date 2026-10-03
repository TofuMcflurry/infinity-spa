import AdminLayout from '@/Layouts/AdminLayout';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, X, Loader2, CheckCircle2, XCircle, AlertCircle,
    Eye, Download, RefreshCw, ShieldCheck, Banknote, Clock,
    Calendar, MapPin, User, CreditCard, RotateCcw, Receipt,
    Filter, Timer,
    TrendingUp, Activity, ChevronRight, Archive,
    ChevronLeft, ChevronRight as ChevronRightIcon, Sparkle,
    Gift, Hourglass, Siren, UserX, Ban,
    CalendarClock, ArrowRight, AlertTriangle, Bell,
} from 'lucide-react';
import { computePaymentSummary, formatAed } from '@/lib/paymentSummary';

// ── CSRF + API ────────────────────────────────────────────────────────────────
function getCsrf() {
    const c = document.cookie.split('; ').find(r => r.startsWith('XSRF-TOKEN='));
    return c ? decodeURIComponent(c.split('=')[1]) : '';
}

async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        credentials: 'same-origin',
        headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': getCsrf(),
            ...(options.headers ?? {}),
        },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
    return data;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ITEMS_PER_PAGE = 50;

// Statuses the backend actually allows to be rescheduled
// (BookingRescheduleService::RESCHEDULABLE_STATUSES) — mirrored here only to
// decide whether to show the "Reschedule" action at all. The backend is the
// real authority: it re-checks this itself on every request regardless of
// what this list says.
const RESCHEDULABLE_STATUSES = ['pending', 'accepted'];

// Views
const VIEWS = [
    { key: 'needsAttention',  label: 'Needs Attention', icon: Siren,        color: '#ef4444' },
    // Mirrors the "Reschedule Requests" tab's own placement choice (a
    // top-level view, not the handoff's literal nested SegmentedFilter —
    // see §8.4 and the note on this file's existing deviation).
    { key: 'awaitingCustomer', label: 'Awaiting Customer', icon: Clock, color: '#f59e0b' },
    { key: 'rescheduleRequests', label: 'Reschedule Requests', icon: CalendarClock, color: '#60a5fa' },
    { key: 'all',             label: 'All Bookings',    icon: Archive,      color: '#e2b764' },
    { key: 'refunds',         label: 'Pending Refunds', icon: RotateCcw,    color: '#10b981' },
    { key: 'cancelled',       label: 'Cancelled',       icon: XCircle,      color: '#94a3b8' },
];

// flag_reason → display label + which timestamp anchors the "overdue" clock
const FLAG_REASON_STYLES = {
    stale_accepted: { label: 'Missed Start',   anchor: 'scheduled_start' },
    stale_en_route: { label: 'Stuck En Route', anchor: 'scheduled_start' },
    stale_arrived:  { label: 'Stuck Arrived',  anchor: 'scheduled_end'   },
};

function fmtOverdue(referenceIso) {
    if (!referenceIso) return '—';
    const diffMs = Date.now() - new Date(referenceIso).getTime();
    if (diffMs <= 0) return '—';
    const totalMin = Math.floor(diffMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m overdue` : `${m}m overdue`;
}

// Small warning indicator shown wherever a flagged-but-unresolved booking
// appears outside the dedicated "Needs Attention" tab.
function StaleFlagBadge({ booking }) {
    if (!booking?.is_stale_unresolved) return null;
    return (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-1.5"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444' }}
            title={FLAG_REASON_STYLES[booking.flag_reason]?.label ?? 'Needs attention'}>
            <Siren size={9} /> Needs Attention
        </span>
    );
}

const STATUS_STYLES = {
    pending_payment: { label: 'Awaiting Payment', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)',  border: 'rgba(148,163,184,0.25)' },
    pending:         { label: 'Pending',          color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.25)'  },
    accepted:        { label: 'Accepted',         color: '#10b981', bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.25)'  },
    en_route:        { label: 'En Route',         color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',   border: 'rgba(59,130,246,0.25)'  },
    arrived:         { label: 'Arrived',          color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',   border: 'rgba(139,92,246,0.25)'  },
    completed:       { label: 'Completed',        color: '#e2b764', bg: 'rgba(226,183,100,0.1)',  border: 'rgba(226,183,100,0.25)' },
    cancelled:       { label: 'Cancelled',        color: '#f87171', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.25)' },
    rejected:        { label: 'Rejected',         color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.25)'   },
};

// §8.2 — Reschedule Proposal status -> label/tone (locked), mapped onto
// this file's own existing colour convention (same shape as STATUS_STYLES)
// so it reuses the already-built Badge component rather than a new one.
const PROPOSAL_STATUS_STYLES = {
    pending:   { label: 'Awaiting Customer',     color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)' },
    accepted:  { label: 'Accepted',              color: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)' },
    countered: { label: 'Alternative Requested', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.25)' },
    cancelled: { label: 'Booking Cancelled',     color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)'  },
    // "neutral" — the undyed style §8.2 specifies for Expired: no new colour.
    expired:   { label: 'Expired · No Response', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.25)' },
};

// §8.2 ProposalStatusLabel — mono "RESCHEDULE PROPOSAL" + the StatusTag
// (here, the existing Badge component), gap 8. Mirrors RequestStatusLabel's
// own construction used for RescheduleRequest rows.
function ProposalStatusLabel({ status }) {
    return (
        <div className="flex items-center gap-2">
            <span className="font-mono uppercase text-[10px] font-semibold tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                Reschedule Proposal
            </span>
            <Badge cfg={PROPOSAL_STATUS_STYLES[status] ?? { label: status, color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.25)' }} />
        </div>
    );
}

// §2.22 CountdownTimer (extends WaitingTimer/fmtWaitingSince above — counts
// down instead of up). `warning` under 2h remaining, same threshold rule.
function fmtCountdown(expiresAtIso) {
    if (!expiresAtIso) return null;
    const ms = new Date(expiresAtIso).getTime() - Date.now();
    if (ms <= 0) return { label: 'Expiring…', warn: true };
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return { label: h > 0 ? `${h}h ${m}m` : `${m}m`, warn: ms < 2 * 60 * 60 * 1000 };
}

function CountdownTimer({ expiresAt }) {
    const c = fmtCountdown(expiresAt);
    if (!c) return null;
    return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold"
            style={{ color: c.warn ? '#f59e0b' : 'var(--theme-text-muted)' }}>
            <Clock size={11} /> Expires in {c.label}
        </span>
    );
}

// downpayment_status refund/verification workflow states — kept as-is, this
// map drives the actual verify/refund actions and must reflect the real column.
const DP_STYLES = {
    pending:     { label: 'Pending',      color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)' },
    submitted:   { label: 'Submitted',    color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)' },
    verified:    { label: 'Verified',     color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)' },
    refunded:    { label: 'Refundable',   color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)' },
    forfeited:   { label: 'Forfeited',    color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)' },
    refund_sent: { label: 'Refund Sent',  color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)' },
};

// ── "Pay Status" column (All Bookings table) — computed, Stripe-aware ───────
// Color language: green = paid/complete, amber = pending, red = actual problem.
// statusKey is computed by the shared computePaymentSummary() (payment audit
// findings A1/A2/A5) — 'paid_full' and 'deposit_paid' are distinct so a
// downpayment-type booking's confirmed DEPOSIT is never shown as "Paid via
// Stripe" in a way that overclaims full settlement.
const PAY_STATUS_STYLES = {
    voucher:          { label: 'Free (Voucher)',           color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)',  icon: Gift },
    paid_full:        { label: 'Paid via Stripe',          color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)',  icon: CreditCard },
    deposit_paid:     { label: 'Deposit Paid via Stripe',  color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)',  icon: CreditCard },
    awaiting_payment: { label: 'Awaiting Payment',         color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  icon: Hourglass },
    verified:         { label: 'Verified',                 color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)',  icon: CheckCircle2 },
    submitted:        { label: 'Submitted',                color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  icon: Clock },
    no_proof:         { label: 'No Proof',                  color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',   icon: AlertCircle },
};

function getPayStatus(booking) {
    return computePaymentSummary(booking).statusKey;
}

// created_at_iso is a genuine ISO-8601 instant (with explicit offset) from
// the backend — unlike the human-formatted created_at string, it's safe to
// diff against the browser's own Date.now(), since both sides then refer
// to the same absolute moment regardless of the admin's own timezone.
function fmtWaitingSince(iso) {
    if (!iso) return '—';
    const diffMs = Date.now() - new Date(iso).getTime();
    if (diffMs < 60000) return 'just now';
    const totalMin = Math.floor(diffMs / 60000);
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = totalMin % 60;
    if (d > 0) return `${d}d ${h}h waiting`;
    if (h > 0) return `${h}h ${m}m waiting`;
    return `${m}m waiting`;
}

function getProofUrl(path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${window.location.origin}${path.startsWith('/') ? '' : '/'}${path}`;
}

function Badge({ cfg }) {
    if (!cfg) return null;
    const Icon = cfg.icon;
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
            {Icon ? <Icon size={10} /> : <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.color }} />}
            {cfg.label}
        </span>
    );
}

function StatCard({ label, value, color, icon: Icon, loading, sub }) {
    return (
        <div className="rounded-2xl p-4 flex items-center justify-between"
            style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}>
            <div>
                <p className="text-[10px] uppercase tracking-widest font-bold mb-1"
                    style={{ color: 'var(--theme-text-muted)' }}>{label}</p>
                {loading
                    ? <div className="h-7 w-12 rounded-lg animate-pulse" style={{ background: 'var(--theme-border)' }} />
                    : <p className="text-2xl font-display font-bold leading-none" style={{ color }}>{value ?? '—'}</p>
                }
                {sub && !loading && (
                    <p className="text-[10px] mt-1" style={{ color: 'var(--theme-text-muted)' }}>{sub}</p>
                )}
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${color}15` }}>
                <Icon size={18} style={{ color }} />
            </div>
        </div>
    );
}

// ── Proof Lightbox ────────────────────────────────────────────────────────────
function ProofLightbox({ url, onClose }) {
    return (
        <motion.div className="fixed inset-0 z-[80] flex items-center justify-center p-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}>
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.95)' }} />
            <motion.img src={url} alt="Payment proof"
                className="relative z-10 max-w-full rounded-2xl shadow-2xl object-contain"
                style={{ maxHeight: '90vh', maxWidth: '90vw' }}
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={e => e.stopPropagation()} />
            <button onClick={onClose}
                className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
                <X size={18} />
            </button>
        </motion.div>
    );
}

// ── Reschedule helpers ──────────────────────────────────────────────────────
// Splits a backend-formatted "M d, Y g:i A" string (already rendered
// server-side in Asia/Dubai, e.g. formatBooking()'s scheduled_start_fmt)
// into its date and time portions via plain string matching — never via
// Date parsing, so the browser's own timezone never enters the picture.
function splitScheduleFmt(fmtStr) {
    if (!fmtStr) return { date: '—', time: '—' };
    const m = fmtStr.match(/^(.*?)\s(\d{1,2}:\d{2}\s?[AP]M)$/i);
    if (!m) return { date: fmtStr, time: '' };
    return { date: m[1].trim(), time: m[2] };
}

// Builds a Date purely from explicit numeric components (never from string
// parsing of an ISO timestamp) so the browser's own timezone never enters
// the picture — reading it back later with the same local
// getters/formatters round-trips to exactly what was typed, regardless of
// what timezone the browser happens to be set to. This is only ever used
// to preview the session's end time (start + the service's own unchanging
// duration) — never to decide availability, which stays server-side.
function buildWallClockDate(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [h, mi] = timeStr.split(':').map(Number);
    if (!y || !mo || !d || Number.isNaN(h) || Number.isNaN(mi)) return null;
    return new Date(y, mo - 1, d, h, mi);
}

function fmtWallClockDate(dt) {
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtWallClockTime(dt) {
    return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Zero-padded Y-M-D from LOCAL date parts only (never toISOString, which
// converts through UTC and can silently shift the calendar date) — the
// same wall-clock-safe principle as buildWallClockDate above.
function toDateStr(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The next 7 calendar days starting today, built from explicit local date
// parts (never string-parsed) so there's no timezone ambiguity in which
// dates get offered.
function nextSevenDays() {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
}

// Module-scope (not defined inside ProposeRescheduleModal) so it keeps a
// stable component identity across re-renders — defining it inside the
// modal recreated this as a brand-new function on every keystroke in the
// Reason textarea (each setReason call re-renders the modal), which made
// React remount the <Field> subtree, including the <textarea>, and drop
// focus after every single character.
function Field({ label, children }) {
    return (
        <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--theme-text-muted)' }}>{label}</p>
            {children}
        </div>
    );
}

// ── Admin Propose New Schedule Modal (handoff §8.3) ───────────────────────────
// Superseded-in-place per the handoff's own note on §3.6: this reuses that
// section's exact layout (BookingSummary, DateStrip, TimeSlotGrid,
// ErrorAlert, Textarea) — only the copy and the submit target change. Only
// ever collects the new date/time + an optional note. Everything else —
// therapist, service, duration, travel time, buffer, day-off/shift/
// unavailable-slot checks, and the actual conflict decision — is computed
// and validated server-side by BookingRescheduleService
// (RescheduleProposalService::create() calls validateCandidate() before
// ever writing a proposal row). This UI never re-implements any of that:
// the only thing it computes locally is the new *session end* preview,
// using the booking's own already-known, unchanging duration — purely
// cosmetic, not sent to the backend, not a validation source. On failure
// it surfaces the backend's own message verbatim.
//
// Crucially, this never mutates the booking — it only ever creates a
// pending RescheduleProposal. The booking moves only once the customer
// accepts (or a resulting countered request is approved) — see
// RescheduleProposalService.
function ProposeRescheduleModal({ booking, onClose, onProposed }) {
    // date -> time -> confirm, matching the approved flow. Nothing here
    // decides availability — every date/time choice offered to the admin
    // comes straight from BookingRescheduleService::previewAvailability()
    // via GET .../reschedule-availability (reused unchanged — proposals
    // share the exact same scheduling rules a direct reschedule does), and
    // the only mutation is POST .../reschedule-proposal, which never
    // touches the booking's own schedule.
    const [step, setStep] = useState('date'); // 'date' | 'time' | 'confirm'
    const [dayOffWeekday, setDayOffWeekday] = useState(null);
    const [selectedDate, setSelectedDate] = useState(''); // 'YYYY-MM-DD'
    const [slots, setSlots] = useState([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState(null); // { time: 'HH:mm', label, available }
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const durationMinutes = (booking.scheduled_start && booking.scheduled_end)
        ? Math.round((new Date(booking.scheduled_end) - new Date(booking.scheduled_start)) / 60000)
        : null;

    const currentStart = splitScheduleFmt(booking.scheduled_start_fmt);
    const currentEnd   = splitScheduleFmt(booking.scheduled_end_fmt);

    // Only ever built from a slot the backend itself already marked
    // available — this is a display computation (start + the service's own
    // unchanging duration), never a second availability decision.
    const newStartDt = selectedSlot ? buildWallClockDate(selectedDate, selectedSlot.time) : null;
    const newEndDt = (newStartDt && durationMinutes != null)
        ? new Date(newStartDt.getTime() + durationMinutes * 60000)
        : null;

    const closeUnlessBusy = () => { if (!submitting) onClose(); };

    // Fetched once on open — just the therapist's day-off weekday, to grey
    // it out in the date strip. Still only a read of a stored fact, not a
    // client-side rule; the backend re-confirms it per-date regardless.
    useEffect(() => {
        let cancelled = false;
        apiFetch(`/admin/api/bookings/${booking.id}/reschedule-availability`)
            .then(data => { if (!cancelled) setDayOffWeekday(data.day_off_weekday); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [booking.id]);

    const fetchSlotsFor = async (dateStr) => {
        setLoadingSlots(true);
        setSlots([]);
        setSelectedSlot(null);
        try {
            const data = await apiFetch(`/admin/api/bookings/${booking.id}/reschedule-availability?date=${dateStr}`);
            setSlots(data.is_day_off ? [] : (data.slots ?? []));
        } catch {
            setSlots([]);
        } finally {
            setLoadingSlots(false);
        }
    };

    const handlePickDate = (d) => {
        const dateStr = toDateStr(d);
        setSelectedDate(dateStr);
        setError('');
        setStep('time');
        fetchSlotsFor(dateStr);
    };

    const handleSubmit = async () => {
        if (submitting || !selectedSlot) return; // belt-and-braces against a double click slipping through
        setSubmitting(true);
        setError('');
        try {
            const data = await apiFetch(`/admin/api/bookings/${booking.id}/reschedule-proposal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    proposed_start_at: `${selectedDate} ${selectedSlot.time}:00`,
                    ...(reason.trim() ? { admin_reason: reason.trim() } : {}),
                }),
            });
            onProposed(data.proposal);
        } catch (e) {
            // Show the backend's own message verbatim — it's the precise,
            // authoritative reason (day off, shift, conflict, unavailable
            // slot, non-reschedulable state, an already-active proposal,
            // etc.), never re-derived here. Selections are left exactly as
            // they were so the admin can simply pick a different time or
            // date without starting over.
            setError(e.message || 'Could not send this proposal.');
        } finally {
            setSubmitting(false);
        }
    };

    const inputCls = 'w-full px-3 py-2.5 rounded-xl text-sm outline-none';
    const inputStyle = { background: 'var(--theme-input-bg, #141d33)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' };

    const ErrorBanner = () => error ? (
        <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
        </div>
    ) : null;

    const stepTitle = { date: 'Select New Date', time: 'Select Available Time', confirm: 'Confirm Proposal' }[step];

    const reasonFmt = reason.trim();

    return (
        <motion.div className="fixed inset-0 z-[90] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} onClick={closeUnlessBusy} />
            <motion.div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl"
                style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                onClick={e => e.stopPropagation()}>

                <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                    <div className="flex items-center gap-2">
                        <CalendarClock size={16} style={{ color: '#e2b764' }} />
                        <h3 className="font-bold text-sm" style={{ color: 'var(--theme-text-head)' }}>{stepTitle}</h3>
                    </div>
                    <button onClick={closeUnlessBusy} disabled={submitting}
                        className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-40"
                        style={{ background: 'var(--theme-btn-bg)' }}>
                        <X size={13} style={{ color: 'var(--theme-text-muted)' }} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Current Schedule — always visible, never mutated until the request actually succeeds */}
                    <div className="rounded-xl p-3.5" style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)' }}>
                        <p className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: 'var(--theme-text-muted)' }}>Current Schedule</p>
                        <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                            {currentStart.date} · {currentStart.time} – {currentEnd.time}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                            <span className="flex items-center gap-1"><User size={11} /> {booking.therapist_name ?? '—'}</span>
                            <span className="flex items-center gap-1"><Clock size={11} /> {durationMinutes ? `${durationMinutes} min` : '—'}</span>
                        </div>
                        <p className="text-xs mt-1" style={{ color: 'var(--theme-text-muted)' }}>{booking.service_name}</p>
                    </div>

                    {/* ── Step 1: date ────────────────────────────────────────────────── */}
                    {step === 'date' && (
                        <>
                            <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--theme-text-muted)' }}>New Date</p>
                            <div className="grid grid-cols-4 gap-2">
                                {nextSevenDays().map(d => {
                                    const dateStr  = toDateStr(d);
                                    const weekday  = d.toLocaleDateString('en-US', { weekday: 'long' });
                                    const isDayOff = dayOffWeekday != null && weekday === dayOffWeekday;
                                    return (
                                        <button key={dateStr} disabled={isDayOff} onClick={() => handlePickDate(d)}
                                            className="flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl text-xs font-semibold transition-all disabled:cursor-not-allowed"
                                            style={{
                                                background: isDayOff ? 'rgba(148,163,184,0.05)' : 'var(--theme-btn-bg)',
                                                border: `1px solid ${isDayOff ? 'rgba(148,163,184,0.15)' : 'var(--theme-border)'}`,
                                                color: isDayOff ? 'var(--theme-text-muted)' : 'var(--theme-text-head)',
                                                opacity: isDayOff ? 0.55 : 1,
                                            }}>
                                            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                                                {d.toLocaleDateString('en-US', { weekday: 'short' })}
                                            </span>
                                            <span className="text-base font-bold leading-none">{d.getDate()}</span>
                                            {isDayOff && <span className="text-[8px] font-bold mt-0.5" style={{ color: '#f87171' }}>Day Off</span>}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
                                Greyed days are the therapist's regular day off.
                            </p>
                            <ErrorBanner />
                        </>
                    )}

                    {/* ── Step 2: time ────────────────────────────────────────────────── */}
                    {step === 'time' && (
                        <>
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--theme-text-muted)' }}>
                                    Available Times — {fmtWallClockDate(buildWallClockDate(selectedDate, '00:00'))}
                                </p>
                                <button onClick={() => { setError(''); setStep('date'); }} className="text-[11px] font-semibold" style={{ color: '#e2b764' }}>
                                    Change date
                                </button>
                            </div>

                            {loadingSlots ? (
                                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin" style={{ color: '#e2b764' }} /></div>
                            ) : slots.length === 0 ? (
                                <div className="text-center py-6">
                                    <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>No available times for this date.</p>
                                    <button onClick={() => { setError(''); setStep('date'); }}
                                        className="text-xs font-bold mt-2" style={{ color: '#e2b764' }}>
                                        Choose another date
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-2">
                                    {slots.map(s => {
                                        const isSelected = selectedSlot?.time === s.time;
                                        return (
                                            <button key={s.time} disabled={!s.available} onClick={() => setSelectedSlot(s)}
                                                className="py-2 rounded-lg text-xs font-semibold transition-all disabled:cursor-not-allowed"
                                                style={{
                                                    background: isSelected ? 'rgba(226,183,100,0.18)' : s.available ? 'var(--theme-btn-bg)' : 'rgba(148,163,184,0.05)',
                                                    border: `1px solid ${isSelected ? 'rgba(226,183,100,0.5)' : s.available ? 'var(--theme-border)' : 'rgba(148,163,184,0.15)'}`,
                                                    color: isSelected ? '#e2b764' : s.available ? 'var(--theme-text-2)' : 'var(--theme-text-muted)',
                                                    opacity: s.available ? 1 : 0.45,
                                                }}>
                                                {s.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {selectedSlot && (
                                <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)' }}>
                                    <p className="text-xs flex items-center gap-1.5" style={{ color: '#10b981' }}><CheckCircle2 size={12} /> Therapist available</p>
                                    {durationMinutes != null && (
                                        <p className="text-xs flex items-center gap-1.5" style={{ color: '#10b981' }}><CheckCircle2 size={12} /> {durationMinutes}-minute service</p>
                                    )}
                                    <p className="text-xs flex items-center gap-1.5" style={{ color: '#10b981' }}><CheckCircle2 size={12} /> Travel + buffer accounted for</p>
                                </div>
                            )}

                            <ErrorBanner />

                            <button onClick={() => { setError(''); setStep('confirm'); }} disabled={!selectedSlot}
                                className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
                                style={{ background: 'rgba(226,183,100,0.15)', border: '1px solid rgba(226,183,100,0.35)', color: '#e2b764' }}>
                                Continue to Review
                            </button>
                        </>
                    )}

                    {/* ── Step 3: confirm ─────────────────────────────────────────────── */}
                    {step === 'confirm' && newStartDt && newEndDt && (
                        <>
                            <div className="rounded-xl p-3.5 space-y-3" style={{ background: 'rgba(226,183,100,0.06)', border: '1px solid rgba(226,183,100,0.3)' }}>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--theme-text-muted)' }}>Current</p>
                                    <p className="text-sm" style={{ color: 'var(--theme-text-2)' }}>{currentStart.date} · {currentStart.time} – {currentEnd.time}</p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <ArrowRight size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#e2b764' }} />
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#e2b764' }}>New</p>
                                        <p className="text-sm font-bold" style={{ color: 'var(--theme-text-head)' }}>
                                            {fmtWallClockDate(newStartDt)} · {fmtWallClockTime(newStartDt)} – {fmtWallClockTime(newEndDt)}
                                        </p>
                                    </div>
                                </div>
                                <div className="pt-2 border-t space-y-1" style={{ borderColor: 'var(--theme-border)' }}>
                                    <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                                        <span className="font-semibold" style={{ color: 'var(--theme-text-2)' }}>Therapist:</span> {booking.therapist_name ?? '—'}
                                    </p>
                                    {reasonFmt && (
                                        <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                                            <span className="font-semibold" style={{ color: 'var(--theme-text-2)' }}>Reason:</span> {reasonFmt}
                                        </p>
                                    )}
                                </div>
                                <div className="pt-2 border-t" style={{ borderColor: 'var(--theme-border)' }}>
                                    <p className="text-xs flex items-center gap-1.5 font-semibold" style={{ color: '#10b981' }}>
                                        <CheckCircle2 size={12} /> Available — confirmed by the server
                                    </p>
                                </div>
                            </div>

                            <Field label="Note to customer (optional)">
                                <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}
                                    placeholder="Let the customer know why this new time is being offered..." className={inputCls} style={inputStyle} />
                            </Field>

                            {/* §2.11 InfoNote(bell) — replaces a checkbox, per the
                                handoff's own locked convention. */}
                            <div role="note" className="flex gap-2.5 px-3.5 py-2.5 rounded-xl text-xs"
                                style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                                <Bell size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--theme-text-muted)' }} />
                                <span>The customer will be notified and can accept, suggest another time, or cancel. The booking keeps its current schedule until they respond.</span>
                            </div>

                            <ErrorBanner />

                            <div className="flex gap-2">
                                <button onClick={() => setStep('time')} disabled={submitting}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                                    style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                                    Back
                                </button>
                                <button onClick={handleSubmit} disabled={submitting}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
                                    style={{ background: 'rgba(226,183,100,0.15)', border: '1px solid rgba(226,183,100,0.35)', color: '#e2b764' }}>
                                    {submitting ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />}
                                    {submitting ? 'Sending…' : 'Send Proposal'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ── Admin Reschedule Request Review Modal ─────────────────────────────────────
// Reviews a customer/therapist-submitted reschedule PREFERENCE (RescheduleRequest)
// — distinct from ProposeRescheduleModal above, which the admin uses to offer a
// new time with no prior request. Both end up calling the exact same
// server-side scheduling engine (BookingRescheduleService, via
// previewAvailability for the picker and either approveRescheduleRequest or
// RescheduleProposalService::accept() for the eventual mutation), so this UI
// is intentionally a close mirror of ProposeRescheduleModal rather than a new
// design — the only real differences are the extra "what was requested"
// context panel, the admin-notes-vs-reason field name, and the reject path.
// Also handles a request that exists because a customer countered a
// Reschedule Proposal (handoff §8.8) — same review flow, no second surface.
function RescheduleRequestReviewModal({ request, onClose, onApproved, onRejected }) {
    const booking = request.booking;

    const [step, setStep] = useState('date'); // 'date' | 'time' | 'confirm' | 'reject'
    const [dayOffWeekday, setDayOffWeekday] = useState(null);
    const [selectedDate, setSelectedDate] = useState('');
    const [slots, setSlots] = useState([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [adminNotes, setAdminNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const durationMinutes = (booking.scheduled_start && booking.scheduled_end)
        ? Math.round((new Date(booking.scheduled_end) - new Date(booking.scheduled_start)) / 60000)
        : null;

    const currentStart = splitScheduleFmt(booking.scheduled_start_fmt);
    const currentEnd   = splitScheduleFmt(booking.scheduled_end_fmt);
    const requested    = splitScheduleFmt(request.requested_start_at_fmt);

    // The requested date, as a 'YYYY-MM-DD' string — purely to flag the
    // matching date/slot button below as "Requested", never to pre-select or
    // auto-submit anything. The admin always makes the final, explicit pick.
    const requestedDateStr = request.requested_start_at ? request.requested_start_at.slice(0, 10) : null;
    const requestedTimeStr = request.requested_start_at ? request.requested_start_at.slice(11, 16) : null;

    const newStartDt = selectedSlot ? buildWallClockDate(selectedDate, selectedSlot.time) : null;
    const newEndDt = (newStartDt && durationMinutes != null)
        ? new Date(newStartDt.getTime() + durationMinutes * 60000)
        : null;

    const closeUnlessBusy = () => { if (!submitting) onClose(); };

    useEffect(() => {
        let cancelled = false;
        apiFetch(`/admin/api/bookings/${booking.id}/reschedule-availability`)
            .then(data => { if (!cancelled) setDayOffWeekday(data.day_off_weekday); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [booking.id]);

    const fetchSlotsFor = async (dateStr) => {
        setLoadingSlots(true);
        setSlots([]);
        setSelectedSlot(null);
        try {
            const data = await apiFetch(`/admin/api/bookings/${booking.id}/reschedule-availability?date=${dateStr}`);
            setSlots(data.is_day_off ? [] : (data.slots ?? []));
        } catch {
            setSlots([]);
        } finally {
            setLoadingSlots(false);
        }
    };

    const handlePickDate = (d) => {
        const dateStr = toDateStr(d);
        setSelectedDate(dateStr);
        setError('');
        setStep('time');
        fetchSlotsFor(dateStr);
    };

    const handleApprove = async () => {
        if (submitting || !selectedSlot) return;
        setSubmitting(true);
        setError('');
        try {
            const data = await apiFetch(`/admin/api/bookings/reschedule-requests/${request.id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    final_scheduled_start: `${selectedDate} ${selectedSlot.time}:00`,
                    ...(adminNotes.trim() ? { admin_notes: adminNotes.trim() } : {}),
                }),
            });
            onApproved(data.request);
        } catch (e) {
            // Verbatim backend message — day off, shift, conflict, unavailable
            // slot, stale request/booking state, etc. Selections are left as
            // they were so the admin can just pick a different time.
            setError(e.message || 'Could not approve this reschedule request.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleReject = async () => {
        if (submitting) return;
        setSubmitting(true);
        setError('');
        try {
            const data = await apiFetch(`/admin/api/bookings/reschedule-requests/${request.id}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(adminNotes.trim() ? { admin_notes: adminNotes.trim() } : {}),
            });
            onRejected(data.request);
        } catch (e) {
            setError(e.message || 'Could not reject this reschedule request.');
        } finally {
            setSubmitting(false);
        }
    };

    const inputCls = 'w-full px-3 py-2.5 rounded-xl text-sm outline-none';
    const inputStyle = { background: 'var(--theme-input-bg, #141d33)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' };

    const ErrorBanner = () => error ? (
        <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
        </div>
    ) : null;

    const stepTitle = { date: 'Select Final Date', time: 'Select Final Time', confirm: 'Confirm Approval', reject: 'Reject Request' }[step];

    return (
        <motion.div className="fixed inset-0 z-[90] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} onClick={closeUnlessBusy} />
            <motion.div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl"
                style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                onClick={e => e.stopPropagation()}>

                <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                    <div className="flex items-center gap-2">
                        <CalendarClock size={16} style={{ color: '#60a5fa' }} />
                        <h3 className="font-bold text-sm" style={{ color: 'var(--theme-text-head)' }}>{stepTitle}</h3>
                        {/* §8.8 — MiniTag marking this request as the result of a
                            declined admin proposal. Still reviewed through this
                            exact same flow — no second review surface. */}
                        {request.countered_from_proposal && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                style={{ color: 'var(--theme-text-muted)', border: '1px solid var(--theme-border)' }}>
                                Countered Proposal
                            </span>
                        )}
                    </div>
                    <button onClick={closeUnlessBusy} disabled={submitting}
                        className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-40"
                        style={{ background: 'var(--theme-btn-bg)' }}>
                        <X size={13} style={{ color: 'var(--theme-text-muted)' }} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Requested preference — never mutated, always visible for context */}
                    <div className="rounded-xl p-3.5" style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.25)' }}>
                        <p className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: '#60a5fa' }}>
                            Requested by {request.requested_by_role === 'therapist' ? 'Therapist' : 'Customer'}
                        </p>
                        <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                            {requested.date} · {requested.time}
                        </p>
                        {request.reason && (
                            <p className="text-xs mt-1.5" style={{ color: 'var(--theme-text-muted)' }}>"{request.reason}"</p>
                        )}
                        {request.countered_from_proposal && (
                            <p className="text-xs mt-1.5" style={{ color: 'var(--theme-text-muted)' }}>
                                This request follows a declined proposal of {request.countered_from_proposal.proposed_start_at_fmt}.
                            </p>
                        )}
                    </div>

                    {/* Current Schedule */}
                    <div className="rounded-xl p-3.5" style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)' }}>
                        <p className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: 'var(--theme-text-muted)' }}>Current Schedule</p>
                        <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                            {currentStart.date} · {currentStart.time} – {currentEnd.time}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                            <span className="flex items-center gap-1"><User size={11} /> {booking.therapist_name ?? '—'}</span>
                            <span className="flex items-center gap-1"><Clock size={11} /> {durationMinutes ? `${durationMinutes} min` : '—'}</span>
                        </div>
                        <p className="text-xs mt-1" style={{ color: 'var(--theme-text-muted)' }}>{booking.service_name}</p>
                    </div>

                    {/* ── Step: date ──────────────────────────────────────────────────── */}
                    {step === 'date' && (
                        <>
                            <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--theme-text-muted)' }}>Final Date</p>
                            <div className="grid grid-cols-4 gap-2">
                                {nextSevenDays().map(d => {
                                    const dateStr  = toDateStr(d);
                                    const weekday  = d.toLocaleDateString('en-US', { weekday: 'long' });
                                    const isDayOff = dayOffWeekday != null && weekday === dayOffWeekday;
                                    const isRequested = dateStr === requestedDateStr;
                                    return (
                                        <button key={dateStr} disabled={isDayOff} onClick={() => handlePickDate(d)}
                                            className="flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl text-xs font-semibold transition-all disabled:cursor-not-allowed relative"
                                            style={{
                                                background: isDayOff ? 'rgba(148,163,184,0.05)' : isRequested ? 'rgba(96,165,250,0.1)' : 'var(--theme-btn-bg)',
                                                border: `1px solid ${isDayOff ? 'rgba(148,163,184,0.15)' : isRequested ? 'rgba(96,165,250,0.4)' : 'var(--theme-border)'}`,
                                                color: isDayOff ? 'var(--theme-text-muted)' : 'var(--theme-text-head)',
                                                opacity: isDayOff ? 0.55 : 1,
                                            }}>
                                            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                                                {d.toLocaleDateString('en-US', { weekday: 'short' })}
                                            </span>
                                            <span className="text-base font-bold leading-none">{d.getDate()}</span>
                                            {isDayOff && <span className="text-[8px] font-bold mt-0.5" style={{ color: '#f87171' }}>Day Off</span>}
                                            {!isDayOff && isRequested && <span className="text-[8px] font-bold mt-0.5" style={{ color: '#60a5fa' }}>Requested</span>}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
                                Greyed days are the therapist's regular day off.
                            </p>
                            <ErrorBanner />
                        </>
                    )}

                    {/* ── Step: time ──────────────────────────────────────────────────── */}
                    {step === 'time' && (
                        <>
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--theme-text-muted)' }}>
                                    Available Times — {fmtWallClockDate(buildWallClockDate(selectedDate, '00:00'))}
                                </p>
                                <button onClick={() => { setError(''); setStep('date'); }} className="text-[11px] font-semibold" style={{ color: '#e2b764' }}>
                                    Change date
                                </button>
                            </div>

                            {loadingSlots ? (
                                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin" style={{ color: '#e2b764' }} /></div>
                            ) : slots.length === 0 ? (
                                <div className="text-center py-6">
                                    <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>No available times for this date.</p>
                                    <button onClick={() => { setError(''); setStep('date'); }}
                                        className="text-xs font-bold mt-2" style={{ color: '#e2b764' }}>
                                        Choose another date
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-2">
                                    {slots.map(s => {
                                        const isSelected = selectedSlot?.time === s.time;
                                        const isRequested = selectedDate === requestedDateStr && s.time === requestedTimeStr;
                                        return (
                                            <button key={s.time} disabled={!s.available} onClick={() => setSelectedSlot(s)}
                                                className="py-2 rounded-lg text-xs font-semibold transition-all disabled:cursor-not-allowed relative"
                                                style={{
                                                    background: isSelected ? 'rgba(226,183,100,0.18)' : s.available ? 'var(--theme-btn-bg)' : 'rgba(148,163,184,0.05)',
                                                    border: `1px solid ${isSelected ? 'rgba(226,183,100,0.5)' : isRequested && s.available ? 'rgba(96,165,250,0.5)' : s.available ? 'var(--theme-border)' : 'rgba(148,163,184,0.15)'}`,
                                                    color: isSelected ? '#e2b764' : s.available ? 'var(--theme-text-2)' : 'var(--theme-text-muted)',
                                                    opacity: s.available ? 1 : 0.45,
                                                }}>
                                                {s.label}
                                                {isRequested && s.available && !isSelected && (
                                                    <span className="block text-[8px] font-bold mt-0.5" style={{ color: '#60a5fa' }}>Requested</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {selectedSlot && (
                                <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)' }}>
                                    <p className="text-xs flex items-center gap-1.5" style={{ color: '#10b981' }}><CheckCircle2 size={12} /> Therapist available</p>
                                    {durationMinutes != null && (
                                        <p className="text-xs flex items-center gap-1.5" style={{ color: '#10b981' }}><CheckCircle2 size={12} /> {durationMinutes}-minute service</p>
                                    )}
                                    <p className="text-xs flex items-center gap-1.5" style={{ color: '#10b981' }}><CheckCircle2 size={12} /> Travel + buffer accounted for</p>
                                </div>
                            )}

                            <ErrorBanner />

                            <button onClick={() => { setError(''); setStep('confirm'); }} disabled={!selectedSlot}
                                className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
                                style={{ background: 'rgba(226,183,100,0.15)', border: '1px solid rgba(226,183,100,0.35)', color: '#e2b764' }}>
                                Continue to Review
                            </button>
                        </>
                    )}

                    {/* ── Step: confirm ───────────────────────────────────────────────── */}
                    {step === 'confirm' && newStartDt && newEndDt && (
                        <>
                            <div className="rounded-xl p-3.5 space-y-3" style={{ background: 'rgba(226,183,100,0.06)', border: '1px solid rgba(226,183,100,0.3)' }}>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--theme-text-muted)' }}>Current</p>
                                    <p className="text-sm" style={{ color: 'var(--theme-text-2)' }}>{currentStart.date} · {currentStart.time} – {currentEnd.time}</p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <ArrowRight size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#e2b764' }} />
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#e2b764' }}>Final</p>
                                        <p className="text-sm font-bold" style={{ color: 'var(--theme-text-head)' }}>
                                            {fmtWallClockDate(newStartDt)} · {fmtWallClockTime(newStartDt)} – {fmtWallClockTime(newEndDt)}
                                        </p>
                                    </div>
                                </div>
                                <div className="pt-2 border-t" style={{ borderColor: 'var(--theme-border)' }}>
                                    <p className="text-xs flex items-center gap-1.5 font-semibold" style={{ color: '#10b981' }}>
                                        <CheckCircle2 size={12} /> Available — confirmed by the server
                                    </p>
                                </div>
                            </div>

                            <Field label="Admin Notes (optional)">
                                <textarea rows={2} value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                                    placeholder="Notes visible to the customer and therapist..." className={inputCls} style={inputStyle} />
                            </Field>

                            <ErrorBanner />

                            <div className="flex gap-2">
                                <button onClick={() => setStep('time')} disabled={submitting}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                                    style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                                    Back
                                </button>
                                <button onClick={handleApprove} disabled={submitting}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
                                    style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#10b981' }}>
                                    {submitting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                                    Approve & Reschedule
                                </button>
                            </div>
                        </>
                    )}

                    {/* ── Step: reject ─────────────────────────────────────────────────── */}
                    {step === 'reject' && (
                        <>
                            <Field label="Reason for rejection (optional)">
                                <textarea rows={3} value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                                    placeholder="e.g. Requested time conflicts with therapist availability." className={inputCls} style={inputStyle} />
                            </Field>

                            <ErrorBanner />

                            <div className="flex gap-2">
                                <button onClick={() => { setError(''); setStep('date'); }} disabled={submitting}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                                    style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                                    Back
                                </button>
                                <button onClick={handleReject} disabled={submitting}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
                                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                                    {submitting ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                                    Confirm Reject
                                </button>
                            </div>
                        </>
                    )}

                    {/* Reject escape hatch — available from any review step */}
                    {step !== 'reject' && (
                        <button onClick={() => { setError(''); setAdminNotes(''); setStep('reject'); }} disabled={submitting}
                            className="w-full text-center text-xs font-semibold py-1 disabled:opacity-40"
                            style={{ color: '#ef4444' }}>
                            Reject this request instead
                        </button>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ── Booking Detail Drawer ─────────────────────────────────────────────────────
function BookingDrawer({ booking, onClose, onRefundSent, refunding, onProposed, pendingProposal }) {
    const [imgZoom, setImgZoom] = useState(false);
    const [refInput, setRefInput] = useState('');
    const [showRefund, setShowRefund] = useState(false);
    const [showReschedule, setShowReschedule] = useState(false);

    const proofUrl = getProofUrl(booking.downpayment_proof);
    const stStyle = STATUS_STYLES[booking.status] ?? STATUS_STYLES.pending;

    const Row = ({ icon: Icon, label, value, accent }) => (
        <div className="flex items-start gap-3 py-3 border-b last:border-0"
            style={{ borderColor: 'var(--theme-border)' }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: accent ? `${accent}15` : 'var(--theme-btn-bg)' }}>
                <Icon size={12} style={{ color: accent ?? 'var(--theme-text-muted)' }} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider font-semibold mb-0.5"
                    style={{ color: 'var(--theme-text-muted)' }}>{label}</p>
                <p className="text-sm font-medium break-words" style={{ color: 'var(--theme-text-head)' }}>{value ?? '—'}</p>
            </div>
        </div>
    );

    const Section = ({ title, children }) => (
        <div className="mb-5">
            <p className="text-[10px] uppercase tracking-widest font-bold mb-2 px-1"
                style={{ color: '#e2b764' }}>{title}</p>
            <div className="rounded-xl overflow-hidden px-3"
                style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)' }}>
                {children}
            </div>
        </div>
    );

    return (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="absolute inset-0"
                style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
                onClick={onClose} />
            <motion.div className="relative h-full w-full max-w-lg flex flex-col"
                style={{ background: 'var(--theme-card)', borderLeft: '1px solid var(--theme-border)' }}
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
                <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
                    style={{ borderColor: 'var(--theme-border)', background: 'linear-gradient(135deg, var(--theme-card) 0%, var(--theme-bg) 100%)' }}>
                    <div>
                        <p className="text-[11px] font-mono font-bold" style={{ color: '#e2b764' }}>{booking.ref}</p>
                        <h2 className="font-bold text-lg leading-tight mt-0.5"
                            style={{ color: 'var(--theme-text-head)' }}>{booking.service_name}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge cfg={stStyle} />
                        <StaleFlagBadge booking={booking} />
                        <button onClick={onClose}
                            className="w-8 h-8 rounded-xl flex items-center justify-center"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                            <X size={15} style={{ color: 'var(--theme-text-muted)' }} />
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {booking.cancellation_type === 'refunded' && booking.downpayment_status === 'refunded' && (
                        <div className="mb-5 p-4 rounded-xl"
                            style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)' }}>
                            <div className="flex items-center gap-2 mb-3">
                                <RotateCcw size={14} style={{ color: '#3b82f6' }} />
                                <p className="text-sm font-semibold" style={{ color: '#3b82f6' }}>Refund eligible — AED {Number(booking.downpayment_amount).toFixed(2)}</p>
                            </div>
                            {!showRefund ? (
                                <button onClick={() => setShowRefund(true)}
                                    className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                                    style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6' }}>
                                    <Banknote size={14} /> Mark Refund Sent
                                </button>
                            ) : (
                                <div className="space-y-2">
                                    <input value={refInput} onChange={e => setRefInput(e.target.value)}
                                        placeholder="Bank reference / transaction ID..."
                                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                                        style={{ background: 'var(--theme-input-bg, #141d33)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }} />
                                    <div className="flex gap-2">
                                        <button onClick={() => { setShowRefund(false); setRefInput(''); }}
                                            className="flex-1 py-2 rounded-xl text-xs font-medium"
                                            style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)', border: '1px solid var(--theme-border)' }}>Cancel</button>
                                        <button onClick={() => { onRefundSent(booking.id, refInput); setShowRefund(false); setRefInput(''); }}
                                            disabled={!refInput.trim() || refunding}
                                            className="flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                                            style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
                                            {refunding ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                            Confirm Sent
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {booking.downpayment_status === 'refund_sent' && (
                        <div className="mb-5 p-4 rounded-xl flex items-start gap-3"
                            style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)' }}>
                            <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#10b981' }} />
                            <div><p className="text-sm font-semibold" style={{ color: '#10b981' }}>Refund sent ✅</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>Ref: {booking.refund_reference} · {booking.refund_sent_at}</p></div>
                        </div>
                    )}
                    <Section title="Customer">
                        <Row icon={User} label="Name" value={booking.customer_name} accent="#e2b764" />
                        <Row icon={Receipt} label="Email" value={booking.customer_email} accent="#8b5cf6" />
                    </Section>
                    <Section title="Booking Details">
                        <Row icon={Calendar} label="Scheduled" value={booking.scheduled_start_fmt} accent="#3b82f6" />
                        <Row icon={MapPin} label="Location" value={booking.location} accent="#10b981" />
                        <Row icon={User} label="Therapist" value={booking.therapist_name} accent="#f59e0b" />
                        <Row icon={CreditCard} label="Payment Method" value={booking.payment_method} accent="#8b5cf6" />
                    </Section>
                    {/* §8.3/§8.7 — admin-initiated reschedule is now always a
                        PROPOSAL, never an immediate mutation (superseded
                        §3.6). While one is already pending, no second
                        proposal (and no direct reschedule) is offered —
                        this read-only state is the only thing shown
                        instead, per §8.4 and requirement #7/#2. */}
                    {pendingProposal ? (
                        <div className="mb-5 p-4 rounded-xl space-y-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
                            <ProposalStatusLabel status="pending" />
                            <p className="text-xs" style={{ color: 'var(--theme-text-2)' }}>
                                Proposed <span className="font-mono font-semibold">{pendingProposal.proposed_start_at_fmt}</span> — awaiting the customer's response.
                            </p>
                            <CountdownTimer expiresAt={pendingProposal.expires_at} />
                        </div>
                    ) : RESCHEDULABLE_STATUSES.includes(booking.status) && (
                        <button onClick={() => setShowReschedule(true)}
                            className="w-full mb-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                            style={{ background: 'rgba(226,183,100,0.1)', border: '1px solid rgba(226,183,100,0.3)', color: '#e2b764' }}>
                            <CalendarClock size={14} /> Propose New Schedule
                        </button>
                    )}
                    <Section title="Payment">
                        <Row icon={Banknote} label="Service Price" value={`AED ${Number(booking.service_price).toFixed(2)}`} accent="#e2b764" />
                        {booking.is_voucher_covered ? (
                            <Row icon={Gift} label="Payment" value={`Redeemed via Voucher${booking.voucher_code ? ` (${booking.voucher_code})` : ''}`} accent="#10b981" />
                        ) : booking.payment_type === 'full' ? (
                            // Audit A1: previously read downpayment_amount — a
                            // legacy field never resynced once payment_type
                            // changed — instead of the actually-confirmed
                            // paid_amount. Also now correctly distinguishes
                            // "not yet paid" from "paid," which the old
                            // unconditional "Fully Paid" text could not.
                            (() => {
                                const pay = computePaymentSummary(booking);
                                return (
                                    <>
                                        <Row icon={Banknote} label="Total Paid" value={pay.totalPaid != null ? formatAed(pay.totalPaid) : 'Not yet paid'} accent={pay.isPaid ? '#10b981' : '#f59e0b'} />
                                        <Row icon={Banknote} label="Remaining" value={pay.isPaid ? 'AED 0.00 — Fully Paid' : formatAed(pay.remaining)} accent={pay.isPaid ? '#10b981' : '#f59e0b'} />
                                    </>
                                );
                            })()
                        ) : (
                            <>
                                <Row icon={Banknote} label="Downpayment (20%)" value={`AED ${Number(booking.downpayment_amount).toFixed(2)}`} accent="#f59e0b" />
                                <Row icon={Banknote} label="Remaining (80%)" value={`AED ${Number(booking.remaining_amount).toFixed(2)}`} accent="#94a3b8" />
                            </>
                        )}
                        <div className="flex items-center justify-between py-3">
                            <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--theme-text-muted)' }}>Payment Status</p>
                            <Badge cfg={PAY_STATUS_STYLES[getPayStatus(booking)]} />
                        </div>
                        {booking.downpayment_submitted_at && <Row icon={Clock} label="Submitted At" value={booking.downpayment_submitted_at} />}
                        {booking.downpayment_verified_at && <Row icon={Clock} label="Verified At" value={booking.downpayment_verified_at} accent="#10b981" />}
                    </Section>
                    {booking.downpayment_proof && (
                        <div className="mb-5">
                            <p className="text-[10px] uppercase tracking-widest font-bold mb-2 px-1" style={{ color: '#e2b764' }}>Proof of Payment</p>
                            <div className="rounded-xl overflow-hidden relative group cursor-pointer" style={{ border: '1px solid var(--theme-border)' }} onClick={() => setImgZoom(true)}>
                                <img src={proofUrl} alt="Payment proof" className="w-full max-h-48 object-cover transition-transform group-hover:scale-105" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.5)' }}>
                                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: 'rgba(226,183,100,0.9)' }}>
                                        <Eye size={14} style={{ color: '#0b1120' }} />
                                        <span className="text-xs font-bold" style={{ color: '#0b1120' }}>View Full</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end mt-2">
                                <a href={proofUrl} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1 font-medium" style={{ color: '#e2b764' }}>
                                    <Download size={11} /> Open in new tab
                                </a>
                            </div>
                        </div>
                    )}
                    {booking.cancellation_type && (
                        <div className="mb-5 p-4 rounded-xl space-y-1.5" style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)' }}>
                            <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#64748b' }}>Cancellation</p>
                            <p className="text-xs font-semibold" style={{ color: '#f87171' }}>
                                {booking.cancellation_type === 'refunded' && '✅ Eligible for refund — cancelled before 24hrs'}
                                {booking.cancellation_type === 'forfeited' && '❌ Forfeited — cancelled within 24hrs'}
                                {booking.cancellation_type === 'no_show' && '❌ Forfeited — no show'}
                                {booking.cancellation_type === 'expired' && '⏱️ Expired — no therapist response before appointment time'}
                            </p>
                            {booking.cancellation_reason && <p className="text-xs" style={{ color: '#94a3b8' }}>Reason: {booking.cancellation_reason}</p>}
                        </div>
                    )}
                </div>
            </motion.div>
            <AnimatePresence>{imgZoom && <ProofLightbox url={proofUrl} onClose={() => setImgZoom(false)} />}</AnimatePresence>
            <AnimatePresence>
                {showReschedule && (
                    <ProposeRescheduleModal
                        booking={booking}
                        onClose={() => setShowReschedule(false)}
                        onProposed={(proposal) => { onProposed(booking.id, proposal); setShowReschedule(false); }}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function Toast({ toast }) {
    return (
        <motion.div initial={{ opacity: 0, y: 24, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 z-[90] px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-sm font-semibold"
            style={{ transform: 'translateX(-50%)', background: toast.type === 'error' ? '#7f1d1d' : 'var(--theme-card)', border: `1px solid ${toast.type === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(226,183,100,0.3)'}`, color: toast.type === 'error' ? '#fca5a5' : '#e2b764' }}>
            {toast.type === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
            {toast.message}
        </motion.div>
    );
}

// ── Needs Attention Queue (stale active-session review) ─────────────────────
function NeedsAttentionQueue({ bookings, onComplete, onNoShow, onCancel, resolvingId, onView }) {
    const [cancelOpenFor, setCancelOpenFor] = useState(null);
    const [cancelReason, setCancelReason] = useState('');

    if (!bookings.length) return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <CheckCircle2 size={22} style={{ color: '#10b981' }} />
            </div>
            <div className="text-center"><p className="font-semibold mb-1" style={{ color: 'var(--theme-text-head)' }}>Nothing needs attention</p>
            <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>No active sessions are stuck past their expected window.</p></div>
        </div>
    );

    return (
        <div>
            <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: 'var(--theme-border)', background: 'rgba(239,68,68,0.03)' }}>
                <Siren size={12} style={{ color: '#ef4444' }} />
                <span className="text-xs" style={{ color: '#ef4444' }}>Stuck in an active session status well past the expected window. Review and resolve each.</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
                {bookings.map(b => {
                    const isResolving = resolvingId === b.id;
                    const reasonMeta = FLAG_REASON_STYLES[b.flag_reason] ?? { label: b.flag_reason, anchor: 'scheduled_end' };
                    const overdueRef = b[reasonMeta.anchor];
                    const cancelOpen = cancelOpenFor === b.id;

                    return (
                        <div key={b.id} className="px-5 py-4" style={{ background: 'rgba(239,68,68,0.02)' }}>
                            <div className="flex flex-wrap items-center gap-3 justify-between">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-xs font-bold" style={{ color: '#e2b764' }}>{b.ref}</span>
                                        <Badge cfg={STATUS_STYLES[b.status]} />
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                                            {reasonMeta.label}
                                        </span>
                                    </div>
                                    <p className="text-sm font-semibold mt-1" style={{ color: 'var(--theme-text-head)' }}>{b.customer_name} · {b.therapist_name}</p>
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{b.service_name} · Scheduled end {b.scheduled_end_fmt ?? '—'}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-bold" style={{ color: '#ef4444' }}>{fmtOverdue(overdueRef)}</p>
                                    <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>flagged {b.flagged_at_fmt}</p>
                                </div>
                            </div>

                            {!cancelOpen ? (
                                <div className="flex flex-wrap gap-2 mt-3">
                                    <button onClick={() => onComplete(b.id)} disabled={isResolving}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 transition-all"
                                        style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                                        {isResolving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Mark Completed
                                    </button>
                                    <button onClick={() => onNoShow(b.id)} disabled={isResolving}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 transition-all"
                                        style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                                        {isResolving ? <Loader2 size={11} className="animate-spin" /> : <UserX size={11} />} Mark No-show
                                    </button>
                                    <button onClick={() => { setCancelOpenFor(b.id); setCancelReason(''); }} disabled={isResolving}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 transition-all"
                                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                                        <Ban size={11} /> Cancel
                                    </button>
                                    <button onClick={() => onView(b)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ml-auto"
                                        style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-muted)', border: '1px solid var(--theme-border)' }}>
                                        <Eye size={11} /> View
                                    </button>
                                </div>
                            ) : (
                                <div className="mt-3 space-y-2">
                                    <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                                        placeholder="Reason for cancelling..." rows={2}
                                        className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                                        style={{ background: 'var(--theme-input-bg, #141d33)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }} />
                                    <div className="flex gap-2">
                                        <button onClick={() => { setCancelOpenFor(null); setCancelReason(''); }}
                                            className="px-3 py-2 rounded-xl text-xs font-medium"
                                            style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)', border: '1px solid var(--theme-border)' }}>
                                            Back
                                        </button>
                                        <button onClick={() => { onCancel(b.id, cancelReason); setCancelOpenFor(null); }}
                                            disabled={!cancelReason.trim() || isResolving}
                                            className="flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                                            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                                            {isResolving ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                                            Confirm Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Reschedule Requests Queue ──────────────────────────────────────────────────
// Customer/therapist-submitted reschedule PREFERENCES awaiting admin review —
// see RescheduleRequestReviewModal above for the actual approve/reject flow.
// This list is read-only: every mutation happens inside that modal.
function RescheduleRequestsQueue({ requests, onReview, onView }) {
    if (!requests.length) return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.15)' }}>
                <CheckCircle2 size={22} style={{ color: '#60a5fa' }} />
            </div>
            <div className="text-center">
                <p className="font-semibold mb-1" style={{ color: 'var(--theme-text-head)' }}>No reschedule requests pending</p>
                <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>Customer and therapist reschedule preferences will appear here.</p>
            </div>
        </div>
    );

    return (
        <div>
            <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: 'var(--theme-border)', background: 'rgba(96,165,250,0.03)' }}>
                <CalendarClock size={12} style={{ color: '#60a5fa' }} />
                <span className="text-xs" style={{ color: '#60a5fa' }}>A requested time is only a preference — review it against the real schedule and pick the final time.</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
                {requests.map(r => {
                    const b = r.booking;
                    return (
                        <div key={r.id} className="px-5 py-4">
                            <div className="flex flex-wrap items-center gap-3 justify-between">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-xs font-bold" style={{ color: '#e2b764' }}>{b?.ref}</span>
                                        <Badge cfg={STATUS_STYLES[b?.status]} />
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full capitalize"
                                            style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}>
                                            {r.requested_by_role} request
                                        </span>
                                        {/* §8.8 — MiniTag: this request exists because the
                                            customer countered an admin proposal instead of
                                            accepting it. Reuses this exact review flow — no
                                            second review surface. */}
                                        {r.countered_from_proposal && (
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                                style={{ color: 'var(--theme-text-muted)', border: '1px solid var(--theme-border)' }}>
                                                Countered Proposal
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm font-semibold mt-1" style={{ color: 'var(--theme-text-head)' }}>{b?.customer_name} · {b?.therapist_name}</p>
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                        {b?.service_name} · Currently {b?.scheduled_start_fmt ?? '—'}
                                    </p>
                                    {r.reason && (
                                        <p className="text-xs mt-1 italic" style={{ color: 'var(--theme-text-muted)' }}>"{r.reason}"</p>
                                    )}
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#60a5fa' }}>Requested</p>
                                    <p className="text-sm font-bold" style={{ color: 'var(--theme-text-head)' }}>{r.requested_start_at_fmt}</p>
                                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>submitted {r.created_at_fmt}</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 mt-3">
                                <button onClick={() => onReview(r)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                                    style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                                    <CalendarClock size={11} /> Review Request
                                </button>
                                <button onClick={() => onView(b)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ml-auto"
                                    style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-muted)', border: '1px solid var(--theme-border)' }}>
                                    <Eye size={11} /> View Booking
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Awaiting Customer Queue (admin → customer proposals, handoff §8.4) ──────
// Read-only — every mutation happens on the CUSTOMER's side
// (RescheduleProposalController::accept/counter/cancel); there is
// deliberately no admin "withdraw" action here (handoff: "[Not on boards]").
function AwaitingCustomerQueue({ proposals, onView }) {
    if (!proposals.length) return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)' }}>
                <Clock size={22} style={{ color: '#f59e0b' }} />
            </div>
            <div className="text-center">
                <p className="font-semibold mb-1" style={{ color: 'var(--theme-text-head)' }}>No proposals awaiting a customer response</p>
                <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>Schedules you propose to customers will appear here until they respond.</p>
            </div>
        </div>
    );

    return (
        <div>
            <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: 'var(--theme-border)', background: 'rgba(245,158,11,0.03)' }}>
                <Clock size={12} style={{ color: '#f59e0b' }} />
                <span className="text-xs" style={{ color: '#f59e0b' }}>
                    {proposals.length} proposal{proposals.length === 1 ? ' is' : 's are'} awaiting a customer response. Bookings keep their current schedule until the customer responds.
                </span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
                {proposals.map(p => {
                    const b = p.booking;
                    return (
                        <div key={p.id} className="px-5 py-4">
                            <div className="flex flex-wrap items-center gap-3 justify-between">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-xs font-bold" style={{ color: '#e2b764' }}>{b?.ref}</span>
                                        <Badge cfg={STATUS_STYLES[b?.status]} />
                                    </div>
                                    <p className="text-sm font-semibold mt-1" style={{ color: 'var(--theme-text-head)' }}>{b?.customer_name} · {b?.therapist_name}</p>
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                        {b?.service_name} · Current <span className="font-mono">{b?.scheduled_start_fmt ?? '—'}</span>
                                    </p>
                                    {p.admin_reason ? (
                                        <p className="text-xs mt-1 italic" style={{ color: 'var(--theme-text-muted)' }}>"{p.admin_reason}"</p>
                                    ) : (
                                        <p className="text-xs mt-1" style={{ color: 'var(--theme-text-muted)' }}>No note</p>
                                    )}
                                </div>
                                <div className="text-right flex-shrink-0 space-y-1">
                                    <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#e2b764' }}>Proposed</p>
                                    <p className="text-sm font-bold font-mono" style={{ color: 'var(--theme-text-head)' }}>{p.proposed_start_at_fmt}</p>
                                    <ProposalStatusLabel status={p.status} />
                                    <div className="flex justify-end"><CountdownTimer expiresAt={p.expires_at} /></div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 mt-3">
                                <button onClick={() => onView(p)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ml-auto"
                                    style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-muted)', border: '1px solid var(--theme-border)' }}>
                                    <Eye size={11} /> View
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t text-[11px]" style={{ borderColor: 'var(--theme-border)' }}>
                <span style={{ color: 'var(--theme-text-muted)' }}>Accepted, countered, cancelled and expired proposals stay in each booking's history</span>
            </div>
        </div>
    );
}

// Read-only "drawer" variant for a pending proposal (handoff §8.4) — no
// Approve/Reject here, because there's nothing for the admin to decide:
// the customer hasn't responded yet. Resolved proposals (accepted/
// countered/cancelled/expired) reuse the same shell, just without the
// waiting-specific footer note.
function ViewProposalModal({ proposal, onClose }) {
    const b = proposal.booking;
    const isPending = proposal.status === 'pending';

    return (
        <motion.div className="fixed inset-0 z-[90] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
            <motion.div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl"
                style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                onClick={e => e.stopPropagation()}>

                <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold" style={{ color: '#e2b764' }}>{b?.ref}</span>
                            <ProposalStatusLabel status={proposal.status} />
                        </div>
                        <h3 className="font-bold text-sm" style={{ color: 'var(--theme-text-head)' }}>Reschedule Proposal</h3>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--theme-btn-bg)' }}>
                        <X size={13} style={{ color: 'var(--theme-text-muted)' }} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="rounded-xl p-3.5" style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)' }}>
                        <p className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: 'var(--theme-text-muted)' }}>Current Schedule</p>
                        <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>{b?.scheduled_start_fmt} – {splitScheduleFmt(b?.scheduled_end_fmt).time}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                            <span className="flex items-center gap-1"><User size={11} /> {b?.therapist_name ?? '—'}</span>
                            <span className="flex items-center gap-1"><Calendar size={11} /> {b?.service_name}</span>
                        </div>
                    </div>

                    <div className="rounded-xl p-3.5" style={{ background: 'rgba(226,183,100,0.06)', border: '1px solid rgba(226,183,100,0.3)' }}>
                        <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: '#e2b764' }}>Proposed</p>
                        <p className="text-sm font-bold font-mono" style={{ color: 'var(--theme-text-head)' }}>{proposal.proposed_start_at_fmt}</p>
                        {proposal.admin_reason && (
                            <p className="text-xs mt-2 italic" style={{ color: 'var(--theme-text-muted)' }}>"{proposal.admin_reason}"</p>
                        )}
                    </div>

                    {proposal.customer_response_note && (
                        <div className="rounded-xl p-3.5" style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                            <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--theme-text-muted)' }}>Customer's note</p>
                            <p className="text-xs italic" style={{ color: 'var(--theme-text-2)' }}>"{proposal.customer_response_note}"</p>
                        </div>
                    )}

                    {isPending ? (
                        <>
                            <div className="flex justify-center"><CountdownTimer expiresAt={proposal.expires_at} /></div>
                            <div role="note" className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs text-center"
                                style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                                <Bell size={14} style={{ color: 'var(--theme-text-muted)' }} />
                                Waiting for the customer to respond. You'll be notified here.
                            </div>
                        </>
                    ) : (
                        <p className="text-xs text-center" style={{ color: 'var(--theme-text-muted)' }}>
                            {proposal.status === 'accepted' && 'The customer accepted this proposal — the booking has been rescheduled.'}
                            {proposal.status === 'countered' && 'The customer suggested a different time — review it in Reschedule Requests.'}
                            {proposal.status === 'cancelled' && 'The customer cancelled the booking in response to this proposal.'}
                            {proposal.status === 'expired' && 'This proposal expired with no response.'}
                        </p>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ── Pagination Component ────────────────────────────────────────────────────
function Pagination({ currentPage, totalPages, onPageChange, itemsPerPage, onItemsPerPageChange }) {
    return (
        <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: 'var(--theme-border)' }}>
            <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Show</span>
                <select value={itemsPerPage} onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
                    className="text-xs rounded-lg px-2 py-1 outline-none"
                    style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                </select>
                <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>per page</span>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-40"
                    style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                    <ChevronLeft size={14} />
                </button>
                <span className="text-xs font-medium" style={{ color: 'var(--theme-text-head)' }}>
                    Page {currentPage} of {totalPages || 1}
                </span>
                <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages || totalPages === 0}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-40"
                    style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                    <ChevronRightIcon size={14} />
                </button>
            </div>
        </div>
    );
}

// ── Latest Bookings Section (pinned, recent 24hrs) ──────────────────────────
// ── Pending Bookings — pinned atop All Bookings ─────────────────────────────
// Surfaces new booking requests before they get buried in the full history.
// The therapist, not the admin, is responsible for accepting/rejecting a
// pending booking (see TherapistBookingController::accept/reject) — this
// section is review-only, so there is no Approve action here.
function PendingBookingsSection({ bookings, onView }) {
    // allBookings already arrives newest-created-first
    // (AdminBookingController::allBookings() -> orderByDesc('created_at')),
    // so filtering preserves that order without any extra client-side sort.
    const pending = useMemo(() => bookings.filter(b => b.status === 'pending'), [bookings]);

    return (
        <div className="border-b" style={{ borderColor: 'var(--theme-border)' }}>
            <div className="flex items-center gap-2 px-5 py-3"
                style={{ background: 'rgba(226,183,100,0.06)', borderBottom: pending.length ? '1px solid rgba(226,183,100,0.15)' : 'none' }}>
                <Hourglass size={13} style={{ color: '#e2b764' }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#e2b764' }}>New Bookings</span>
                {pending.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(226,183,100,0.2)', color: '#e2b764' }}>
                        {pending.length}
                    </span>
                )}
            </div>

            {pending.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-1.5">
                    <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>No new bookings</p>
                    <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>New booking requests will appear here when they need your attention.</p>
                </div>
            ) : (
                <div className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
                    {pending.map(b => (
                        <div key={b.id} className="flex items-center gap-3 px-5 py-3 flex-wrap md:flex-nowrap"
                            style={{ borderLeft: '3px solid #e2b764' }}>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-xs font-bold" style={{ color: '#e2b764' }}>{b.ref}</span>
                                    <Badge cfg={STATUS_STYLES.pending} />
                                </div>
                                <p className="text-sm font-semibold mt-1 truncate" style={{ color: 'var(--theme-text-head)' }}>{b.customer_name} · {b.service_name}</p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                    Awaiting therapist acceptance — {b.therapist_name ?? 'Unassigned'}
                                </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                                <p className="text-xs font-medium whitespace-nowrap" style={{ color: 'var(--theme-text-head)' }}>{b.scheduled_start_fmt}</p>
                                <p className="text-[11px] font-semibold mt-0.5 whitespace-nowrap" style={{ color: '#e2b764' }}>{fmtWaitingSince(b.created_at_iso)}</p>
                            </div>
                            <Badge cfg={PAY_STATUS_STYLES[getPayStatus(b)]} />
                            <button onClick={() => onView(b)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-shrink-0"
                                style={{ background: 'rgba(226,183,100,0.1)', color: '#e2b764', border: '1px solid rgba(226,183,100,0.25)' }}>
                                <Eye size={11} /> View
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── All Bookings Table with Pagination ──────────────────────────────────────
function AllBookingsTable({ bookings, loading, onView, currentPage, totalPages, onPageChange, itemsPerPage, onItemsPerPageChange, search, onClearSearch }) {
    if (loading) {
        return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin" style={{ color: '#e2b764' }} /></div>;
    }

    if (!bookings.length) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(226,183,100,0.07)', border: '1px solid rgba(226,183,100,0.12)' }}>
                    <Archive size={22} style={{ color: '#e2b764' }} />
                </div>
                <div className="text-center"><p className="font-semibold mb-1" style={{ color: 'var(--theme-text-head)' }}>No bookings found</p>
                <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>{search ? 'Try a different search term.' : 'Nothing to show.'}</p>
                {search && <button onClick={onClearSearch} className="text-xs font-medium mt-2" style={{ color: '#e2b764' }}>Clear search</button>}</div>
            </div>
        );
    }

    return (
        <div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                    <thead><tr className="border-b text-left" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg)' }}>
                        <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--theme-text-muted)' }}>Ref</th>
                        <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--theme-text-muted)' }}>Customer / Service</th>
                        <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--theme-text-muted)' }}>Scheduled</th>
                        <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--theme-text-muted)' }}>Downpayment</th>
                        <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--theme-text-muted)' }}>Pay Status</th>
                        <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--theme-text-muted)' }}>Status</th>
                        <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--theme-text-muted)' }}></th>
                    </tr></thead>
                    <tbody>
                        {bookings.map(b => (
                            <tr key={b.id} className="border-b group transition-colors" style={{ borderColor: 'var(--theme-border)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(226,183,100,0.02)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <td className="px-4 py-3 whitespace-nowrap"><span className="font-mono text-xs font-bold" style={{ color: '#e2b764' }}>{b.ref}</span></td>
                                <td className="px-4 py-3"><p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>{b.customer_name}</p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{b.service_name}</p></td>
                                <td className="px-4 py-3 whitespace-nowrap"><p className="text-sm" style={{ color: 'var(--theme-text-head)' }}>{b.scheduled_start_fmt}</p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{b.therapist_name}</p></td>
                                <td className="px-4 py-3 whitespace-nowrap"><span className="text-sm font-medium" style={{ color: 'var(--theme-text-head)' }}>AED {Number(b.downpayment_amount).toFixed(2)}</span></td>
                                <td className="px-4 py-3"><Badge cfg={PAY_STATUS_STYLES[getPayStatus(b)]} /></td>
                                <td className="px-4 py-3"><div className="flex items-center flex-wrap"><Badge cfg={STATUS_STYLES[b.status]} /><StaleFlagBadge booking={b} /></div></td>
                                <td className="px-4 py-3"><button onClick={() => onView(b)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all" style={{ background: 'rgba(226,183,100,0.08)', color: '#e2b764', border: '1px solid rgba(226,183,100,0.2)' }}><Eye size={11} /> View</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} itemsPerPage={itemsPerPage} onItemsPerPageChange={onItemsPerPageChange} />
        </div>
    );
}

// ── Generic Table for Refunds/Cancelled ─────────────────────────────────────
function GenericTableView({ bookings, loading, onView, viewKey, search, onClearSearch }) {
    if (loading) {
        return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin" style={{ color: '#e2b764' }} /></div>;
    }

    if (!bookings.length) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(226,183,100,0.07)', border: '1px solid rgba(226,183,100,0.12)' }}>
                    <Receipt size={22} style={{ color: '#e2b764' }} />
                </div>
                <div className="text-center"><p className="font-semibold mb-1" style={{ color: 'var(--theme-text-head)' }}>No bookings found</p>
                <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>{search ? 'Try a different search term.' : 'Nothing to show.'}</p>
                {search && <button onClick={onClearSearch} className="text-xs font-medium mt-2" style={{ color: '#e2b764' }}>Clear search</button>}</div>
            </div>
        );
    }

    const isRefunds = viewKey === 'refunds';
    const isCancelled = viewKey === 'cancelled';
    const cols = isRefunds ? ['Ref', 'Customer', 'Service', 'Downpayment', 'Reason', 'Cancelled', ''] : ['Ref', 'Customer', 'Service', 'Type', 'DP Status', 'Cancelled', ''];

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
                <thead><tr className="border-b text-left" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg)' }}>
                    {cols.map((h, i) => <th key={i} className="px-4 py-3 text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--theme-text-muted)' }}>{h}</th>)}
                 </tr></thead>
                <tbody>
                    {bookings.map(b => (
                        <tr key={b.id} className="border-b group transition-colors" style={{ borderColor: 'var(--theme-border)' }}>
                            <td className="px-4 py-3 whitespace-nowrap"><span className="font-mono text-xs font-bold" style={{ color: '#e2b764' }}>{b.ref}</span></td>
                            {isRefunds ? (
                                <>
                                    <td className="px-4 py-3"><p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>{b.customer_name}</p><p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{b.customer_email}</p></td>
                                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--theme-text-head)' }}>{b.service_name}</td>
                                    <td className="px-4 py-3 whitespace-nowrap"><span className="text-sm font-bold" style={{ color: '#10b981' }}>AED {Number(b.downpayment_amount).toFixed(2)}</span></td>
                                    <td className="px-4 py-3 max-w-[160px]"><p className="text-xs truncate" style={{ color: 'var(--theme-text-muted)' }}>{b.cancellation_reason ?? '—'}</p></td>
                                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--theme-text-muted)' }}>{b.cancelled_at}</td>
                                </>
                            ) : (
                                <>
                                    <td className="px-4 py-3"><p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>{b.customer_name}</p><p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{b.service_name}</p></td>
                                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--theme-text-muted)' }}>{b.therapist_name}</td>
                                    <td className="px-4 py-3"><span className="text-xs font-semibold" style={{ color: b.cancellation_type === 'refunded' ? '#10b981' : '#f87171' }}>{b.cancellation_type === 'refunded' ? '✅ Refund' : '❌ Forfeited'}</span></td>
                                    <td className="px-4 py-3"><Badge cfg={DP_STYLES[b.downpayment_status]} /></td>
                                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--theme-text-muted)' }}>{b.cancelled_at}</td>
                                </>
                            )}
                            <td className="px-4 py-3"><button onClick={() => onView(b)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all" style={{ background: 'rgba(226,183,100,0.08)', color: '#e2b764', border: '1px solid rgba(226,183,100,0.2)' }}><Eye size={11} /> View</button></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BookingsManager() {
    const [activeView, setActiveView] = useState('needsAttention');
    const [allBookings, setAllBookings] = useState([]);
    const [refundQueue, setRefundQueue] = useState([]);
    const [cancelledHist, setCancelledHist] = useState([]);
    const [staleQueue, setStaleQueue] = useState([]);
    const [rescheduleRequests, setRescheduleRequests] = useState([]);
    const [reviewingRequest, setReviewingRequest] = useState(null);
    const [rescheduleProposals, setRescheduleProposals] = useState([]);
    const [viewingProposal, setViewingProposal] = useState(null);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [statsLoading, setStatsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);
    const [refunding, setRefunding] = useState(false);
    const [resolvingId, setResolvingId] = useState(null);
    const [toast, setToast] = useState(null);
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);
    const [totalPages, setTotalPages] = useState(1);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [all, refunds, cancelled, stale, rescheduleReqs, rescheduleProps] = await Promise.all([
                apiFetch('/admin/api/bookings'),
                apiFetch('/admin/api/bookings/pending-refunds'),
                apiFetch('/admin/api/bookings/cancelled-history'),
                apiFetch('/admin/api/bookings/stale'),
                apiFetch('/admin/api/bookings/reschedule-requests'), // defaults to status=pending
                apiFetch('/admin/api/bookings/reschedule-proposals'), // defaults to status=pending
            ]);
            setAllBookings(all);
            setRefundQueue(refunds);
            setCancelledHist(cancelled);
            setStaleQueue(stale);
            setRescheduleRequests(rescheduleReqs);
            setRescheduleProposals(rescheduleProps);
            // Calculate total pages for client-side pagination
            setTotalPages(Math.ceil(all.length / itemsPerPage));
        } catch {
            showToast('Failed to load bookings', 'error');
        } finally {
            setLoading(false);
        }
    }, [itemsPerPage]);

    const fetchStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            const s = await apiFetch('/admin/api/bookings/stats');
            setStats(s);
        } catch {} finally {
            setStatsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
        fetchStats();
    }, []);

    // Update total pages when allBookings changes
    useEffect(() => {
        setTotalPages(Math.ceil(allBookings.length / itemsPerPage));
        setCurrentPage(1);
    }, [allBookings, itemsPerPage]);

    const patchBooking = (id, patch) => {
        const p = prev => prev.map(b => b.id === id ? { ...b, ...patch } : b);
        setAllBookings(p);
        setRefundQueue(p);
        setCancelledHist(p);
        setSelected(prev => prev?.id === id ? { ...prev, ...patch } : prev);
    };

    // A resolution action always sets resolved_at, so the booking should
    // disappear from the Needs Attention queue regardless of which action
    // it took (unlike patchBooking's other queues, this one only ever removes).
    const resolveStaleLocally = (id, patch) => {
        patchBooking(id, patch);
        setStaleQueue(prev => prev.filter(b => b.id !== id));
    };

    const handleResolveComplete = async (bookingId) => {
        setResolvingId(bookingId);
        try {
            const data = await apiFetch(`/admin/api/bookings/stale/${bookingId}/complete`, { method: 'POST' });
            resolveStaleLocally(bookingId, data.booking);
            showToast('Booking marked completed ✅');
            fetchStats();
        } catch (e) {
            showToast(e.message, 'error');
            fetchAll();
        } finally {
            setResolvingId(null);
        }
    };

    const handleResolveNoShow = async (bookingId) => {
        setResolvingId(bookingId);
        try {
            const data = await apiFetch(`/admin/api/bookings/stale/${bookingId}/no-show`, { method: 'POST' });
            resolveStaleLocally(bookingId, data.booking);
            showToast('Booking marked as no-show ✅');
            fetchStats();
        } catch (e) {
            showToast(e.message, 'error');
            fetchAll();
        } finally {
            setResolvingId(null);
        }
    };

    const handleResolveCancel = async (bookingId, reason) => {
        setResolvingId(bookingId);
        try {
            const data = await apiFetch(`/admin/api/bookings/stale/${bookingId}/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason }),
            });
            resolveStaleLocally(bookingId, data.booking);
            showToast('Booking cancelled ✅');
            fetchStats();
        } catch (e) {
            showToast(e.message, 'error');
            fetchAll();
        } finally {
            setResolvingId(null);
        }
    };

    const handleRefundSent = async (bookingId, bankRef) => {
        setRefunding(true);
        try {
            const data = await apiFetch('/admin/api/bookings/mark-refund-sent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ booking_id: bookingId, bank_reference: bankRef }),
            });
            patchBooking(bookingId, data.booking);
            showToast(`Refund marked as sent ✅`);
            fetchStats();
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setRefunding(false);
        }
    };

    // ProposeRescheduleModal already performed the POST and only calls this
    // once the backend confirmed success. It never touches the booking — a
    // proposal doesn't mutate it (RescheduleProposalService::create()) —
    // so there's nothing to patch; this just refetches the proposal queue
    // (admin/api/bookings/reschedule-proposals) so the new pending
    // proposal's full, formatted record (with its nested booking) shows up
    // immediately in the "Awaiting Customer" queue and the drawer's
    // read-only state, rather than building a partial one from the
    // lightweight create-response here.
    const handleProposed = () => {
        showToast('Proposal sent — waiting for the customer to respond.');
        fetchAll();
    };

    // RescheduleRequestReviewModal already performed the approve/reject POST
    // — this just removes the now-resolved request from the pending queue
    // and, for an approval, fans the updated booking (already rescheduled
    // server-side) out to local state the same way handleRescheduled does.
    const handleRescheduleRequestResolved = (resolvedRequest, message) => {
        setRescheduleRequests(prev => prev.filter(r => r.id !== resolvedRequest.id));
        if (resolvedRequest.booking) patchBooking(resolvedRequest.booking.id, resolvedRequest.booking);
        setReviewingRequest(null);
        showToast(message);
        fetchStats();
    };

    // Paginated all bookings
    const paginatedAllBookings = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        return allBookings.slice(start, end);
    }, [allBookings, currentPage, itemsPerPage]);

    // Search filter for refunds/cancelled
    const filteredData = useMemo(() => {
        const data = activeView === 'refunds' ? refundQueue : cancelledHist;
        if (!search.trim()) return data;
        const q = search.toLowerCase();
        return data.filter(b =>
            (b.ref ?? '').toLowerCase().includes(q) ||
            (b.customer_name ?? '').toLowerCase().includes(q) ||
            (b.service_name ?? '').toLowerCase().includes(q)
        );
    }, [activeView, refundQueue, cancelledHist, search]);

    const badgeCounts = {
        needsAttention: staleQueue.length,
        awaitingCustomer: rescheduleProposals.length,
        rescheduleRequests: rescheduleRequests.length,
        refunds: refundQueue.length,
    };

    // Used by BookingDrawer to hide "Propose New Schedule" and show the
    // read-only "Awaiting Customer" state instead (requirement: no second
    // proposal, no direct reschedule while one is pending).
    const pendingProposalForSelected = selected
        ? rescheduleProposals.find(p => p.status === 'pending' && p.booking?.id === selected.id) ?? null
        : null;

    return (
        <AdminLayout title="Bookings Manager">
            <div className="space-y-5">
                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                    {[
                        { label: 'Total', value: stats?.total_bookings, color: '#e2b764', icon: Receipt, sub: 'all time' },
                        { label: 'Needs Attention', value: staleQueue.length, color: '#ef4444', icon: Siren, sub: 'stale sessions' },
                        { label: 'Refund Queue', value: stats?.pending_refunds, color: '#3b82f6', icon: RotateCcw, sub: 'to process' },
                        { label: 'Completed Today', value: stats?.completed_today, color: '#10b981', icon: CheckCircle2, sub: 'done' },
                        { label: 'Revenue Today', value: stats?.revenue_today ? `AED ${Number(stats.revenue_today).toLocaleString()}` : 'AED 0', color: '#e2b764', icon: TrendingUp, sub: 'collected' },
                    ].map(s => <StatCard key={s.label} {...s} loading={statsLoading} />)}
                </div>

                {/* Main Card */}
                <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}>
                    {/* Toolbar */}
                    <div className="flex flex-col md:flex-row md:items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                        <div className="flex items-center gap-1 flex-wrap">
                            {VIEWS.map(view => {
                                const isActive = activeView === view.key;
                                const Icon = view.icon;
                                const badge = badgeCounts[view.key];
                                return (
                                    <button key={view.key} onClick={() => { setActiveView(view.key); setSearch(''); if (view.key !== 'all') setCurrentPage(1); }}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                                        style={{ background: isActive ? `${view.color}15` : 'transparent', color: isActive ? view.color : 'var(--theme-text-muted)', border: isActive ? `1px solid ${view.color}40` : '1px solid transparent' }}>
                                        <Icon size={13} /> {view.label}
                                        {badge > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${view.color}25`, color: view.color }}>{badge}</span>}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="md:ml-auto flex items-center gap-2">
                            {(activeView === 'refunds' || activeView === 'cancelled') && (
                                <div className="relative">
                                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--theme-text-muted)' }} />
                                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-52 pl-8 pr-8 py-2 rounded-xl text-xs outline-none" style={{ background: 'var(--theme-input-bg, #141d33)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }} />
                                    {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X size={11} style={{ color: 'var(--theme-text-muted)' }} /></button>}
                                </div>
                            )}
                            <button onClick={() => { fetchAll(); fetchStats(); }} className="w-9 h-9 rounded-xl flex items-center justify-center transition-all" style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    {/* View Content */}
                    {activeView === 'needsAttention' && (
                        <NeedsAttentionQueue
                            bookings={staleQueue}
                            onComplete={handleResolveComplete}
                            onNoShow={handleResolveNoShow}
                            onCancel={handleResolveCancel}
                            resolvingId={resolvingId}
                            onView={setSelected}
                        />
                    )}
                    {activeView === 'awaitingCustomer' && (
                        <AwaitingCustomerQueue
                            proposals={rescheduleProposals}
                            onView={setViewingProposal}
                        />
                    )}
                    {activeView === 'rescheduleRequests' && (
                        <RescheduleRequestsQueue
                            requests={rescheduleRequests}
                            onReview={setReviewingRequest}
                            onView={setSelected}
                        />
                    )}
                    {activeView === 'all' && (
                        <>
                            <PendingBookingsSection bookings={allBookings} onView={setSelected} />
                            <AllBookingsTable
                                bookings={paginatedAllBookings}
                                loading={loading}
                                onView={setSelected}
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
                                itemsPerPage={itemsPerPage}
                                onItemsPerPageChange={setItemsPerPage}
                                search={search}
                                onClearSearch={() => setSearch('')}
                            />
                        </>
                    )}
                    {(activeView === 'refunds' || activeView === 'cancelled') && (
                        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                            <GenericTableView
                                bookings={filteredData}
                                loading={loading}
                                onView={setSelected}
                                viewKey={activeView}
                                search={search}
                                onClearSearch={() => setSearch('')}
                            />
                        </div>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {selected && (
                    <BookingDrawer
                        booking={selected}
                        onClose={() => setSelected(null)}
                        onRefundSent={handleRefundSent}
                        refunding={refunding}
                        onProposed={handleProposed}
                        pendingProposal={pendingProposalForSelected}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {reviewingRequest && (
                    <RescheduleRequestReviewModal
                        request={reviewingRequest}
                        onClose={() => setReviewingRequest(null)}
                        onApproved={(req) => handleRescheduleRequestResolved(req, 'Reschedule request approved ✅')}
                        onRejected={(req) => handleRescheduleRequestResolved(req, 'Reschedule request rejected')}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {viewingProposal && (
                    <ViewProposalModal
                        proposal={viewingProposal}
                        onClose={() => setViewingProposal(null)}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>{toast && <Toast toast={toast} />}</AnimatePresence>
        </AdminLayout>
    );
}