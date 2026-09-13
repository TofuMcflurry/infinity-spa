import TherapistLayout from '@/Layouts/TherapistLayout';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, usePage } from '@inertiajs/react';
import {
    Calendar, Clock, MapPin, CheckCircle2,
    XCircle, Banknote, ClipboardList, Star,
    AlertCircle, Car, ChevronRight, RefreshCw,
    CalendarClock, Hourglass, Loader2, X, Sparkles, CalendarX, PlayCircle
} from 'lucide-react';
import { isToday, fmtDate, fmtTime, fmtDateTime } from '@/lib/utils';

// ── CSRF + API helper ────────────────────────────────────────────────────────
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function getZone(booking) {
    return booking.zone_name
        ?? booking.zone?.name
        ?? booking.location_zone
        ?? booking.location
        ?? (booking.location_address ? booking.location_address.split(',')[0]?.trim() : null)
        ?? null;
}

const STATUS_CONFIG = {
    pending:         { label: 'Pending',          color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.3)',   icon: Clock        },
    accepted:        { label: 'Accepted',         color: '#10b981', bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.3)',   icon: CheckCircle2 },
    en_route:        { label: 'En Route',         color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',   border: 'rgba(59,130,246,0.3)',   icon: Car          },
    arrived:         { label: 'Arrived',          color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',   border: 'rgba(139,92,246,0.3)',   icon: MapPin       },
    completed:       { label: 'Completed',        color: '#e2b764', bg: 'rgba(226,183,100,0.1)',  border: 'rgba(226,183,100,0.3)',  icon: Star         },
    rejected:        { label: 'Rejected',         color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)',    icon: XCircle      },
    cancelled:       { label: 'Cancelled',        color: '#6b7280', bg: 'rgba(107,114,128,0.1)',  border: 'rgba(107,114,128,0.3)',  icon: XCircle      },
    pending_payment: { label: 'Awaiting Payment', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)',  border: 'rgba(148,163,184,0.3)',  icon: Banknote     },
};

// Optimistic status map — instant UI feedback before server responds
const OPTIMISTIC_STATUS = {
    accept:   'accepted',
    reject:   'rejected',
    cancel:   'cancelled',
    start:    'en_route',
    arrived:  'arrived',
    complete: 'completed',
};

const CANCEL_REASONS = [
    { key: 'double_booking',        label: 'Double booking'        },
    { key: 'personal_emergency',    label: 'Personal emergency'    },
    { key: 'conflict_schedule',     label: 'Conflict schedule'     },
    { key: 'therapist_unavailable', label: 'Therapist unavailable' },
    { key: 'other',                 label: 'Other'                 },
];

// ── Cancel Modal ──────────────────────────────────────────────────────────────
function CancelModal({ booking, onConfirm, onClose, loading }) {
    const [selected, setSelected] = useState('');
    const [otherText, setOtherText] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = () => {
        if (!selected) { setError('Please select a cancellation reason.'); return; }
        if (selected === 'other' && !otherText.trim()) { setError('Please describe the reason.'); return; }
        const reason = selected === 'other'
            ? otherText.trim()
            : CANCEL_REASONS.find(r => r.key === selected)?.label ?? selected;
        onConfirm(reason);
    };

    return (
        <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
            <motion.div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
            <motion.div
                className="relative w-full max-w-md rounded-2xl border overflow-hidden"
                style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}
                initial={{ scale: 0.95, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 24 }}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(107,114,128,0.12)' }}>
                            <XCircle size={15} style={{ color: '#9ca3af' }} />
                        </div>
                        <div>
                            <h3 className="font-display font-bold text-sm" style={{ color: 'var(--theme-text-head)' }}>Cancel Booking</h3>
                            <p className="text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
                                {booking.service?.name ?? '—'} · {booking.customer?.name ?? '—'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--theme-btn-bg)' }}>
                        <X size={14} style={{ color: 'var(--theme-text-muted)' }} />
                    </button>
                </div>
                <div className="px-5 py-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                        Reason <span style={{ color: '#ef4444' }}>*</span>
                    </p>
                    <div className="space-y-2">
                        {CANCEL_REASONS.map(reason => (
                            <button
                                key={reason.key}
                                onClick={() => { setSelected(reason.key); setError(''); }}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left transition-all"
                                style={{
                                    background: selected === reason.key ? 'rgba(107,114,128,0.15)' : 'var(--theme-bg)',
                                    border: `1px solid ${selected === reason.key ? 'rgba(107,114,128,0.5)' : 'var(--theme-border)'}`,
                                    color: selected === reason.key ? 'var(--theme-text-head)' : 'var(--theme-text-2)',
                                }}
                            >
                                <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                                    style={{ borderColor: selected === reason.key ? '#9ca3af' : 'var(--theme-border)', background: selected === reason.key ? '#9ca3af' : 'transparent' }}>
                                    {selected === reason.key && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>
                                {reason.label}
                            </button>
                        ))}
                    </div>
                    <AnimatePresence>
                        {selected === 'other' && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                                <textarea rows={3} value={otherText} onChange={e => { setOtherText(e.target.value); setError(''); }}
                                    placeholder="Please describe the reason…"
                                    className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none"
                                    style={{ background: 'var(--theme-input-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
                                    onFocus={e => e.currentTarget.style.borderColor = '#9ca3af'}
                                    onBlur={e => e.currentTarget.style.borderColor = 'var(--theme-border)'}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {error && <p className="text-xs flex items-center gap-1.5" style={{ color: '#ef4444' }}><AlertCircle size={11} /> {error}</p>}
                    <div className="flex gap-3 pt-1">
                        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                            style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)', border: '1px solid var(--theme-border)' }}>
                            Keep Booking
                        </button>
                        <button onClick={handleSubmit} disabled={loading}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                            style={{ background: 'rgba(107,114,128,0.2)', border: '1px solid rgba(107,114,128,0.4)', color: '#d1d5db', opacity: loading ? 0.7 : 1 }}>
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                            {loading ? 'Cancelling…' : 'Confirm Cancel'}
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

function StatusBadge({ status }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
    const Icon = cfg.icon;
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
            <Icon size={11} />{cfg.label}
        </span>
    );
}

function StatCard({ icon: Icon, label, value, accent, delay = 0 }) {
    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
            className="relative overflow-hidden rounded-2xl border p-5"
            style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl -translate-y-1/2 translate-x-1/4 pointer-events-none"
                style={{ background: accent ? `${accent}18` : 'rgba(226,183,100,0.08)' }} />
            <div className="relative z-10 flex items-start justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--theme-text-muted)' }}>{label}</p>
                    <p className="text-2xl font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>{value}</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: accent ? `${accent}20` : 'rgba(226,183,100,0.12)' }}>
                    <Icon size={18} style={{ color: accent ?? '#e2b764' }} />
                </div>
            </div>
        </motion.div>
    );
}

function SectionHeader({ icon: Icon, title, accentColor = '#e2b764', badge, children }) {
    return (
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--theme-border)' }}>
            <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${accentColor}18` }}>
                    <Icon size={14} style={{ color: accentColor }} />
                </div>
                <h3 className="font-display font-bold text-sm" style={{ color: 'var(--theme-text-head)' }}>{title}</h3>
                {badge != null && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${accentColor}18`, color: accentColor }}>
                        {badge}
                    </span>
                )}
            </div>
            {children}
        </div>
    );
}

function EmptyState({ icon: Icon, title, subtitle, accentColor = 'var(--theme-text-muted)' }) {
    return (
        <div className="px-5 py-10 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                <Icon size={20} style={{ color: accentColor }} />
            </div>
            <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-2)' }}>{title}</p>
                {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{subtitle}</p>}
            </div>
        </div>
    );
}

function SkeletonRow({ hasActions = false }) {
    return (
        <div className="px-5 py-4 flex items-center justify-between gap-3">
            <div className="space-y-2 flex-1">
                <div className="h-3.5 w-36 rounded-lg animate-pulse" style={{ background: 'var(--theme-skeleton)' }} />
                <div className="h-3 w-52 rounded-lg animate-pulse" style={{ background: 'var(--theme-skeleton)' }} />
            </div>
            <div className="flex gap-2">
                <div className="h-7 w-16 rounded-lg animate-pulse" style={{ background: 'var(--theme-skeleton)' }} />
                {hasActions && <div className="h-7 w-16 rounded-lg animate-pulse" style={{ background: 'var(--theme-skeleton)' }} />}
            </div>
        </div>
    );
}

// ── 1. ACTIVE SESSION ─────────────────────────────────────────────────────────
function ActiveSession({ booking, onAction, actionLoading }) {
    const steps = [
        { key: 'en_route',  label: 'En Route',  icon: Car    },
        { key: 'arrived',   label: 'Arrived',   icon: MapPin },
        { key: 'completed', label: 'Completed', icon: Star   },
    ];
    const stepOrder = ['en_route', 'arrived', 'completed'];
    const isLoading = (action) => actionLoading === `${booking?.id}-${action}`;

    return (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="rounded-2xl border overflow-hidden"
            style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}>
            <SectionHeader icon={Car} title="Active Session" accentColor="#e2b764">
                {booking && <StatusBadge status={booking.status} />}
            </SectionHeader>

            {!booking ? (
                <EmptyState
                    icon={Sparkles}
                    title="No active session right now"
                    subtitle="Tap Start Session on an upcoming booking when you're ready to go"
                    accentColor="#e2b764"
                />
            ) : (
                <div className="p-5 space-y-5">
                    <div className="flex items-start gap-3">
                        <span className="relative flex h-2.5 w-2.5 mt-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#e2b764' }} />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: '#e2b764' }} />
                        </span>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-display font-bold text-base leading-tight" style={{ color: 'var(--theme-text-head)' }}>
                                {booking.service?.name ?? '—'}
                            </h4>
                            <p className="text-sm mt-0.5" style={{ color: 'var(--theme-text-2)' }}>
                                {booking.customer?.name ?? '—'}
                                {getZone(booking) && <span style={{ color: 'var(--theme-text-muted)' }}> · {getZone(booking)}</span>}
                            </p>
                        </div>
                    </div>

                    {/* Progress steps */}
                    <div className="flex items-center">
                        {steps.map((step, idx) => {
                            const StepIcon = step.icon;
                            const currentIndex = stepOrder.indexOf(booking.status);
                            const isDone = idx <= currentIndex;
                            const isLast = idx === steps.length - 1;
                            return (
                                <div key={step.key} className="flex items-center flex-1 last:flex-none">
                                    <div className="flex flex-col items-center gap-1">
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all"
                                            style={{ borderColor: isDone ? '#e2b764' : 'var(--theme-border)', background: isDone ? 'rgba(226,183,100,0.12)' : 'transparent' }}>
                                            <StepIcon size={14} style={{ color: isDone ? '#e2b764' : '#374151' }} />
                                        </div>
                                        <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: isDone ? '#e2b764' : '#374151' }}>
                                            {step.label}
                                        </span>
                                    </div>
                                    {!isLast && (
                                        <div className="flex-1 h-0.5 mx-1 mb-4"
                                            style={{ background: idx < stepOrder.indexOf(booking.status) ? '#e2b764' : 'var(--theme-border)' }} />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="space-y-1.5">
                        {booking.location_address && (
                            <div className="flex items-start gap-2">
                                <MapPin size={13} className="mt-0.5 flex-shrink-0" style={{ color: '#e2b764' }} />
                                <p className="text-xs" style={{ color: 'var(--theme-text-2)' }}>{booking.location_address}</p>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <Clock size={13} style={{ color: 'var(--theme-text-muted)' }} />
                            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{fmtDateTime(booking.scheduled_start)}</p>
                        </div>
                    </div>

                    {booking.status === 'en_route' && (
                        <button onClick={() => onAction(booking.id, 'arrived')} disabled={!!actionLoading}
                            className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity"
                            style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', color: '#8b5cf6', opacity: actionLoading && !isLoading('arrived') ? 0.5 : 1 }}>
                            {isLoading('arrived') ? <Loader2 size={15} className="animate-spin" /> : <MapPin size={15} />}
                            {isLoading('arrived') ? 'Updating…' : 'Arrived'}
                        </button>
                    )}
                    {booking.status === 'arrived' && (
                        <button onClick={() => onAction(booking.id, 'complete')} disabled={!!actionLoading}
                            className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity"
                            style={{ background: 'rgba(226,183,100,0.15)', border: '1px solid rgba(226,183,100,0.35)', color: '#e2b764', opacity: actionLoading && !isLoading('complete') ? 0.5 : 1 }}>
                            {isLoading('complete') ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                            {isLoading('complete') ? 'Completing…' : 'Mark Complete'}
                        </button>
                    )}
                </div>
            )}
        </motion.div>
    );
}

// ── Upcoming Booking Row ──────────────────────────────────────────────────────
function UpcomingBookingRow({ booking, onAction, actionLoading, hasActiveSession }) {
    const [showCancel, setShowCancel] = useState(false);
    const isLoadingStart  = actionLoading === `${booking.id}-start`;
    const isLoadingCancel = actionLoading === `${booking.id}-cancel`;
    const zone = getZone(booking);

    return (
        <>
            <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                            {booking.service?.name ?? '—'}
                        </p>
                        <p className="text-xs mt-0.5 flex flex-wrap gap-x-1 items-center" style={{ color: 'var(--theme-text-muted)' }}>
                            <span style={{ color: 'var(--theme-text-2)' }}>{booking.customer?.name ?? '—'}</span>
                            {zone && <><span style={{ color: 'var(--theme-border)' }}>·</span><span style={{ color: '#e2b764' }}>{zone}</span></>}
                            <span style={{ color: 'var(--theme-border)' }}>·</span>
                            <span>{fmtDate(booking.scheduled_start)}</span>
                            <span style={{ color: 'var(--theme-border)' }}>·</span>
                            <span>{fmtTime(booking.scheduled_start)}</span>
                        </p>
                    </div>
                    <button onClick={() => setShowCancel(true)} disabled={!!actionLoading}
                        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity"
                        style={{ background: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.25)', color: '#9ca3af', opacity: actionLoading ? 0.5 : 1 }}>
                        {isLoadingCancel ? <Loader2 size={12} className="animate-spin" /> : 'Cancel'}
                    </button>
                </div>

                <button
                    onClick={() => onAction(booking.id, 'start')}
                    disabled={!!actionLoading || hasActiveSession}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                    style={{
                        background: hasActiveSession
                            ? 'rgba(16,185,129,0.05)'
                            : isLoadingStart ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.12)',
                        border: `1px solid ${hasActiveSession ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.3)'}`,
                        color: hasActiveSession ? 'rgba(16,185,129,0.4)' : '#10b981',
                        opacity: actionLoading && !isLoadingStart ? 0.5 : 1,
                        cursor: hasActiveSession ? 'not-allowed' : 'pointer',
                    }}
                >
                    {isLoadingStart
                        ? <><Loader2 size={14} className="animate-spin" /> Starting…</>
                        : hasActiveSession
                            ? <><PlayCircle size={14} /> Session already active</>
                            : <><PlayCircle size={14} /> Start Session</>
                    }
                </button>
            </div>

            <AnimatePresence>
                {showCancel && (
                    <CancelModal
                        booking={booking}
                        onClose={() => setShowCancel(false)}
                        onConfirm={(reason) => { setShowCancel(false); onAction(booking.id, 'cancel', { reason }); }}
                        loading={isLoadingCancel}
                    />
                )}
            </AnimatePresence>
        </>
    );
}

// ── 2. UPCOMING BOOKINGS ──────────────────────────────────────────────────────
function UpcomingBookings({ bookings, onAction, actionLoading, loading, hasActiveSession }) {
    return (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="rounded-2xl border overflow-hidden"
            style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}>
            <SectionHeader icon={CalendarClock} title="Upcoming Bookings" accentColor="#3b82f6" badge={bookings.length > 0 ? bookings.length : null}>
                <Link href="/therapist/bookings" className="text-xs font-semibold flex items-center gap-1" style={{ color: '#e2b764' }}>
                    View All <ChevronRight size={13} />
                </Link>
            </SectionHeader>
            <div className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
                {loading ? (
                    [0, 1, 2].map(i => <SkeletonRow key={i} hasActions />)
                ) : bookings.length === 0 ? (
                    <EmptyState icon={CalendarX} title="No upcoming sessions today" subtitle="Accepted bookings will appear here" accentColor="#3b82f6" />
                ) : (
                    bookings.map(booking => (
                        <UpcomingBookingRow
                            key={booking.id}
                            booking={booking}
                            onAction={onAction}
                            actionLoading={actionLoading}
                            hasActiveSession={hasActiveSession}
                        />
                    ))
                )}
            </div>
        </motion.div>
    );
}

// ── 3. PENDING BOOKINGS ───────────────────────────────────────────────────────
function PendingBookings({ bookings, onAction, actionLoading, loading }) {
    return (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="rounded-2xl border overflow-hidden"
            style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}>
            <SectionHeader icon={Hourglass} title="Pending Bookings" accentColor="#f59e0b" badge={bookings.length > 0 ? bookings.length : null} />
            <div className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
                {loading ? (
                    [0, 1].map(i => <SkeletonRow key={i} hasActions />)
                ) : bookings.length === 0 ? (
                    <EmptyState icon={Hourglass} title="No pending bookings" subtitle="You're all caught up!" accentColor="#f59e0b" />
                ) : (
                    bookings.map(booking => {
                        const zone = getZone(booking);
                        const isLoadingAccept = actionLoading === `${booking.id}-accept`;
                        const isLoadingReject = actionLoading === `${booking.id}-reject`;
                        return (
                            <div key={booking.id} className="px-5 py-4 flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                                        {booking.service?.name ?? '—'}
                                    </p>
                                    <p className="text-xs mt-0.5 flex flex-wrap gap-x-1 items-center" style={{ color: 'var(--theme-text-muted)' }}>
                                        <span style={{ color: 'var(--theme-text-2)' }}>{booking.customer?.name ?? '—'}</span>
                                        {zone && <><span style={{ color: 'var(--theme-border)' }}>·</span><span style={{ color: '#e2b764' }}>{zone}</span></>}
                                        <span style={{ color: 'var(--theme-border)' }}>·</span>
                                        <span>{fmtDate(booking.scheduled_start)}</span>
                                        <span style={{ color: 'var(--theme-border)' }}>·</span>
                                        <span>{fmtTime(booking.scheduled_start)}</span>
                                    </p>
                                </div>
                                <div className="flex gap-2 flex-shrink-0">
                                    <button onClick={() => onAction(booking.id, 'accept')} disabled={!!actionLoading}
                                        className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-opacity"
                                        style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', opacity: actionLoading && !isLoadingAccept ? 0.5 : 1 }}>
                                        {isLoadingAccept ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                        {isLoadingAccept ? '…' : 'Accept'}
                                    </button>
                                    <button onClick={() => onAction(booking.id, 'reject')} disabled={!!actionLoading}
                                        className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-opacity"
                                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', opacity: actionLoading && !isLoadingReject ? 0.5 : 1 }}>
                                        {isLoadingReject ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
                                        {isLoadingReject ? '…' : 'Reject'}
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </motion.div>
    );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
    const { props } = usePage();
    const user = props.auth?.user;

    const [bookings, setBookings]           = useState([]);
    const [stats, setStats]                 = useState(null);
    const [loading, setLoading]             = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [toast, setToast]                 = useState(null);

    const hour     = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const fetchStats = useCallback(() => {
        apiFetch('/therapist/api/bookings/stats').then(setStats).catch(console.error);
    }, []);

    // ── Full fetch (initial load + manual refresh + error recovery only) ──────
    const fetchBookings = useCallback(() => {
        setLoading(true);
        apiFetch('/therapist/api/bookings?status=pending,accepted,en_route,arrived&per_page=100')
            .then(data => setBookings(data.data || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchBookings();
        fetchStats();

        // ── WebSocket: listen for real-time booking updates ──────────────────
        // Server pushes changes — no polling needed.
        // Requires: Laravel Echo, Reverb, and a BookingStatusUpdated broadcast event.
        //
        // Example Laravel event:
        //   class BookingStatusUpdated implements ShouldBroadcast {
        //       public function broadcastOn() {
        //           return new PrivateChannel("therapist.{$this->booking->therapist_id}");
        //       }
        //   }
        //
        // Example controller:
        //   $booking->update(['status' => 'accepted']);
        //   broadcast(new BookingStatusUpdated($booking->fresh()->load('customer','service')));
        //   return response()->json(['message' => '...', 'booking' => $booking]);
        if (window.Echo && user?.id) {
            const channel = window.Echo.private(`therapist.${user.id}`);

            channel.listen('BookingStatusUpdated', (e) => {
                if (!e?.booking) return;
                const { status } = e.booking;

                setBookings(prev => {
                    // Remove completed/rejected/cancelled from dashboard list
                    if (['completed', 'rejected', 'cancelled'].includes(status)) {
                        return prev.filter(b => b.id !== e.booking.id);
                    }
                    // Update existing or add new
                    const exists = prev.some(b => b.id === e.booking.id);
                    return exists
                        ? prev.map(b => b.id === e.booking.id ? { ...b, ...e.booking } : b)
                        : [...prev, e.booking];
                });

                fetchStats();
            });

            return () => window.Echo.leave(`therapist.${user.id}`);
        }
    }, [fetchBookings, fetchStats, user?.id]);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    // ── Patch a single booking in local state ────────────────────────────────
    const patchBooking = useCallback((bookingId, patch) => {
        setBookings(prev => {
            const { status } = patch;
            // Remove from dashboard list when terminal state reached
            if (['completed', 'rejected', 'cancelled'].includes(status)) {
                return prev.filter(b => b.id !== bookingId);
            }
            return prev.map(b => b.id === bookingId ? { ...b, ...patch } : b);
        });
    }, []);

    const handleAction = useCallback(async (bookingId, action, body = {}) => {
        setActionLoading(`${bookingId}-${action}`);

        // ── 1. Optimistic update — instant UI response ───────────────────────
        const optimisticStatus = OPTIMISTIC_STATUS[action];
        if (optimisticStatus) {
            patchBooking(bookingId, { status: optimisticStatus });
        }

        const urlMap = {
            accept:   `/therapist/api/bookings/${bookingId}/accept`,
            reject:   `/therapist/api/bookings/${bookingId}/reject`,
            cancel:   `/therapist/api/bookings/${bookingId}/cancel`,
            start:    `/therapist/api/bookings/${bookingId}/start`,
            arrived:  `/therapist/api/bookings/${bookingId}/arrived`,
            complete: `/therapist/api/bookings/${bookingId}/complete`,
        };

        try {
            const data = await apiFetch(urlMap[action], {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            showToast(data.message ?? 'Booking updated!');

            // ── 2. Reconcile with server response (single record, no refetch) ─
            if (data.booking) {
                patchBooking(bookingId, data.booking);
            }

            fetchStats();

        } catch {
            // ── 3. Revert optimistic update on failure ───────────────────────
            showToast('Something went wrong. Please try again.', 'error');
            fetchBookings(); // full refetch only on error
        } finally {
            setActionLoading(null);
        }
    }, [patchBooking, fetchBookings, fetchStats]);

    // ── Derived lists ─────────────────────────────────────────────────────────
    const activeBooking = bookings.find(b =>
        ['en_route', 'arrived'].includes(b.status) && isToday(b.scheduled_start)
    ) ?? null;

    const hasActiveSession = !!activeBooking;

    const upcomingBookings = bookings
        .filter(b => b.status === 'accepted' && isToday(b.scheduled_start))
        .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));

    const pendingBookings = bookings
        .filter(b => b.status === 'pending')
        .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));

    return (
        <TherapistLayout>
            <div className="min-h-screen pb-24 md:pb-8" style={{ background: 'var(--theme-bg)' }}>
                <div className="max-w-4xl mx-auto px-4 md:px-8 pt-4 pb-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{greeting},</p>
                            <h1 className="font-display font-bold text-2xl" style={{ color: 'var(--theme-text-head)' }}>
                                {user?.name ?? 'Therapist'}
                            </h1>
                        </div>
                        <button onClick={() => fetchBookings()} disabled={loading}
                            className="w-9 h-9 rounded-xl flex items-center justify-center"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                            <RefreshCw size={15} style={{ color: 'var(--theme-text-2)' }} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                <div className="max-w-4xl mx-auto px-4 md:px-8 space-y-4 pt-3">
                    {loading ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {[0,1,2,3].map(i => <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'var(--theme-skeleton)' }} />)}
                        </div>
                    ) : stats ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <StatCard icon={Calendar}      label="Today's Sessions"     value={stats.today_sessions}                           delay={0}    />
                            <StatCard icon={ClipboardList} label="Pending"              value={stats.pending_count}   accent="#f59e0b"          delay={0.05} />
                            <StatCard icon={Star}          label="Completed"            value={stats.completed_count} accent="#10b981"          delay={0.1}  />
                            <StatCard icon={Banknote}      label="This Week's Earnings" value={`AED ${stats.week_earnings?.toLocaleString()}`} accent="#3b82f6" delay={0.15} />
                        </div>
                    ) : null}

                    <ActiveSession   booking={activeBooking}    onAction={handleAction} actionLoading={actionLoading} />
                    <UpcomingBookings bookings={upcomingBookings} onAction={handleAction} actionLoading={actionLoading} loading={loading} hasActiveSession={hasActiveSession} />
                    <PendingBookings  bookings={pendingBookings}  onAction={handleAction} actionLoading={actionLoading} loading={loading} />
                </div>
            </div>

            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 24, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.95 }}
                        className="fixed bottom-6 left-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-sm font-semibold"
                        style={{
                            transform: 'translateX(-50%)',
                            background: toast.type === 'error' ? '#7f1d1d' : 'var(--theme-card)',
                            border: `1px solid ${toast.type === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(226,183,100,0.3)'}`,
                            color: toast.type === 'error' ? '#fca5a5' : '#e2b764',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        }}
                    >
                        {toast.type === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>
        </TherapistLayout>
    );
}