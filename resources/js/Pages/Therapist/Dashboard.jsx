import TherapistLayout from '@/Layouts/TherapistLayout';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, usePage } from '@inertiajs/react';
import {
    Calendar, Clock, MapPin, User, CheckCircle2,
    XCircle, Banknote, ClipboardList, Star,
    AlertCircle, Car, ChevronRight, RefreshCw
} from 'lucide-react';

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

// ── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
    pending: {
        label: 'Pending',
        color: '#f59e0b',
        bg: 'rgba(245,158,11,0.1)',
        border: 'rgba(245,158,11,0.3)',
        icon: Clock,
    },
    accepted: {
        label: 'Accepted',
        color: '#10b981',
        bg: 'rgba(16,185,129,0.1)',
        border: 'rgba(16,185,129,0.3)',
        icon: CheckCircle2,
    },
    en_route: {
        label: 'En Route',
        color: '#3b82f6',
        bg: 'rgba(59,130,246,0.1)',
        border: 'rgba(59,130,246,0.3)',
        icon: Car,
    },
    arrived: {
        label: 'Arrived',
        color: '#8b5cf6',
        bg: 'rgba(139,92,246,0.1)',
        border: 'rgba(139,92,246,0.3)',
        icon: MapPin,
    },
    completed: {
        label: 'Completed',
        color: '#e2b764',
        bg: 'rgba(226,183,100,0.1)',
        border: 'rgba(226,183,100,0.3)',
        icon: Star,
    },
    rejected: {
        label: 'Rejected',
        color: '#ef4444',
        bg: 'rgba(239,68,68,0.1)',
        border: 'rgba(239,68,68,0.3)',
        icon: XCircle,
    },
    cancelled: {
        label: 'Cancelled',
        color: '#6b7280',
        bg: 'rgba(107,114,128,0.1)',
        border: 'rgba(107,114,128,0.3)',
        icon: XCircle,
    },
    pending_payment: {
        label: 'Awaiting Payment',
        color: '#94a3b8',
        bg: 'rgba(148,163,184,0.1)',
        border: 'rgba(148,163,184,0.3)',
        icon: Banknote,
    },
};

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
    const Icon = cfg.icon;
    return (
        <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
        >
            <Icon size={11} />
            {cfg.label}
        </span>
    );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, accent, delay = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            className="relative overflow-hidden rounded-2xl border p-5"
            style={{
                background: 'var(--theme-card)',
                borderColor: 'var(--theme-border)',
            }}
        >
            <div
                className="absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl -translate-y-1/2 translate-x-1/4 pointer-events-none"
                style={{ background: accent ? `${accent}18` : 'rgba(226,183,100,0.08)' }}
            />
            <div className="relative z-10 flex items-start justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--theme-text-muted)' }}>
                        {label}
                    </p>
                    <p className="text-2xl font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>{value}</p>
                </div>
                <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: accent ? `${accent}20` : 'rgba(226,183,100,0.12)' }}
                >
                    <Icon size={18} style={{ color: accent ?? '#e2b764' }} />
                </div>
            </div>
        </motion.div>
    );
}

// ── Active Session Tracker ────────────────────────────────────────────────────
function ActiveSessionTracker({ bookings, onAction, actionLoading }) {
    const activeBooking =
        (bookings.accepted ?? []).find(Boolean) ??
        (bookings.en_route ?? []).find(Boolean) ??
        (bookings.arrived  ?? []).find(Boolean) ??
        null;

    if (!activeBooking) return null;

    const status = activeBooking.status;

    const steps = [
        { key: 'accepted', label: 'Accepted',  icon: CheckCircle2 },
        { key: 'en_route', label: 'En Route',  icon: Car          },
        { key: 'arrived',  label: 'Arrived',   icon: MapPin       },
        { key: 'completed',label: 'Completed', icon: Star         },
    ];

    const stepOrder = ['accepted', 'en_route', 'arrived', 'completed'];
    const currentIndex = stepOrder.indexOf(status);

    const fmt = (dateStr) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
               ' · ' +
               d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    const isLoadingAction = (action) => actionLoading === `${activeBooking.id}-${action}`;

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="rounded-2xl border p-6"
            style={{
                background: 'var(--theme-card)',
                borderColor: 'var(--theme-border)',
            }}
        >
            {/* Top: pulse badge + service + customer */}
            <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#e2b764' }} />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: '#e2b764' }} />
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#e2b764' }}>
                            Active Session
                        </span>
                    </div>
                    <h3 className="font-display font-bold text-lg leading-tight" style={{ color: 'var(--theme-text-head)' }}>
                        {activeBooking.service?.name ?? '—'}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1">
                        <User size={12} style={{ color: 'var(--theme-text-muted)' }} />
                        <p className="text-sm" style={{ color: 'var(--theme-text-2)' }}>
                            {activeBooking.customer?.name ?? '—'}
                        </p>
                    </div>
                </div>
                <StatusBadge status={status} />
            </div>

            {/* Progress steps */}
            <div className="flex items-center mb-5">
                {steps.map((step, idx) => {
                    const StepIcon = step.icon;
                    const isDone = idx <= currentIndex;
                    const isLast = idx === steps.length - 1;

                    return (
                        <div key={step.key} className="flex items-center flex-1 last:flex-none">
                            <div className="flex flex-col items-center gap-1">
                                <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all"
                                    style={{
                                        borderColor: isDone ? '#e2b764' : 'var(--theme-border)',
                                        background:  isDone ? 'rgba(226,183,100,0.12)' : 'transparent',
                                    }}
                                >
                                    <StepIcon
                                        size={14}
                                        style={{ color: isDone ? '#e2b764' : '#374151' }}
                                    />
                                </div>
                                <span
                                    className="text-[10px] font-medium whitespace-nowrap"
                                    style={{ color: isDone ? '#e2b764' : '#374151' }}
                                >
                                    {step.label}
                                </span>
                            </div>
                            {!isLast && (
                                <div
                                    className="flex-1 h-0.5 mx-1 mb-4"
                                    style={{ background: idx < currentIndex ? '#e2b764' : 'var(--theme-border)' }}
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Location + datetime */}
            <div className="space-y-2 mb-4">
                {activeBooking.location_address && (
                    <div className="flex items-start gap-2">
                        <MapPin size={13} className="mt-0.5 flex-shrink-0" style={{ color: '#e2b764' }} />
                        <p className="text-xs" style={{ color: 'var(--theme-text-2)' }}>{activeBooking.location_address}</p>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <Clock size={13} style={{ color: 'var(--theme-text-muted)' }} />
                    <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{fmt(activeBooking.scheduled_start)}</p>
                </div>
            </div>

            {/* Action button */}
            {status === 'accepted' && (
                <button
                    onClick={() => onAction(activeBooking.id, 'en-route')}
                    disabled={!!actionLoading}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                    style={{
                        background: isLoadingAction('en-route') ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.15)',
                        border: '1px solid rgba(59,130,246,0.3)',
                        color: '#3b82f6',
                        opacity: actionLoading && !isLoadingAction('en-route') ? 0.5 : 1,
                    }}
                >
                    <Car size={15} />
                    {isLoadingAction('en-route') ? 'Updating…' : 'En Route'}
                </button>
            )}
            {status === 'en_route' && (
                <button
                    onClick={() => onAction(activeBooking.id, 'arrived')}
                    disabled={!!actionLoading}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                    style={{
                        background: isLoadingAction('arrived') ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.15)',
                        border: '1px solid rgba(139,92,246,0.3)',
                        color: '#8b5cf6',
                        opacity: actionLoading && !isLoadingAction('arrived') ? 0.5 : 1,
                    }}
                >
                    <MapPin size={15} />
                    {isLoadingAction('arrived') ? 'Updating…' : 'Arrived'}
                </button>
            )}
            {status === 'arrived' && (
                <button
                    onClick={() => onAction(activeBooking.id, 'complete')}
                    disabled={!!actionLoading}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                    style={{
                        background: isLoadingAction('complete') ? 'rgba(226,183,100,0.2)' : 'rgba(226,183,100,0.15)',
                        border: '1px solid rgba(226,183,100,0.3)',
                        color: '#e2b764',
                        opacity: actionLoading && !isLoadingAction('complete') ? 0.5 : 1,
                    }}
                >
                    <CheckCircle2 size={15} />
                    {isLoadingAction('complete') ? 'Completing…' : 'Mark Complete'}
                </button>
            )}
        </motion.div>
    );
}

// ── Recent Bookings ───────────────────────────────────────────────────────────
function RecentBookings({ bookings, loading }) {
    const fmt = (dateStr) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
               ' · ' +
               d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    const allFlat = Object.values(bookings).flat();
    const sorted  = [...allFlat]
        .sort((a, b) => new Date(b.scheduled_start) - new Date(a.scheduled_start))
        .slice(0, 5);

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border overflow-hidden"
            style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-5 py-4 border-b"
                style={{ borderColor: 'var(--theme-border)' }}
            >
                <h3 className="font-display font-bold text-sm" style={{ color: 'var(--theme-text-head)' }}>Recent Bookings</h3>
                <Link
                    href="/therapist/bookings"
                    className="text-xs font-semibold flex items-center gap-1 transition-colors"
                    style={{ color: '#e2b764' }}
                >
                    View All <ChevronRight size={13} />
                </Link>
            </div>

            {/* List */}
            <div className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
                {loading ? (
                    [0, 1, 2].map(i => (
                        <div key={i} className="px-5 py-4 flex items-center justify-between gap-3">
                            <div className="space-y-2 flex-1">
                                <div className="h-3.5 w-32 rounded animate-pulse" style={{ background: 'var(--theme-skeleton)' }} />
                                <div className="h-3 w-24 rounded animate-pulse" style={{ background: 'var(--theme-skeleton)' }} />
                            </div>
                            <div className="h-6 w-20 rounded-full animate-pulse" style={{ background: 'var(--theme-skeleton)' }} />
                        </div>
                    ))
                ) : sorted.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                        <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>No bookings yet</p>
                    </div>
                ) : (
                    sorted.map(booking => (
                        <div
                            key={booking.id}
                            className="px-5 py-4 flex items-center justify-between gap-3"
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-medium truncate" style={{ color: 'var(--theme-text-head)' }}>
                                    {booking.service?.name ?? '—'}
                                </p>
                                <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--theme-text-muted)' }}>
                                    <User size={11} />
                                    {booking.customer?.name ?? '—'}
                                    <span style={{ color: 'var(--theme-border)' }}>·</span>
                                    {fmt(booking.scheduled_start)}
                                </p>
                            </div>
                            <div className="flex-shrink-0">
                                <StatusBadge status={booking.status} />
                            </div>
                        </div>
                    ))
                )}
            </div>
        </motion.div>
    );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
    const { props } = usePage();
    const user = props.auth?.user;

    const [bookings, setBookings]           = useState({});
    const [loading, setLoading]             = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [toast, setToast]                 = useState(null);

    // ── Greeting ──────────────────────────────────────────────────────────────
    const hour     = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    // ── Derived stats ─────────────────────────────────────────────────────────
    const allFlat        = Object.values(bookings).flat();
    const today          = new Date().toDateString();
    const todayCount     = allFlat.filter(b => new Date(b.scheduled_start).toDateString() === today).length;
    const pendingCount   = (bookings.pending ?? []).length;
    const completedCount = (bookings.completed ?? []).length;
    const earnings       = (bookings.completed ?? []).reduce((acc, b) => acc + Number(b.service?.price ?? 0), 0);

    // ── Fetch bookings ────────────────────────────────────────────────────────
    const fetchBookings = useCallback(() => {
        setLoading(true);
        apiFetch('/therapist/api/bookings')
            .then(data => setBookings(data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { fetchBookings(); }, [fetchBookings]);

    // ── Toast helper ──────────────────────────────────────────────────────────
    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    // ── Handle action ─────────────────────────────────────────────────────────
    const handleAction = useCallback(async (bookingId, action, body = {}) => {
        const key = `${bookingId}-${action}`;
        setActionLoading(key);

        const urlMap = {
            accept:     `/therapist/api/bookings/${bookingId}/accept`,
            reject:     `/therapist/api/bookings/${bookingId}/reject`,
            complete:   `/therapist/api/bookings/${bookingId}/complete`,
            'en-route': `/api/therapist/bookings/${bookingId}/en-route`,
            arrived:    `/api/therapist/bookings/${bookingId}/arrived`,
        };

        try {
            const data = await apiFetch(urlMap[action], {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            showToast(data.message ?? 'Booking updated!');
            fetchBookings();
        } catch (err) {
            showToast('Something went wrong. Please try again.', 'error');
        } finally {
            setActionLoading(null);
        }
    }, [fetchBookings]);

    return (
        <TherapistLayout>
            <div className="min-h-screen pb-24 md:pb-8" style={{ background: 'var(--theme-bg)' }}>

                {/* ── Page header ─────────────────────────────────────────── */}
                <div className="max-w-4xl mx-auto px-4 md:px-8 pt-6 pb-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{greeting},</p>
                            <h1 className="font-display font-bold text-2xl" style={{ color: 'var(--theme-text-head)' }}>{user?.name ?? 'Therapist'}</h1>
                        </div>
                        <button
                            onClick={fetchBookings}
                            disabled={loading}
                            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}
                            title="Refresh"
                        >
                            <RefreshCw
                                size={15}
                                style={{ color: 'var(--theme-text-2)' }}
                                className={loading ? 'animate-spin' : ''}
                            />
                        </button>
                    </div>
                </div>

                <div className="max-w-4xl mx-auto px-4 md:px-8 space-y-6 pt-4">

                    {/* ── Stats 2×2 → 4-col grid ────────────────────────── */}
                    {loading ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'var(--theme-skeleton)' }} />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard icon={Calendar}      label="Today's Sessions" value={todayCount}                         delay={0}    />
                            <StatCard icon={ClipboardList} label="Pending"          value={pendingCount}                       delay={0.05} accent="#f59e0b" />
                            <StatCard icon={Star}          label="Completed"        value={completedCount}                     delay={0.1}  accent="#10b981" />
                            <StatCard icon={Banknote}      label="Total Earnings"   value={`AED ${earnings.toLocaleString()}`} delay={0.15} accent="#3b82f6" />
                        </div>
                    )}

                    {/* ── Active Session Tracker ─────────────────────────── */}
                    {!loading && (
                        <ActiveSessionTracker
                            bookings={bookings}
                            onAction={handleAction}
                            actionLoading={actionLoading}
                        />
                    )}

                    {/* ── Recent Bookings ────────────────────────────────── */}
                    <RecentBookings bookings={bookings} loading={loading} />

                </div>
            </div>

            {/* ── Toast ───────────────────────────────────────────────────── */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 24, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0,  scale: 1    }}
                        exit={{ opacity: 0,  y: 24, scale: 0.95  }}
                        className="fixed bottom-6 left-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-sm font-semibold"
                        style={{
                            transform: 'translateX(-50%)',
                            background: toast.type === 'error' ? '#7f1d1d' : 'var(--theme-card)',
                            border: `1px solid ${toast.type === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(226,183,100,0.3)'}`,
                            color: toast.type === 'error' ? '#fca5a5' : '#e2b764',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        }}
                    >
                        {toast.type === 'error'
                            ? <AlertCircle size={15} />
                            : <CheckCircle2 size={15} />
                        }
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>
        </TherapistLayout>
    );
}
