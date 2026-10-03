import AuthenticatedLayout from '@/Layouts/CustomerLayout';
import { ZoomIn } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { router, usePage  } from '@inertiajs/react';
import {
    Calendar, Clock, MapPin, User, Star,
    ChevronRight, Loader2, CheckCircle2,
    XCircle, AlertCircle, RefreshCw, Sparkles,
    CreditCard, Banknote, X, AlertTriangle,
    Receipt, Image, ExternalLink, CalendarClock,
    ArrowRight, ChevronLeft, Bell
} from 'lucide-react';
import { computePaymentSummary, PAYMENT_STATUS_LABELS, formatAed } from '@/lib/paymentSummary';

// ── API helper ─────────────────────────────────────────────────────────────
function getCsrf() {
    const cookie = document.cookie.split('; ').find(r => r.startsWith('XSRF-TOKEN='));
    return cookie ? decodeURIComponent(cookie.split('=')[1]) : '';
}

async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        credentials: 'same-origin',
        headers: {
            'Accept':           'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN':     getCsrf(),
            ...(options.headers ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    return res.json();
}

// ── Tab config ─────────────────────────────────────────────────────────────
const TABS = [
    { key: 'upcoming',  label: 'Upcoming',  icon: Calendar,     color: '#10b981' },
    { key: 'pending',   label: 'Pending',   icon: AlertCircle,  color: '#e2b764' },
    { key: 'completed', label: 'Completed', icon: CheckCircle2, color: '#60a5fa' },
    { key: 'cancelled', label: 'Cancelled', icon: XCircle,      color: '#f87171' },
];

const CANCEL_REASONS = [
    { id: 'schedule_conflict', label: 'Schedule conflict',        icon: '📅' },
    { id: 'personal_reasons',  label: 'Personal reasons',         icon: '🙏' },
    { id: 'found_alternative', label: 'Found another service',    icon: '🔄' },
    { id: 'financial_reasons', label: 'Financial reasons',        icon: '💳' },
    { id: 'emergency',         label: 'Emergency / urgent matter',icon: '🚨' },
    { id: 'other',             label: 'Other reason',             icon: '✏️'  },
];

// ── Reschedule request helpers ──────────────────────────────────────────────
// This is only ever a PREFERENCE for admin review — unlike the real booking
// flow's getAvailableSlots, there's no server-side availability check here,
// so the time window below just mirrors the same 16:00 -> 04:00 spa hours
// the booking flow already uses, purely to keep the picker sensible.
const RESCHEDULE_TIME_SLOTS = (() => {
    const slots = [];
    let h = 16, m = 0;
    for (let i = 0; i < 24; i++) {
        const hh = String(h % 24).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        const h12 = (h % 12) === 0 ? 12 : (h % 12);
        slots.push({ value: `${hh}:${mm}`, label: `${h12}:${mm} ${h % 24 < 12 ? 'AM' : 'PM'}` });
        m += 30;
        if (m === 60) { m = 0; h += 1; }
    }
    return slots;
})();

// Every wall-clock field of a JS Date, as seen in Asia/Dubai — the
// timezone the whole backend already assumes for any plain "Y-m-d H:i:s"
// string it receives (see config/app.php's 'timezone').
function dubaiParts(date) {
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

// A slot's time-of-day alone doesn't say which calendar day it belongs to —
// "00:00"-"03:30" is really the tail end of the shift that STARTED the
// previous evening, so the date the customer picked must roll forward a day
// for those values (same convention BookingController::getAvailableSlots
// already uses for the real booking flow).
function slotDateTimeString(dateStr, timeStr) {
    const hour = parseInt(timeStr.slice(0, 2), 10);
    const d = new Date(`${dateStr}T00:00:00`);
    if (hour < 16) d.setDate(d.getDate() + 1);
    const y = d.getFullYear(), mo = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da} ${timeStr}:00`;
}

// Quick "same time, N days later" suggestions computed from the booking's
// own current schedule — Asia/Dubai has no DST, so shifting the raw epoch
// by N*86400000ms always preserves the same Asia/Dubai wall-clock time.
function rescheduleSuggestions(scheduledStartIso) {
    if (!scheduledStartIso) return [];
    const base = new Date(scheduledStartIso);
    return [1, 3, 7].map(days => {
        const shifted = new Date(base.getTime() + days * 86_400_000);
        const { date, time } = dubaiParts(shifted);
        const label = shifted.toLocaleDateString('en-US', { timeZone: 'Asia/Dubai', weekday: 'short', month: 'short', day: 'numeric' });
        const timeLabel = shifted.toLocaleTimeString('en-US', { timeZone: 'Asia/Dubai', hour: 'numeric', minute: '2-digit', hour12: true });
        return {
            days,
            date, time,
            caption: days === 1 ? 'Tomorrow' : `In ${days} days`,
            label: `${label} · ${timeLabel}`,
        };
    });
}

// ── Reschedule Proposal (admin → customer) ──────────────────────────────────
// Everything below follows docs/design/INFINITY-HOME-SPA-UI-HANDOFF.md §8
// literally, including its exact token hex values (§1) — this is new UI the
// handoff is the single source of truth for, so it is NOT restyled to match
// the rest of this file's older ad-hoc palette.
const HO = {
    bg: '#0B1222', surface: '#111A2E', raised: '#16213A', line: '#24304B', lineStrong: '#66779B',
    ink: '#F3EFE6', ink2: '#A9B3C7', ink3: '#8390A8', inkDisabled: '#4E5A73',
    gold: '#E8B65C', goldHover: '#F0C477', onGold: '#1A1206', goldBg: '#2A2110', goldLine: '#6B5428',
    success: '#4CC79A', successBg: '#0F2A24', successBorder: '#1F5444',
    warning: '#F2A93B', warningBg: '#2C2210', warningBorder: '#5C4318',
    danger: '#F07A72', dangerBg: '#331A1F', dangerBorder: '#5E2C31', dangerOutline: '#7A3A3F', dangerSolidText: '#2A0C0A',
    info: '#6EA8F7', infoBg: '#132544', infoBorder: '#24447A',
    scrim: 'rgba(4,8,18,0.72)',
};

// §8.2 — proposal status -> label/tone (locked)
const PROPOSAL_STATUS_CONFIG = {
    pending:   { label: 'Awaiting Customer',     tone: 'warning' },
    accepted:  { label: 'Accepted',              tone: 'success' },
    countered: { label: 'Alternative Requested', tone: 'info' },
    cancelled: { label: 'Booking Cancelled',     tone: 'danger' },
    expired:   { label: 'Expired · No Response', tone: 'neutral' },
};

function toneColors(tone) {
    switch (tone) {
        case 'success': return { text: HO.success, bg: HO.successBg, border: HO.successBorder };
        case 'warning': return { text: HO.warning, bg: HO.warningBg, border: HO.warningBorder };
        case 'danger':  return { text: HO.danger,  bg: HO.dangerBg,  border: HO.dangerBorder };
        case 'info':    return { text: HO.info,    bg: HO.infoBg,    border: HO.infoBorder };
        case 'gold':    return { text: HO.gold,    bg: HO.goldBg,    border: HO.goldLine };
        // "neutral" — the undyed style §8.2 specifies for Expired (same as
        // MiniTag "Requested", §2.5): no new colour token.
        default:        return { text: HO.ink3,    bg: 'transparent', border: HO.line };
    }
}

// Every wall-clock field of an ISO instant, as seen in Asia/Dubai, split
// into the date/time pair ScheduleCompare's two mono lines need.
function splitIsoToDubaiDateTime(iso) {
    if (!iso) return { date: '—', time: '' };
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-US', { timeZone: 'Asia/Dubai', weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
    const time = d.toLocaleTimeString('en-US', { timeZone: 'Asia/Dubai', hour: 'numeric', minute: '2-digit', hour12: true });
    return { date, time };
}

// §2.4 StatusTag
function HandoffStatusTag({ label, tone }) {
    const c = toneColors(tone);
    return (
        <span className="inline-flex items-center uppercase whitespace-nowrap"
            style={{ height: 20, padding: '0 7px', borderRadius: 4, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>
            {label}
        </span>
    );
}

// §8.2 ProposalStatusLabel — mono "RESCHEDULE PROPOSAL" + StatusTag, gap 8.
function ProposalStatusLabel({ status }) {
    const cfg = PROPOSAL_STATUS_CONFIG[status] ?? { label: status, tone: 'neutral' };
    return (
        <div className="flex items-center" style={{ gap: 8 }}>
            <span className="font-mono uppercase whitespace-nowrap" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: HO.ink3 }}>
                Reschedule Proposal
            </span>
            <HandoffStatusTag label={cfg.label} tone={cfg.tone} />
        </div>
    );
}

// §2.12 StatusBanner
function HandoffStatusBanner({ tone, icon: Icon, title, children }) {
    const c = toneColors(tone);
    return (
        <div role="status" className="flex items-start" style={{ gap: 12, padding: '12px 14px', borderRadius: 10, border: `1px solid ${c.border}`, background: c.bg }}>
            <Icon size={16} style={{ color: c.text, flexShrink: 0, marginTop: 1 }} />
            <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: HO.ink, margin: 0 }}>{title}</p>
                {children && <p style={{ fontSize: 13, lineHeight: '19px', color: HO.ink2, marginTop: 4 }}>{children}</p>}
            </div>
        </div>
    );
}

// §2.9 ScheduleCompare — row of two cards with an arrow between.
function HandoffScheduleCompare({ leftEyebrow, leftTone = 'neutral', leftDate, leftTime, leftSub, rightEyebrow, rightTone = 'gold', rightDate, rightTime, rightSub }) {
    const Card = ({ eyebrow, tone, date, time, sub, borderColor }) => {
        const c = toneColors(tone);
        return (
            <div className="flex-1" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 16px', borderRadius: 10, background: HO.raised, border: `1px solid ${borderColor}` }}>
                <span className="uppercase" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: c.text }}>{eyebrow}</span>
                <span className="font-mono" style={{ fontSize: 15, fontWeight: 700, color: HO.ink }}>{date}</span>
                {time && <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: HO.ink2 }}>{time}</span>}
                {sub && <span style={{ fontSize: 12, color: HO.ink3, marginTop: 2 }}>{sub}</span>}
            </div>
        );
    };
    return (
        <div className="flex items-center" style={{ gap: 12 }}>
            <Card eyebrow={leftEyebrow} tone={leftTone} date={leftDate} time={leftTime} sub={leftSub} borderColor={HO.line} />
            <ArrowRight size={18} style={{ color: HO.ink3, flexShrink: 0 }} />
            <Card eyebrow={rightEyebrow} tone={rightTone} date={rightDate} time={rightTime} sub={rightSub} borderColor={HO.goldLine} />
        </div>
    );
}

// §2.11 InfoNote
function HandoffInfoNote({ icon: Icon = AlertCircle, children }) {
    return (
        <div role="note" className="flex" style={{ gap: 10, padding: '10px 12px', border: `1px solid ${HO.line}`, borderRadius: 8, background: HO.raised }}>
            <Icon size={16} style={{ color: HO.info, flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, lineHeight: '19px', color: HO.ink2, margin: 0 }}>{children}</p>
        </div>
    );
}

// §2.22 CountdownTimer (extends WaitingTimer — counts down instead of up)
function CountdownTimer({ expiresAt }) {
    if (!expiresAt) return null;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return null;
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const label = h > 0 ? `${h}H ${m}M` : `${m}M`;
    const warn = ms < 2 * 60 * 60 * 1000;
    return (
        <div className="flex items-center" style={{ gap: 6 }}>
            <Clock size={12} style={{ color: warn ? HO.warning : HO.ink3 }} />
            <span className="font-mono uppercase" style={{ fontSize: 11, fontWeight: 600, color: warn ? HO.warning : HO.ink3 }}>
                Expires in {label}
            </span>
        </div>
    );
}

// §2.1 Button
function HandoffButton({ variant = 'secondary', size = 'md', children, onClick, disabled, loading }) {
    const sizes = { sm: { height: 32, padX: 12, font: 13 }, md: { height: 40, padX: 16, font: 14 }, lg: { height: 44, padX: 20, font: 14 } };
    const s = sizes[size] ?? sizes.md;
    const variants = {
        primary:        { background: HO.gold,        color: HO.onGold,        border: HO.gold },
        secondary:      { background: HO.raised,      color: HO.ink,           border: HO.lineStrong },
        ghost:          { background: 'transparent',  color: HO.ink2,          border: 'transparent' },
        danger:         { background: 'transparent',  color: HO.danger,        border: HO.dangerOutline },
        'danger-solid': { background: HO.danger,       color: HO.dangerSolidText, border: HO.danger },
    };
    const v = disabled ? { background: HO.raised, color: HO.inkDisabled, border: HO.line } : (variants[variant] ?? variants.secondary);
    const spinnerColor = variant === 'primary' ? HO.onGold : HO.ink;
    return (
        <button
            onClick={onClick}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            aria-disabled={disabled || undefined}
            className="inline-flex items-center justify-center whitespace-nowrap transition-all"
            style={{
                gap: 8, height: s.height, padding: `0 ${s.padX}px`, borderRadius: 8,
                border: `1px solid ${v.border}`, background: v.background, color: v.color,
                fontSize: s.font, fontWeight: variant === 'danger-solid' ? 700 : 600,
                cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
            }}
        >
            {loading && <Loader2 size={14} className="animate-spin" style={{ color: spinnerColor }} />}
            {children}
        </button>
    );
}

// §8.5 — the full proposal response section: ProposalStatusLabel, the
// warning StatusBanner, ScheduleCompare, the three response actions,
// InfoNote and CountdownTimer. Only ever rendered for a `pending` proposal
// — once resolved, the booking's own normal status/schedule takes back
// over (see BookingCard/BookingDetailsModal).
function ProposalResponseSection({ booking, onAccept, onRequestAnother, onCancelBooking }) {
    const proposal = booking.reschedule_proposal;
    if (!proposal || proposal.status !== 'pending') return null;

    const { date: proposedDate, time: proposedTime } = splitIsoToDubaiDateTime(proposal.proposed_start_at);

    return (
        <div className="space-y-3">
            <ProposalStatusLabel status="pending" />
            <HandoffStatusBanner tone="warning" icon={Clock} title="New time proposed">
                Our team proposed a new time for your booking.
            </HandoffStatusBanner>
            <HandoffScheduleCompare
                leftEyebrow="Current · Confirmed" leftTone="success"
                leftDate={booking.date_short} leftTime={booking.time}
                leftSub="Your booking stays as is"
                rightEyebrow="Proposed" rightTone="gold"
                rightDate={proposedDate} rightTime={proposedTime}
                rightSub="Awaiting your response"
            />
            <div className="flex flex-wrap items-center" style={{ gap: 12 }}>
                <HandoffButton variant="danger" size="sm" onClick={() => onCancelBooking?.(booking, proposal)}>
                    Cancel Booking
                </HandoffButton>
                <div className="flex-1" />
                <HandoffButton variant="secondary" size="sm" onClick={() => onRequestAnother?.(booking, proposal)}>
                    Request Another Time
                </HandoffButton>
                <HandoffButton variant="primary" size="sm" onClick={() => onAccept?.(booking, proposal)}>
                    Accept New Schedule
                </HandoffButton>
            </div>
            <HandoffInfoNote icon={AlertCircle}>
                Accepting confirms this new schedule right away. Suggesting another time sends it to our team for review — your booking stays as is until then.
            </HandoffInfoNote>
            <CountdownTimer expiresAt={proposal.expires_at} />
        </div>
    );
}

// §4.1 Toast — handoff-locked feedback. This is the first toast in
// MyBookings.jsx; used only where §8 explicitly calls for one (the Accept
// success message, §8.6) — everything else keeps its existing non-toast
// feedback (modal close + list refresh), per §8.7/§8.9's "unchanged".
function HandoffToast({ toast, onDismiss }) {
    const tone = toast.type === 'error' ? 'danger' : toast.type;
    const c = toneColors(tone);
    const Icon = toast.type === 'error' ? AlertCircle : CheckCircle2;
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            role={toast.type === 'error' ? 'alert' : 'status'}
            className="fixed z-[70] bottom-6 left-1/2 -translate-x-1/2 sm:left-6 sm:translate-x-0 flex items-center"
            style={{ gap: 12, padding: '12px 14px', borderRadius: 10, background: HO.raised, border: `1px solid ${c.border}`, boxShadow: '0 12px 32px rgba(0,0,0,.45)', maxWidth: 420 }}
        >
            <Icon size={16} style={{ color: c.text, flexShrink: 0 }} />
            <span style={{ fontSize: 14, lineHeight: '20px', color: HO.ink }}>{toast.message}</span>
            <button onClick={onDismiss} aria-label="Dismiss" style={{ color: HO.ink3, marginLeft: 4 }}>
                <X size={14} />
            </button>
        </motion.div>
    );
}

// §8.6 — Accept confirmation, reusing the Approve-confirmation Modal shell
// (560) with customer-facing copy. The booking is only ever mutated by the
// backend's own accept() call below — never optimistically here.
function AcceptProposalModal({ booking, proposal, onClose, onAccepted }) {
    const [submitting, setSubmitting] = useState(false);
    const [error,      setError]      = useState(null);

    const { date: newDate, time: newTime } = splitIsoToDubaiDateTime(proposal.proposed_start_at);
    const bookingRef = `IHS-${String(booking.id).padStart(5, '0')}`;

    const handleConfirm = async () => {
        if (submitting) return; // belt-and-braces against a double click
        setSubmitting(true);
        setError(null);
        try {
            const data = await apiFetch(`/api/reschedule-proposals/${proposal.id}/accept`, { method: 'POST' });
            onAccepted(data);
        } catch (err) {
            setError(err.message || 'Could not accept this schedule.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0" style={{ background: HO.scrim, backdropFilter: 'blur(4px)' }}
                onClick={() => !submitting && onClose()}
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                role="dialog" aria-modal="true"
                className="relative w-full max-w-[560px] rounded-2xl overflow-hidden z-10"
                style={{ background: HO.surface, border: `1px solid ${HO.line}`, boxShadow: '0 24px 64px rgba(0,0,0,.55)' }}
            >
                <div className="flex items-start justify-between" style={{ padding: '22px 24px 18px', borderBottom: `1px solid ${HO.line}` }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div className="flex items-center" style={{ gap: 10 }}>
                            <span className="font-mono uppercase" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: HO.ink3 }}>
                                {bookingRef}
                            </span>
                            <ProposalStatusLabel status="pending" />
                        </div>
                        <h3 className="font-display" style={{ fontSize: 22, lineHeight: '28px', fontWeight: 600, color: HO.ink }}>
                            Accept this new schedule?
                        </h3>
                    </div>
                    <button onClick={() => !submitting && onClose()} aria-label="Close" style={{ color: HO.ink2 }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <HandoffScheduleCompare
                        leftEyebrow="From · Current" leftTone="neutral"
                        leftDate={booking.date_short} leftTime={booking.time}
                        rightEyebrow="To · New" rightTone="gold"
                        rightDate={newDate} rightTime={newTime}
                    />
                    <HandoffInfoNote icon={Bell}>
                        Your booking will be rescheduled. You and your therapist will both be notified.
                    </HandoffInfoNote>
                    {error && (
                        <div className="flex items-center gap-2" style={{ padding: 12, borderRadius: 8, background: HO.dangerBg, border: `1px solid ${HO.dangerBorder}`, color: HO.danger, fontSize: 13 }}>
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}
                </div>

                <div className="flex items-center" style={{ gap: 12, padding: '16px 24px', borderTop: `1px solid ${HO.line}`, background: HO.bg }}>
                    <div className="flex-1" />
                    <HandoffButton variant="ghost" onClick={() => !submitting && onClose()} disabled={submitting}>Back</HandoffButton>
                    <HandoffButton variant="primary" onClick={handleConfirm} loading={submitting}>
                        {submitting ? 'Accepting…' : 'Accept Schedule'}
                    </HandoffButton>
                </div>
            </motion.div>
        </div>
    );
}

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }) {
    const config = {
        accepted:        { label: 'Confirmed',          bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)',  color: '#10b981' },
        pending:         { label: 'Awaiting Therapist', bg: 'rgba(226,183,100,0.1)', border: 'rgba(226,183,100,0.3)', color: '#e2b764' },
        pending_payment: { label: 'Awaiting Payment',   bg: 'rgba(226,183,100,0.1)', border: 'rgba(226,183,100,0.3)', color: '#e2b764' },
        completed:       { label: 'Completed',        bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.3)',  color: '#60a5fa' },
        rejected:        { label: 'Rejected',         bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)', color: '#f87171' },
        cancelled:       { label: 'Cancelled',        bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)', color: '#f87171' },
    }[status] ?? { label: status, bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.3)', color: '#94a3b8' };

    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: config.bg, border: `1px solid ${config.border}`, color: config.color }}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {config.label}
        </span>
    );
}

// ── Booking Details Modal ──────────────────────────────────────────────────
function BookingDetailsModal({ booking, onClose, onAcceptProposal, onCounterProposal, onCancelViaProposal }) {
    const [showProof, setShowProof] = useState(false);
    const bookingRef = `IHS-${String(booking.id).padStart(5, '0')}`;

    // Shared payment contract (see resources/js/lib/paymentSummary.js —
    // audit findings A1/A2/A5): `payment_status` is the only authority for
    // "has this been paid," and a paid *deposit* is labeled distinctly from
    // a paid *full* booking so "Paid via Stripe" never overclaims full
    // settlement for a downpayment-type booking.
    const pay = computePaymentSummary(booking);
    const downpaymentStatusConfig = {
        paid_full:        { label: PAYMENT_STATUS_LABELS.paid_full + ' ✅',    color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)' },
        deposit_paid:      { label: PAYMENT_STATUS_LABELS.deposit_paid + ' ✅', color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)' },
        awaiting_payment:  { label: 'Awaiting Payment',            color: '#e2b764', bg: 'rgba(226,183,100,0.08)', border: 'rgba(226,183,100,0.2)' },
        no_proof:          { label: 'Awaiting transfer',           color: '#e2b764', bg: 'rgba(226,183,100,0.08)', border: 'rgba(226,183,100,0.2)' },
        submitted:         { label: 'Under review',                color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.2)'  },
        verified:          { label: 'Verified ✅',                  color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)'  },
    }[pay.statusKey] ?? { label: pay.statusKey, color: '#94a3b8', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)' };

    // Refund/forfeit outcomes come from `downpayment_status` directly and
    // take priority over the live payment-status label once cancelled.
    if (booking.downpayment_status === 'refunded') {
        downpaymentStatusConfig.label = 'Refunded';
        downpaymentStatusConfig.color = '#10b981';
    } else if (booking.downpayment_status === 'forfeited') {
        downpaymentStatusConfig.label = 'Forfeited';
        downpaymentStatusConfig.color = '#f87171';
        downpaymentStatusConfig.bg = 'rgba(248,113,113,0.08)';
        downpaymentStatusConfig.border = 'rgba(248,113,113,0.2)';
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 backdrop-blur-sm"
                style={{ background: 'rgba(0,0,0,0.75)' }}
                onClick={onClose}
            />

            {/* Modal */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1,    y: 0  }}
                exit={{ opacity: 0,  scale: 0.95, y: 20  }}
                className="relative w-full max-w-md rounded-2xl shadow-2xl z-10 overflow-hidden max-h-[90vh] flex flex-col"
                style={{ background: '#0f1629', border: '1px solid #1e2740' }}
            >
                {/* ── Header ── */}
                <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
                    style={{ borderColor: '#1e2740', background: 'linear-gradient(135deg, #141d33 0%, #0a0f1e 100%)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: 'rgba(226,183,100,0.15)' }}>
                            <Receipt size={15} style={{ color: '#e2b764' }} />
                        </div>
                        <div>
                            <h3 className="font-display font-bold text-white text-sm">Booking Details</h3>
                            <p className="text-[11px] font-mono" style={{ color: '#e2b764' }}>{bookingRef}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <StatusBadge status={booking.status} />
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg transition-colors"
                            style={{ color: '#64748b' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                            onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* ── Scrollable body ── */}
                <div className="overflow-y-auto flex-1 p-5 space-y-4">

                    {/* ── Reschedule Proposal response (§8.5) ── */}
                    {booking.reschedule_proposal?.status === 'pending' && (
                        <ProposalResponseSection
                            booking={booking}
                            onAccept={onAcceptProposal}
                            onRequestAnother={onCounterProposal}
                            onCancelBooking={onCancelViaProposal}
                        />
                    )}

                    {/* ── Session Info ── */}
                    <div className="rounded-xl p-4 space-y-3"
                        style={{ background: '#141d33', border: '1px solid #1e2740' }}>
                        <p className="text-[10px] uppercase tracking-wider font-semibold mb-3"
                            style={{ color: '#64748b' }}>Session Info</p>

                        {/* Therapist avatar + service */}
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-display font-bold flex-shrink-0"
                                style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}>
                                {booking.therapist_avatar}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-white">{booking.service}</p>
                                <p className="text-xs" style={{ color: '#94a3b8' }}>{booking.therapist}</p>
                            </div>
                        </div>

                        {[
                            { icon: User,      label: 'Therapist', value: booking.therapist                                          },
                            { icon: Calendar,  label: 'Date',      value: booking.date                                               },
                            { icon: Clock,     label: 'Time',      value: booking.time_end ? `${booking.time} - ${booking.time_end}` : booking.time },
                            { icon: Clock,     label: 'Duration',  value: `${booking.duration} minutes`                              },
                            { icon: MapPin,    label: 'Location',  value: booking.location                                           },
                            { icon: User,      label: 'Zone',      value: booking.zone_name                                          },
                        ].map(({ icon: Icon, label, value }) => (
                            <div key={label} className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <Icon size={11} style={{ color: '#64748b' }} />
                                    <span className="text-[11px]" style={{ color: '#64748b' }}>{label}</span>
                                </div>
                                <span className="text-[11px] font-medium text-right text-white">{value ?? '—'}</span>
                            </div>
                        ))}
                    </div>

                    {/* ── Payment Breakdown / Voucher Redemption ── */}
                    {booking.is_voucher_covered ? (
                        <div className="rounded-xl p-4 flex items-center gap-3"
                            style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)' }}>
                            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-base"
                                style={{ background: 'rgba(74,222,128,0.15)' }}>
                                🎁
                            </div>
                            <div>
                                <p className="text-sm font-semibold" style={{ color: '#4ade80' }}>Redeemed via Loyalty Voucher</p>
                                {booking.voucher_code && (
                                    <p className="text-[11px] font-mono mt-0.5" style={{ color: '#94a3b8' }}>Voucher: {booking.voucher_code}</p>
                                )}
                            </div>
                        </div>
                    ) : (
                    <>
                    <div className="rounded-xl p-4 space-y-2.5"
                        style={{ background: '#141d33', border: '1px solid #1e2740' }}>
                        <p className="text-[10px] uppercase tracking-wider font-semibold mb-3"
                            style={{ color: '#64748b' }}>Payment Breakdown</p>

                        <div className="flex justify-between items-center">
                            <span className="text-[11px]" style={{ color: '#94a3b8' }}>Total Amount</span>
                            <span className="text-sm font-display font-bold" style={{ color: '#e2b764' }}>
                                AED {Number(booking.price).toLocaleString()}
                            </span>
                        </div>

                        {booking.payment_type === 'full' ? (
                            <>
                                <div className="flex justify-between items-center">
                                    <span className="text-[11px]" style={{ color: '#94a3b8' }}>Total Paid</span>
                                    <span className="text-[11px] font-semibold" style={{ color: pay.isPaid ? '#10b981' : '#e2b764' }}>
                                        {pay.totalPaid != null ? formatAed(pay.totalPaid) : 'Not yet paid'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[11px]" style={{ color: '#94a3b8' }}>Remaining</span>
                                    <span className="text-[11px] font-semibold" style={{ color: pay.isPaid ? '#10b981' : '#e2b764' }}>
                                        {pay.isPaid ? 'AED 0.00 — Fully Paid' : formatAed(pay.remaining)}
                                    </span>
                                </div>
                            </>
                        ) : booking.downpayment_amount && (
                            <>
                                <div className="flex justify-between items-center">
                                    <span className="text-[11px]" style={{ color: '#94a3b8' }}>20% Downpayment</span>
                                    <span className="text-[11px] font-semibold text-white">
                                        AED {Number(booking.downpayment_amount).toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[11px]" style={{ color: '#94a3b8' }}>Remaining (on session)</span>
                                    <span className="text-[11px] font-semibold text-white">
                                        AED {Number(booking.remaining_amount).toFixed(2)}
                                    </span>
                                </div>
                            </>
                        )}

                        <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: '#1e2740' }}>
                            <span className="text-[11px]" style={{ color: '#94a3b8' }}>Session Payment</span>
                            <span className="text-[11px] font-semibold text-white capitalize">
                                {booking.payment_method}
                            </span>
                        </div>
                    </div>

                    {/* ── Downpayment Status ── */}
                    {/* Audit A5: a full-payment booking has no downpayment at
                        all — downpayment_status defaults to 'pending' on every
                        booking regardless of payment_type, so this box must be
                        explicitly excluded for payment_type === 'full' rather
                        than gated on that ever-truthy field alone. The
                        Payment Breakdown box above already shows the real
                        "Fully Paid" / "Not yet paid" state for that case. */}
                    {pay.showDownpaymentSection && booking.downpayment_status && (
                        <div className="rounded-xl p-4 space-y-3"
                            style={{ background: downpaymentStatusConfig.bg, border: `1px solid ${downpaymentStatusConfig.border}` }}>
                            <p className="text-[10px] uppercase tracking-wider font-semibold"
                                style={{ color: '#64748b' }}>Downpayment Status</p>

                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ background: downpaymentStatusConfig.color }} />
                                <span className="text-sm font-semibold"
                                    style={{ color: downpaymentStatusConfig.color }}>
                                    {downpaymentStatusConfig.label}
                                </span>
                            </div>

                            {/* Proof image */}
                            {booking.downpayment_proof && (
                                <>
                                    {/* Thumbnail preview */}
                                    <button
                                        onClick={() => setShowProof(true)}
                                        className="relative w-full rounded-xl overflow-hidden border transition-all group"
                                        style={{ border: '1px solid #1e2740' }}
                                    >
                                        <img
                                            src={`${window.location.origin}${booking.downpayment_proof}`}
                                            alt="Payment proof"
                                            className="w-full h-32 object-cover"
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            style={{ background: 'rgba(0,0,0,0.5)' }}>
                                            <div className="flex items-center gap-2 text-white text-xs font-medium">
                                                <ZoomIn size={16} />
                                                View Full Screenshot
                                            </div>
                                        </div>
                                    </button>

                                    {/* Fullscreen lightbox */}
                                    <AnimatePresence>
                                        {showProof && (
                                            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                                                onClick={() => setShowProof(false)}>
                                                <motion.div
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={{ opacity: 0 }}
                                                    className="absolute inset-0"
                                                    style={{ background: 'rgba(0,0,0,0.95)' }}
                                                />
                                                <motion.img
                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.9 }}
                                                    src={`${window.location.origin}${booking.downpayment_proof}`}
                                                    alt="Payment proof"
                                                    className="relative z-10 max-w-full max-h-full rounded-2xl object-contain"
                                                    style={{ maxHeight: '90vh', maxWidth: '90vw' }}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                                {/* Close button */}
                                                <button
                                                    onClick={() => setShowProof(false)}
                                                    className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                                                    style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                                >
                                                    <X size={18} />
                                                </button>
                                                {/* Tap to close hint */}
                                                <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs z-10"
                                                    style={{ color: 'rgba(255,255,255,0.4)' }}>
                                                    Click anywhere to close
                                                </p>
                                            </div>
                                        )}
                                    </AnimatePresence>
                                </>
                            )}
                        </div>
                    )}
                    </>
                    )}

                    {/* ── Cancellation Info ── */}
                    {booking.cancellation_type && (
                        <div className="rounded-xl p-4 space-y-2"
                            style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)' }}>
                            <p className="text-[10px] uppercase tracking-wider font-semibold"
                                style={{ color: '#64748b' }}>Cancellation</p>
                            <p className="text-xs font-semibold capitalize" style={{ color: '#f87171' }}>
                                {booking.cancellation_type === 'refunded'  && '✅ Refunded — cancelled before 24hrs'}
                                {booking.cancellation_type === 'forfeited' && '❌ Forfeited — cancelled within 24hrs'}
                                {booking.cancellation_type === 'no_show'   && '❌ Forfeited — no show'}
                                {booking.cancellation_type === 'expired'   && '⏱️ Expired — no therapist response before your appointment time'}
                                {booking.cancellation_type === 'therapist' && '🚫 Cancelled by Therapist — your therapist was unable to fulfill this booking'}
                            </p>
                            {booking.cancelled_at && (
                                <p className="text-[11px]" style={{ color: '#94a3b8' }}>
                                    Cancelled on {booking.cancelled_at}
                                </p>
                            )}
                        </div>
                    )}

                    {/* ── Rejection reason ── */}
                    {booking.rejection_reason && (
                        <div className="rounded-xl p-4"
                            style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)' }}>
                            <p className="text-[10px] uppercase tracking-wider font-semibold mb-2"
                                style={{ color: '#64748b' }}>Rejection Reason</p>
                            <p className="text-xs" style={{ color: '#f87171' }}>{booking.rejection_reason}</p>
                        </div>
                    )}

                    {/* ── Booked on ── */}
                    <div className="text-center pt-2">
                        <p className="text-[11px]" style={{ color: '#64748b' }}>
                            Booked on {booking.created_at ?? booking.date_short}
                        </p>
                    </div>
                </div>

                {/* ── Footer ── */}
                <div className="px-5 pb-5 pt-3 border-t flex-shrink-0"
                    style={{ borderColor: '#1e2740' }}>
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
                        style={{ background: '#141d33', color: '#94a3b8', border: '1px solid #1e2740' }}
                    >
                        Close
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

// ── Booking Card ───────────────────────────────────────────────────────────
function BookingCard({ booking, tab, onViewDetails, onCancel, onRequestReschedule, onAcceptProposal, onCounterProposal, onCancelViaProposal }) {
    const pendingReschedule = booking.reschedule_request?.status === 'pending';
    const pendingProposal   = booking.reschedule_proposal?.status === 'pending';
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="rounded-2xl border p-5 md:p-6 transition-all"
            style={{ background: '#0f1629', borderColor: '#1e2740' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#2a3a5c'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#1e2740'}
        >
            {/* Top row */}
            <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-display font-bold flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}>
                        {booking.therapist_avatar}
                    </div>
                    <div>
                        <h4 className="font-display font-semibold text-white text-base">{booking.service}</h4>
                        <p className="text-sm flex items-center gap-1.5 mt-0.5" style={{ color: '#94a3b8' }}>
                            <User size={12} /> {booking.therapist}
                        </p>
                    </div>
                </div>
                <StatusBadge status={booking.status} />
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: '#141d33' }}>
                        <Calendar size={13} style={{ color: '#e2b764' }} />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: '#64748b' }}>Date</p>
                        <p className="text-xs font-medium text-white">{booking.date_short}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: '#141d33' }}>
                        <Clock size={13} style={{ color: '#e2b764' }} />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: '#64748b' }}>Time</p>
                        <p className="text-xs font-medium text-white">{booking.time}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: '#141d33' }}>
                        <MapPin size={13} style={{ color: '#e2b764' }} />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: '#64748b' }}>Location</p>
                        <p className="text-xs font-medium text-white truncate">{booking.location?.split(' - ')[0]}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: '#141d33' }}>
                        {booking.is_voucher_covered
                            ? <span style={{ fontSize: 13 }}>🎁</span>
                            : booking.payment_method === 'cash'
                                ? <Banknote size={13} style={{ color: '#e2b764' }} />
                                : <CreditCard size={13} style={{ color: '#e2b764' }} />
                        }
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: '#64748b' }}>
                            {booking.is_voucher_covered ? 'Voucher' : 'Payment'}
                        </p>
                        <p className="text-xs font-medium text-white capitalize">
                            {booking.is_voucher_covered ? 'Redeemed' : booking.payment_method}
                        </p>
                    </div>
                </div>
            </div>

            {/* Downpayment status bar — only relevant while payment itself is
                still outstanding. Once payment_status is 'paid' (Stripe or
                voucher), this booking is awaiting therapist confirmation, not
                money, so the bar below takes over instead. */}
            {tab === 'pending' && !booking.is_voucher_covered && booking.payment_status !== 'paid' && booking.downpayment_status && (
                <div className="mb-4 px-3 py-2 rounded-xl flex items-center gap-2 text-xs"
                    style={{
                        background: booking.downpayment_status === 'verified'
                            ? 'rgba(16,185,129,0.08)'
                            : booking.downpayment_status === 'submitted'
                                ? 'rgba(96,165,250,0.08)'
                                : 'rgba(226,183,100,0.08)',
                        border: booking.downpayment_status === 'verified'
                            ? '1px solid rgba(16,185,129,0.2)'
                            : booking.downpayment_status === 'submitted'
                                ? '1px solid rgba(96,165,250,0.2)'
                                : '1px solid rgba(226,183,100,0.2)',
                    }}>
                    <span style={{
                        color: booking.downpayment_status === 'verified'  ? '#10b981'
                             : booking.downpayment_status === 'submitted' ? '#60a5fa'
                             : '#e2b764'
                    }}>
                        {/* Audit A5: "Downpayment" wording only applies to a
                            genuine downpayment-type booking — a full-payment
                            booking that's still awaiting its (one-time, full)
                            charge is not "awaiting a downpayment transfer." */}
                        {booking.payment_type === 'full' ? (
                            <>⚠️ Awaiting payment</>
                        ) : (
                            <>
                                {booking.downpayment_status === 'verified'  && '✅ Downpayment verified'}
                                {booking.downpayment_status === 'submitted' && '⏳ Downpayment under review'}
                                {booking.downpayment_status === 'pending'   && '⚠️ Awaiting downpayment transfer'}
                            </>
                        )}
                    </span>
                    {booking.downpayment_amount && (
                        <span className="ml-auto font-bold" style={{ color: '#e2b764' }}>
                            AED {booking.downpayment_amount}
                        </span>
                    )}
                </div>
            )}

            {/* Payment settled (Stripe or voucher), just waiting on the
                therapist to accept/reject. */}
            {tab === 'pending' && booking.status === 'pending' && (booking.payment_status === 'paid' || booking.is_voucher_covered) && (
                <div className="mb-4 px-3 py-2 rounded-xl flex items-center gap-2 text-xs"
                    style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>
                    <span style={{ color: '#60a5fa' }}>⏳ Awaiting therapist confirmation</span>
                </div>
            )}

            {/* Reschedule Proposal (admin → customer) — "Schedule Change
                Proposed", §8.5. Replaces the normal Reschedule/Cancel
                actions below while a response is pending. */}
            {pendingProposal && (
                <div className="mb-4">
                    <ProposalResponseSection
                        booking={booking}
                        onAccept={onAcceptProposal}
                        onRequestAnother={onCounterProposal}
                        onCancelBooking={onCancelViaProposal}
                    />
                </div>
            )}

            {/* A proposal that expired with no response — the booking was
                cancelled per the approved design (§8.10); this just
                explains why, using the data the backend actually returned. */}
            {tab === 'cancelled' && booking.reschedule_proposal?.status === 'expired' && (
                <div className="mb-4 flex items-center gap-2" style={{ padding: '10px 12px', borderRadius: 8, background: HO.infoBg, border: `1px solid ${HO.infoBorder}` }}>
                    <AlertCircle size={13} style={{ color: HO.info, flexShrink: 0 }} />
                    <span style={{ color: HO.info, fontSize: 12 }}>
                        This booking was cancelled — a proposed reschedule to {booking.reschedule_proposal.proposed_start_at_fmt} wasn't answered in time.
                    </span>
                </div>
            )}

            {/* Reschedule request status bar */}
            {booking.reschedule_request && (pendingReschedule || booking.reschedule_request.status === 'rejected') && (
                <div className="mb-4 px-3 py-2 rounded-xl flex items-center gap-2 text-xs"
                    style={{
                        background: pendingReschedule ? 'rgba(96,165,250,0.08)' : 'rgba(248,113,113,0.08)',
                        border: pendingReschedule ? '1px solid rgba(96,165,250,0.2)' : '1px solid rgba(248,113,113,0.2)',
                    }}>
                    <CalendarClock size={13} style={{ color: pendingReschedule ? '#60a5fa' : '#f87171' }} />
                    <span style={{ color: pendingReschedule ? '#60a5fa' : '#f87171' }}>
                        {pendingReschedule
                            ? `Reschedule requested for ${booking.reschedule_request.requested_start_at_fmt} · awaiting admin review`
                            : `Your last reschedule request was declined${booking.reschedule_request.admin_notes ? ': ' + booking.reschedule_request.admin_notes : ''}`}
                    </span>
                </div>
            )}

            {/* Price + Actions row */}
            <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: '#1e2740' }}>
                {booking.is_voucher_covered ? (
                    <div className="flex items-center gap-2">
                        <span style={{ fontSize: 16 }}>🎁</span>
                        <div>
                            <p className="text-xs font-semibold" style={{ color: '#4ade80' }}>Redeemed via Loyalty Voucher</p>
                            {booking.voucher_code && (
                                <p className="text-[10px] font-mono" style={{ color: '#64748b' }}>{booking.voucher_code}</p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div>
                        <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: '#64748b' }}>Total</p>
                        <p className="text-lg font-display font-bold" style={{ color: '#e2b764' }}>
                            AED {booking.price}
                        </p>
                    </div>
                )}

                <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* Request Reschedule button */}
                    {(tab === 'upcoming' || tab === 'pending') && booking.reschedule_eligible && !pendingProposal && (
                        <button
                            onClick={() => onRequestReschedule?.(booking)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                            style={{
                                color:      '#60a5fa',
                                background: 'rgba(96,165,250,0.05)',
                                border:     '1px solid rgba(96,165,250,0.3)',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(96,165,250,0.12)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(96,165,250,0.05)'}
                        >
                            <CalendarClock size={13} />
                            Reschedule
                        </button>
                    )}

                    {/* Cancel button */}
                    {(tab === 'upcoming' || tab === 'pending') && !pendingProposal && (
                        <button
                            onClick={() => onCancel?.(booking)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                            style={{
                                color:      '#f87171',
                                background: 'rgba(248,113,113,0.05)',
                                border:     '1px solid rgba(248,113,113,0.3)',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.12)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(248,113,113,0.05)'}
                        >
                            <X size={13} />
                            Cancel
                        </button>
                    )}

                    {/* Book Again */}
                    {(tab === 'completed' || tab === 'cancelled') && (
                        <button
                            onClick={() => router.visit(route('bookings'))}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all border"
                            style={{ borderColor: '#1e2740', color: '#cbd5e1' }}
                            onMouseEnter={e => {
                                e.currentTarget.style.borderColor = 'rgba(226,183,100,0.5)';
                                e.currentTarget.style.color = '#e2b764';
                                e.currentTarget.style.background = 'rgba(226,183,100,0.05)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = '#1e2740';
                                e.currentTarget.style.color = '#cbd5e1';
                                e.currentTarget.style.background = 'transparent';
                            }}
                        >
                            <RefreshCw size={13} />
                            Book Again
                        </button>
                    )}

                    {/* Rate button */}
                    {tab === 'completed' && booking.can_review && (
                        <button
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                            style={{
                                background: 'rgba(226,183,100,0.1)',
                                border:     '1px solid rgba(226,183,100,0.3)',
                                color:      '#e2b764',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(226,183,100,0.2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(226,183,100,0.1)'}
                        >
                            <Star size={13} />
                            Rate
                            {booking.hours_remaining > 0 && (
                                <span className="text-[10px] opacity-70">
                                    · {Math.floor(booking.hours_remaining)}h
                                </span>
                            )}
                        </button>
                    )}

                    {/* View Details arrow */}
                    <button
                        onClick={() => onViewDetails?.(booking)}
                        className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                        style={{ background: '#141d33', color: '#64748b' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#e2b764'; e.currentTarget.style.color = '#0b1120'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#141d33'; e.currentTarget.style.color = '#64748b'; }}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

// ── Request Reschedule Modal ────────────────────────────────────────────────
// Customer → My Bookings → Request Reschedule → choose preferred date/time
// (or a quick suggestion) → review → submit → the booking now shows
// "Reschedule requested ... awaiting admin review" (see the status bar in
// BookingCard above). This never moves the booking itself — it only ever
// creates a RescheduleRequest row via POST .../reschedule-request, the exact
// same endpoint RescheduleRequestService backs; the final schedule is
// entirely the admin's call (see AdminBookingController::approveRescheduleRequest).
function RequestRescheduleModal({ booking, proposal = null, onClose, onSubmitted }) {
    const [step,          setStep]          = useState('choose'); // choose | review | success
    const [selectedDate,  setSelectedDate]  = useState(dubaiParts(new Date()).date);
    const [selectedTime,  setSelectedTime]  = useState(RESCHEDULE_TIME_SLOTS[0].value);
    const [reason,        setReason]        = useState('');
    const [submitting,    setSubmitting]    = useState(false);
    const [error,         setError]         = useState(null);

    const todayDubai    = dubaiParts(new Date()).date;
    const suggestions   = rescheduleSuggestions(booking.scheduled_start);
    const requestedDateTimeStr = slotDateTimeString(selectedDate, selectedTime);

    // Tag the picked wall-clock values as UTC on both ends purely so
    // toLocaleString echoes back exactly what was entered, regardless of
    // the browser's own timezone — this is a display label only, never
    // sent anywhere.
    const requestedLabel = new Date(`${requestedDateTimeStr.replace(' ', 'T')}Z`)
        .toLocaleString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

    const applySuggestion = (s) => { setSelectedDate(s.date); setSelectedTime(s.time); };

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            // §8.7 — "Request Another Time" hands off to this exact flow;
            // the only difference is which endpoint resolves it: countering
            // a proposal must also mark it 'countered' and link the
            // resulting request, which only the proposal-aware endpoint
            // does (RescheduleProposalService::counter()).
            const url = proposal
                ? `/api/reschedule-proposals/${proposal.id}/counter`
                : `/api/bookings/${booking.id}/reschedule-request`;
            await apiFetch(url, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    requested_start_at: requestedDateTimeStr,
                    reason:             reason.trim() || undefined,
                }),
            });
            setStep('success');
        } catch (err) {
            setError(err.message || 'Could not submit this reschedule request.');
        } finally {
            setSubmitting(false);
        }
    };

    const inputStyle = { background: '#141d33', borderColor: '#1e2740', color: '#e2e8f0' };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 backdrop-blur-sm"
                style={{ background: 'rgba(0,0,0,0.75)' }}
                onClick={() => !submitting && onClose()}
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-md rounded-2xl shadow-2xl z-10 overflow-y-auto max-h-[90vh]"
                style={{ background: '#0f1629', border: '1px solid #1e2740' }}
            >
                {/* Header */}
                <div className="sticky top-0 p-5 border-b flex items-center justify-between"
                    style={{ borderColor: '#1e2740', background: '#0f1629' }}>
                    <div>
                        <h3 className="font-display font-semibold text-lg text-white">
                            {step === 'success' ? 'Request Submitted' : 'Request Reschedule'}
                        </h3>
                        {step !== 'success' && (
                            <p className="text-[11px] mt-0.5" style={{ color: '#64748b' }}>
                                {booking.service} • Currently {booking.date_short} at {booking.time}
                            </p>
                        )}
                        {/* §8.7 — the one addition this flow gets when opened
                            from a proposal's "Request Another Time" button. */}
                        {step !== 'success' && proposal && (
                            <p className="font-mono mt-1" style={{ fontSize: 11, color: HO.ink3 }}>
                                Responding to proposed time: {proposal.proposed_start_at_fmt}
                            </p>
                        )}
                    </div>
                    {step !== 'success' && (
                        <button onClick={() => !submitting && onClose()} className="p-1.5 rounded-lg" style={{ color: '#64748b' }}>
                            <X size={18} />
                        </button>
                    )}
                </div>

                {/* ── Step: choose ── */}
                {step === 'choose' && (
                    <div className="p-5 space-y-5">
                        <div>
                            <p className="text-xs font-medium mb-3" style={{ color: '#94a3b8' }}>Quick suggestions</p>
                            <div className="grid grid-cols-3 gap-2">
                                {suggestions.map(s => {
                                    const isActive = selectedDate === s.date && selectedTime === s.time;
                                    return (
                                        <button
                                            key={s.days}
                                            onClick={() => applySuggestion(s)}
                                            className="p-3 rounded-xl border text-center transition-all"
                                            style={{
                                                borderColor: isActive ? '#60a5fa' : '#1e2740',
                                                background:  isActive ? 'rgba(96,165,250,0.1)' : '#141d33',
                                            }}
                                        >
                                            <p className="text-[11px] font-semibold" style={{ color: isActive ? '#60a5fa' : '#cbd5e1' }}>{s.caption}</p>
                                            <p className="text-[10px] mt-1" style={{ color: '#64748b' }}>{s.label}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <p className="text-xs font-medium mb-3" style={{ color: '#94a3b8' }}>Or pick a date & time</p>
                            <div className="grid grid-cols-2 gap-3">
                                <input
                                    type="date"
                                    min={todayDubai}
                                    value={selectedDate}
                                    onChange={e => setSelectedDate(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none"
                                    style={inputStyle}
                                />
                                <select
                                    value={selectedTime}
                                    onChange={e => setSelectedTime(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none"
                                    style={inputStyle}
                                >
                                    {RESCHEDULE_TIME_SLOTS.map(slot => (
                                        <option key={slot.value} value={slot.value}>{slot.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <p className="text-xs font-medium mb-3" style={{ color: '#94a3b8' }}>Reason (optional)</p>
                            <textarea
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                placeholder="Let us know why you'd like to reschedule..."
                                rows={3}
                                maxLength={500}
                                className="w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none resize-none"
                                style={inputStyle}
                            />
                        </div>
                    </div>
                )}

                {/* ── Step: review ── */}
                {step === 'review' && (
                    <div className="p-5 space-y-5">
                        <div className="space-y-3">
                            <div className="p-4 rounded-xl" style={{ background: '#141d33', border: '1px solid #1e2740' }}>
                                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>Current Schedule</p>
                                <p className="text-sm font-semibold text-white">{booking.date_short} at {booking.time}</p>
                            </div>
                            <div className="flex justify-center">
                                <ArrowRight size={16} className="rotate-90" style={{ color: '#64748b' }} />
                            </div>
                            <div className="p-4 rounded-xl" style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.3)' }}>
                                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#60a5fa' }}>Requested Schedule</p>
                                <p className="text-sm font-semibold" style={{ color: '#60a5fa' }}>{requestedLabel}</p>
                            </div>
                        </div>

                        {reason.trim() && (
                            <div>
                                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>Your Reason</p>
                                <p className="text-sm" style={{ color: '#cbd5e1' }}>{reason.trim()}</p>
                            </div>
                        )}

                        <div className="flex items-start gap-3 p-4 rounded-xl"
                            style={{ background: 'rgba(226,183,100,0.06)', border: '1px solid rgba(226,183,100,0.2)' }}>
                            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#e2b764' }} />
                            <p className="text-xs" style={{ color: '#94a3b8' }}>
                                This is your preferred time, not a confirmed one. Our team will review it and may confirm a nearby time instead.
                            </p>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
                                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                <AlertCircle size={14} /> {error}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Step: success ── */}
                {step === 'success' && (
                    <div className="p-8 flex flex-col items-center text-center gap-3">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(96,165,250,0.12)' }}>
                            <CalendarClock size={26} style={{ color: '#60a5fa' }} />
                        </div>
                        <p className="font-display font-semibold text-white">Your request is pending review</p>
                        <p className="text-sm" style={{ color: '#94a3b8' }}>
                            We'll notify you once an admin confirms the new schedule for {requestedLabel}.
                        </p>
                        <button
                            onClick={onSubmitted}
                            className="mt-2 w-full py-2.5 rounded-xl text-sm font-bold"
                            style={{ background: '#e2b764', color: '#0b1120' }}
                        >
                            Done
                        </button>
                    </div>
                )}

                {/* Footer */}
                {step !== 'success' && (
                    <div className="sticky bottom-0 p-5 border-t flex gap-3"
                        style={{ borderColor: '#1e2740', background: '#0f1629' }}>
                        <button
                            onClick={() => step === 'review' ? setStep('choose') : onClose()}
                            disabled={submitting}
                            className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5"
                            style={{ background: '#141d33', color: '#94a3b8' }}>
                            {step === 'review' && <ChevronLeft size={14} />}
                            {step === 'review' ? 'Back' : 'Close'}
                        </button>
                        <button
                            onClick={() => step === 'choose' ? setStep('review') : handleSubmit()}
                            disabled={submitting}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                            style={{
                                background: 'rgba(96,165,250,0.15)',
                                border:     '1px solid rgba(96,165,250,0.4)',
                                color:      '#60a5fa',
                            }}>
                            {submitting
                                ? <Loader2 size={14} className="animate-spin" />
                                : step === 'choose' ? <ArrowRight size={14} /> : <CalendarClock size={14} />}
                            {submitting ? 'Submitting...' : step === 'choose' ? 'Review Request' : 'Submit Request'}
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    );
}

// ── Empty State ────────────────────────────────────────────────────────────
function EmptyState({ tab }) {
    const config = {
        upcoming:  { icon: Calendar,     msg: 'No upcoming bookings',  sub: 'Book a session to get started' },
        pending:   { icon: AlertCircle,  msg: 'No pending bookings',   sub: 'Your booking requests will appear here' },
        completed: { icon: CheckCircle2, msg: 'No completed sessions', sub: 'Your session history will appear here' },
        cancelled: { icon: XCircle,      msg: 'No cancelled bookings', sub: "You're all good!" },
    }[tab];
    const Icon = config.icon;

    return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: '#141d33' }}>
                <Icon size={28} style={{ color: '#2a3a5c' }} />
            </div>
            <div className="text-center">
                <p className="font-display font-semibold text-white mb-1">{config.msg}</p>
                <p className="text-sm" style={{ color: '#64748b' }}>{config.sub}</p>
            </div>
            {tab === 'upcoming' && (
                <button
                    onClick={() => router.visit(route('bookings'))}
                    className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm"
                    style={{ background: '#e2b764', color: '#0b1120' }}
                >
                    <Sparkles size={16} />
                    Book a Session
                </button>
            )}
        </div>
    );
}

// ── MAIN PAGE ──────────────────────────────────────────────────────────────
export default function MyBookings() {
    const { props } = usePage();
    const userId = props.auth?.user?.id;

    const [activeTab,       setActiveTab]       = useState('upcoming');
    const [data,            setData]            = useState(null);
    const [loading,         setLoading]         = useState(true);

    // ── Details modal ─────────────────────────────────────────────────────
    const [detailsBooking,   setDetailsBooking]   = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);

    // ── Cancel modal ──────────────────────────────────────────────────────
    const [cancelBooking,    setCancelBooking]    = useState(null);
    const [showCancelModal,  setShowCancelModal]  = useState(false);
    const [cancelling,       setCancelling]       = useState(false);
    const [cancelError,      setCancelError]      = useState(null);
    // Set only when Cancel was opened from a pending proposal's "Cancel
    // Booking" action (§8.9) — routes the same modal's submit to the
    // proposal-aware cancel endpoint instead of the plain one.
    const [cancelViaProposal, setCancelViaProposal] = useState(null);

    const [selectedReason,   setSelectedReason]   = useState(null);
    const [otherText,        setOtherText]        = useState('');

    // ── Request Reschedule modal ─────────────────────────────────────────────
    const [rescheduleBooking,   setRescheduleBooking]   = useState(null);
    const [showRescheduleModal, setShowRescheduleModal] = useState(false);
    // Set only when opened from a pending proposal's "Request Another Time"
    // action (§8.7) — same modal, routed to the proposal-aware counter
    // endpoint instead of the plain one.
    const [counterProposal,     setCounterProposal]     = useState(null);

    // ── Accept Proposal modal (§8.6) ──────────────────────────────────────
    const [acceptTarget,   setAcceptTarget]   = useState(null); // { booking, proposal }
    const [showAcceptModal, setShowAcceptModal] = useState(false);

    // ── Toast (§4.1) ───────────────────────────────────────────────────────
    const [toast, setToast] = useState(null);
    const showToast = useCallback((type, message) => {
        setToast({ type, message });
        if (type !== 'error') {
            // Success/info auto-dismiss after 5s; error stays until dismissed.
            setTimeout(() => setToast(current => (current?.message === message ? null : current)), 5000);
        }
    }, []);

    const fetchBookings = useCallback((silent = false) => {
        if (!silent) setLoading(true);
        apiFetch('/api/my-bookings')
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchBookings();
        const interval = setInterval(() => fetchBookings(true), 15_000);
        return () => clearInterval(interval);
    }, []);

    // ── WebSocket ──
    useEffect(() => {
        if (!window.Echo || !userId) return;
        const channel = window.Echo.private(`bookings.user.${userId}`);
        channel.listen('.status.updated', () => fetchBookings(true));
        return () => window.Echo.leave(`bookings.user.${userId}`);
    }, [userId]);

    // ── Cancel handler ────────────────────────────────────────────────────
    // §8.9 — reuses this exact flow unchanged for a proposal-triggered
    // cancellation; only the endpoint differs (the proposal-aware one also
    // marks the proposal 'cancelled' in the same transaction), per
    // cancelViaProposal.
    const handleCancelConfirm = useCallback(async () => {
        if (!cancelBooking) return;

        const finalReason = selectedReason === 'other' ? otherText.trim() : selectedReason;
        if (!finalReason) return;

        setCancelling(true);
        setCancelError(null);
        try {
            if (cancelViaProposal) {
                await apiFetch(`/api/reschedule-proposals/${cancelViaProposal.id}/cancel`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ reason: finalReason }),
                });
            } else {
                await apiFetch('/api/downpayment/cancel', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        booking_id:          cancelBooking.id,
                        cancellation_reason: finalReason,
                    }),
                });
            }
            setShowCancelModal(false);
            setCancelBooking(null);
            setCancelViaProposal(null);
            setSelectedReason(null);
            setOtherText('');
            fetchBookings();
        } catch (err) {
            setCancelError(err.message);
        } finally {
            setCancelling(false);
        }
    }, [cancelBooking, cancelViaProposal, selectedReason, otherText, fetchBookings]);

    // ── Reschedule Proposal response handlers (§8) ────────────────────────
    const handleAcceptProposal = useCallback((booking, proposal) => {
        setAcceptTarget({ booking, proposal });
        setShowAcceptModal(true);
    }, []);

    const handleCounterProposal = useCallback((booking, proposal) => {
        setRescheduleBooking(booking);
        setCounterProposal(proposal);
        setShowRescheduleModal(true);
    }, []);

    const handleCancelViaProposal = useCallback((booking, proposal) => {
        setCancelBooking(booking);
        setCancelViaProposal(proposal);
        setCancelError(null);
        setShowCancelModal(true);
    }, []);

    const currentBookings = data?.[activeTab] ?? [];
    const counts = {
        upcoming:  data?.upcoming?.length  ?? 0,
        pending:   data?.pending?.length   ?? 0,
        completed: data?.completed?.length ?? 0,
        cancelled: data?.cancelled?.length ?? 0,
    };

    return (
        <AuthenticatedLayout>
            <div className="min-h-screen" style={{ background: '#0b1120', color: '#cbd5e1' }}>

                {/* ── Header ── */}
                <header className="sticky top-0 z-30 border-b backdrop-blur-xl"
                    style={{ background: 'rgba(11,17,32,0.8)', borderColor: '#1e2740' }}>
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="h-16 flex items-center">
                            <h1 className="text-xl font-display font-semibold text-white">My Bookings</h1>
                        </div>
                        <div className="flex gap-1 pb-0 overflow-x-auto scrollbar-hide">
                            {TABS.map(tab => {
                                const Icon   = tab.icon;
                                const active = activeTab === tab.key;
                                const count  = counts[tab.key];
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveTab(tab.key)}
                                        className="relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-all flex-shrink-0"
                                        style={{ color: active ? tab.color : '#64748b' }}
                                    >
                                        <Icon size={15} />
                                        {tab.label}
                                        {count > 0 && (
                                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                                                style={{
                                                    background: active ? `${tab.color}20` : '#1e2740',
                                                    color:      active ? tab.color : '#64748b',
                                                }}>
                                                {count}
                                            </span>
                                        )}
                                        {active && (
                                            <motion.div
                                                layoutId="tab-indicator"
                                                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                                                style={{ background: tab.color }}
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </header>

                {/* ── Content ── */}
                <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#e2b764' }} />
                        </div>
                    ) : (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.2 }}
                            >
                                {currentBookings.length === 0 ? (
                                    <EmptyState tab={activeTab} />
                                ) : (
                                    <div className="space-y-4">
                                        {currentBookings.map(booking => (
                                            <BookingCard
                                                key={booking.id}
                                                booking={booking}
                                                tab={activeTab}
                                                onViewDetails={(b) => {
                                                    setDetailsBooking(b);
                                                    setShowDetailsModal(true);
                                                }}
                                                onCancel={(b) => {
                                                    setCancelBooking(b);
                                                    setCancelViaProposal(null);
                                                    setCancelError(null);
                                                    setShowCancelModal(true);
                                                }}
                                                onRequestReschedule={(b) => {
                                                    setRescheduleBooking(b);
                                                    setCounterProposal(null);
                                                    setShowRescheduleModal(true);
                                                }}
                                                onAcceptProposal={handleAcceptProposal}
                                                onCounterProposal={handleCounterProposal}
                                                onCancelViaProposal={handleCancelViaProposal}
                                            />
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    )}
                </main>

                {/* ── Booking Details Modal ── */}
                <AnimatePresence>
                    {showDetailsModal && detailsBooking && (
                        <BookingDetailsModal
                            booking={detailsBooking}
                            onClose={() => { setShowDetailsModal(false); setDetailsBooking(null); }}
                            onAcceptProposal={handleAcceptProposal}
                            onCounterProposal={handleCounterProposal}
                            onCancelViaProposal={handleCancelViaProposal}
                        />
                    )}
                </AnimatePresence>

                {/* ── Cancel Confirmation Modal ── */}
                <AnimatePresence>
                    {showCancelModal && cancelBooking && (
                        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="absolute inset-0 backdrop-blur-sm"
                                style={{ background: 'rgba(0,0,0,0.75)' }}
                                onClick={() => !cancelling && setShowCancelModal(false)}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="relative w-full max-w-md rounded-2xl shadow-2xl z-10 overflow-y-auto max-h-[90vh]"
                                style={{ background: '#0f1629', border: '1px solid #1e2740' }}
                            >
                                {/* Header */}
                                <div className="sticky top-0 p-5 border-b flex items-center justify-between"
                                    style={{ borderColor: '#1e2740', background: '#0f1629' }}>
                                    <div>
                                        <h3 className="font-display font-semibold text-lg text-white">Cancel Booking</h3>
                                        <p className="text-[11px] mt-0.5" style={{ color: '#64748b' }}>
                                            {cancelBooking.service} • {cancelBooking.date_short} at {cancelBooking.time}
                                        </p>
                                        {/* §8.9 — the one addition this flow gets when opened
                                            from a proposal's "Cancel Booking" action. */}
                                        {cancelViaProposal && (
                                            <p className="font-mono mt-1" style={{ fontSize: 11, color: HO.ink3 }}>
                                                Declining the proposed time: {cancelViaProposal.proposed_start_at_fmt}
                                            </p>
                                        )}
                                    </div>
                                    <button onClick={() => !cancelling && setShowCancelModal(false)}
                                        className="p-1.5 rounded-lg" style={{ color: '#64748b' }}>
                                        <X size={18} />
                                    </button>
                                </div>

                                <div className="p-5 space-y-5">

                                    {/* Refund / Forfeit warning */}
                                    {cancelBooking.downpayment_status === 'verified' ? (
                                        cancelBooking.hours_until_session > 24 ? (
                                            <div className="flex items-start gap-3 p-4 rounded-xl"
                                                style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                                <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#10b981' }} />
                                                <div>
                                                    <p className="text-sm font-semibold" style={{ color: '#10b981' }}>Full refund eligible</p>
                                                    <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>
                                                        Your session is more than 24 hours away. Downpayment will be refunded within 3-5 business days.
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-start gap-3 p-4 rounded-xl"
                                                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                                                <div>
                                                    <p className="text-sm font-semibold" style={{ color: '#ef4444' }}>Downpayment will be forfeited</p>
                                                    <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>
                                                        Your session is less than 24 hours away. Downpayment cannot be refunded per our policy.
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    ) : (
                                        <div className="flex items-start gap-3 p-4 rounded-xl"
                                            style={{ background: 'rgba(226,183,100,0.06)', border: '1px solid rgba(226,183,100,0.2)' }}>
                                            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#e2b764' }} />
                                            <div>
                                                <p className="text-sm font-semibold" style={{ color: '#e2b764' }}>No charge</p>
                                                <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>
                                                    Your downpayment hasn't been verified yet — no amount will be charged.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Reason selector */}
                                    <div>
                                        <p className="text-xs font-medium mb-3" style={{ color: '#94a3b8' }}>
                                            Reason for cancellation *
                                        </p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {CANCEL_REASONS.map((reason) => {
                                                const isActive = selectedReason === reason.id;
                                                return (
                                                    <button key={reason.id} onClick={() => setSelectedReason(reason.id)}
                                                        className="flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all"
                                                        style={{
                                                            borderColor: isActive ? 'rgba(226,183,100,0.5)' : '#1e2740',
                                                            background:  isActive ? 'rgba(226,183,100,0.08)' : '#141d33',
                                                        }}>
                                                        <span className="text-base">{reason.icon}</span>
                                                        <span className="text-xs font-medium"
                                                            style={{ color: isActive ? '#e2b764' : '#94a3b8' }}>
                                                            {reason.label}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Other text input */}
                                    <AnimatePresence>
                                        {selectedReason === 'other' && (
                                            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                                <textarea
                                                    value={otherText}
                                                    onChange={e => setOtherText(e.target.value)}
                                                    placeholder="Please describe your reason..."
                                                    rows={3}
                                                    className="w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none resize-none"
                                                    style={{ background: '#141d33', borderColor: '#1e2740', color: '#e2e8f0' }}
                                                />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {cancelError && (
                                        <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
                                            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                            <AlertCircle size={14} /> {cancelError}
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="sticky bottom-0 p-5 border-t flex gap-3"
                                    style={{ borderColor: '#1e2740', background: '#0f1629' }}>
                                    <button
                                        onClick={() => { setShowCancelModal(false); setSelectedReason(null); setOtherText(''); }}
                                        disabled={cancelling}
                                        className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                                        style={{ background: '#141d33', color: '#94a3b8' }}>
                                        Keep Booking
                                    </button>
                                    <button
                                        onClick={handleCancelConfirm}
                                        disabled={!selectedReason || (selectedReason === 'other' && otherText.trim().length < 4) || cancelling}
                                        className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                                        style={{
                                            background:  (!selectedReason || cancelling) ? '#141d33' : 'rgba(239,68,68,0.15)',
                                            border:      '1px solid',
                                            borderColor: (!selectedReason || cancelling) ? '#1e2740' : 'rgba(239,68,68,0.4)',
                                            color:       (!selectedReason || cancelling) ? '#475569' : '#ef4444',
                                            cursor:      !selectedReason ? 'not-allowed' : 'pointer',
                                        }}>
                                        {cancelling ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                                        {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* ── Request Reschedule Modal ── */}
                <AnimatePresence>
                    {showRescheduleModal && rescheduleBooking && (
                        <RequestRescheduleModal
                            booking={rescheduleBooking}
                            proposal={counterProposal}
                            onClose={() => { setShowRescheduleModal(false); setRescheduleBooking(null); setCounterProposal(null); }}
                            onSubmitted={() => {
                                setShowRescheduleModal(false);
                                setRescheduleBooking(null);
                                setCounterProposal(null);
                                fetchBookings();
                            }}
                        />
                    )}
                </AnimatePresence>

                {/* ── Accept Proposal Modal (§8.6) ── */}
                <AnimatePresence>
                    {showAcceptModal && acceptTarget && (
                        <AcceptProposalModal
                            booking={acceptTarget.booking}
                            proposal={acceptTarget.proposal}
                            onClose={() => { setShowAcceptModal(false); setAcceptTarget(null); }}
                            onAccepted={(data) => {
                                setShowAcceptModal(false);
                                setAcceptTarget(null);
                                fetchBookings();
                                const newStart = data?.booking?.scheduled_start;
                                const label = newStart
                                    ? (() => { const { date, time } = splitIsoToDubaiDateTime(newStart); return `${date} · ${time}`; })()
                                    : null;
                                showToast('success', label ? `Booking rescheduled to ${label}.` : 'Booking rescheduled.');
                            }}
                        />
                    )}
                </AnimatePresence>

                {/* ── Toast (§4.1) ── */}
                <AnimatePresence>
                    {toast && <HandoffToast toast={toast} onDismiss={() => setToast(null)} />}
                </AnimatePresence>

            </div>
        </AuthenticatedLayout>
    );
}