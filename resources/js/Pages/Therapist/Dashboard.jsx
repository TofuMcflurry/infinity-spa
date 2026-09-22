import TherapistLayout from '@/Layouts/TherapistLayout';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePage, Link } from '@inertiajs/react';
import {
    Calendar, ClipboardList, Star, Banknote,
    MapPin, Phone, Eye, Clock3, ChevronRight,
    CircleDollarSign, CheckCircle2, AlertCircle,
    Sparkles, Loader2, PlayCircle, XCircle, CalendarClock,
} from 'lucide-react';
import { isToday, fmtDate, fmtTime, fmtDateTime, DUBAI_TZ } from '@/lib/utils';

import { Button } from '@/Components/ui/button';
import { BookingModal, BookingReviewModal } from '@/Pages/Therapist/Bookings';

// ── CSRF + API helper — same pattern as Dashboard.jsx / Bookings.jsx ───────────
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

const OPTIMISTIC_STATUS = {
    accept:   'accepted',
    reject:   'rejected',
    cancel:   'cancelled',
    start:    'en_route',
    arrived:  'arrived',
    complete: 'completed',
};

// ── Timeline status → color language, reusing colors already established
// in Bookings.jsx's STATUS_CONFIG / PAYMENT_STATUS_CONFIG — no new colors.
function timelineMeta(status) {
    switch (status) {
        case 'completed':          return { label: 'Done',     color: '#10b981', pulse: false };
        case 'en_route':
        case 'arrived':             return { label: 'Now',      color: '#e2b764', pulse: true  };
        case 'accepted':            return { label: 'Upcoming', color: 'var(--theme-text-muted)', pulse: false };
        case 'pending':             return { label: 'Pending',  color: '#f59e0b', pulse: false };
        case 'pending_payment':     return { label: 'Awaiting Payment', color: '#f59e0b', pulse: false };
        default:                    return { label: status,     color: 'var(--theme-text-muted)', pulse: false };
    }
}

// "Today" / "Tomorrow" / "Sep 24" — used by Pending Approval and Upcoming
// Bookings, both of which span multiple future dates unlike Today's Timeline.
function relativeDayLabel(dateStr) {
    if (!dateStr) return '—';
    if (isToday(dateStr)) return 'Today';

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDubai = new Intl.DateTimeFormat('en-CA', { timeZone: DUBAI_TZ }).format(tomorrow);
    const targetDubai = new Intl.DateTimeFormat('en-CA', { timeZone: DUBAI_TZ }).format(new Date(dateStr));
    if (targetDubai === tomorrowDubai) return 'Tomorrow';

    return new Date(dateStr).toLocaleDateString('en-US', { timeZone: DUBAI_TZ, month: 'short', day: 'numeric' });
}

// Active Session card's primary CTA — swaps by real status so the therapist
// can advance a booking without opening the "View details" modal.
function primaryActionFor(booking) {
    if (!booking) return null;
    switch (booking.status) {
        case 'accepted': return { key: 'start',    label: 'Start Session',    loadingLabel: 'Starting…',   icon: PlayCircle   };
        case 'en_route': return { key: 'arrived',  label: 'Mark Arrived',     loadingLabel: 'Updating…',   icon: MapPin       };
        case 'arrived':  return { key: 'complete', label: 'Complete Session', loadingLabel: 'Completing…', icon: CheckCircle2 };
        default:          return null;
    }
}

function StatCard({ icon: Icon, label, value, accent, delay = 0 }) {
    return (
        <motion.article
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
            className="rounded-lg border border-border bg-card/55 px-4 py-4 backdrop-blur-xl lg:px-5"
            style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}
        >
            <div className="flex items-start justify-between gap-2">
                <div>
                    <p className="font-mono text-[10px] uppercase" style={{ color: 'var(--theme-text-muted)' }}>{label}</p>
                    <p className="mt-2 font-display text-2xl font-semibold sm:text-3xl" style={{ color: accent ?? '#e2b764' }}>
                        {value}
                    </p>
                </div>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: accent ? `${accent}18` : 'rgba(226,183,100,0.12)' }}>
                    <Icon size={16} style={{ color: accent ?? '#e2b764' }} />
                </div>
            </div>
        </motion.article>
    );
}

export default function Dashboard() {
    const { props } = usePage();
    const user = props.auth?.user;

    const [bookings, setBookings]             = useState([]);
    const [stats, setStats]                   = useState(null);
    const [loading, setLoading]               = useState(true);
    const [actionLoading, setActionLoading]   = useState(null);
    const [toast, setToast]                   = useState(null);
    const [selectedBooking, setSelectedBooking] = useState(null);

    // ── Data fetching — identical endpoints/shape to the real Dashboard.jsx ────
    const fetchStats = useCallback(() => {
        apiFetch('/therapist/api/bookings/stats').then(setStats).catch(console.error);
    }, []);

    const fetchBookings = useCallback(() => {
        setLoading(true);
        // pending_payment is still therapist-actionable (accept/reject) — see
        // Bookings.jsx TAB_STATUSES.pending — so it belongs in this fetch too.
        apiFetch('/therapist/api/bookings?status=pending,pending_payment,accepted,en_route,arrived&per_page=100')
            .then(data => setBookings(data.data || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchBookings();
        fetchStats();

        // ── WebSocket: same real-time listener as the real Dashboard.jsx ──────
        if (window.Echo && user?.id) {
            const channel = window.Echo.private(`therapist.${user.id}`);

            channel.listen('BookingStatusUpdated', (e) => {
                if (!e?.booking) return;
                const { status } = e.booking;

                setBookings(prev => {
                    if (['completed', 'rejected', 'cancelled'].includes(status)) {
                        return prev.filter(b => b.id !== e.booking.id);
                    }
                    const exists = prev.some(b => b.id === e.booking.id);
                    return exists
                        ? prev.map(b => b.id === e.booking.id ? { ...b, ...e.booking } : b)
                        : [...prev, e.booking];
                });

                setSelectedBooking(prev => prev?.id === e.booking.id ? { ...prev, ...e.booking } : prev);

                fetchStats();
            });

            return () => window.Echo.leave(`therapist.${user.id}`);
        }
    }, [fetchBookings, fetchStats, user?.id]);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    const patchBooking = useCallback((bookingId, patch) => {
        setBookings(prev => {
            const { status } = patch;
            if (['completed', 'rejected', 'cancelled'].includes(status)) {
                return prev.filter(b => b.id !== bookingId);
            }
            return prev.map(b => b.id === bookingId ? { ...b, ...patch } : b);
        });
        setSelectedBooking(prev => prev?.id === bookingId ? { ...prev, ...patch } : prev);
    }, []);

    const handleAction = useCallback(async (bookingId, action, body = {}) => {
        setActionLoading(`${bookingId}-${action}`);

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

            if (data.booking) {
                patchBooking(bookingId, data.booking);
            }

            fetchStats();

        } catch {
            showToast('Something went wrong. Please try again.', 'error');
            fetchBookings();
        } finally {
            setActionLoading(null);
        }
    }, [patchBooking, fetchBookings, fetchStats]);

    // ── Derived lists — identical logic to the real Dashboard.jsx ──────────────
    const activeBooking = bookings.find(b =>
        ['en_route', 'arrived'].includes(b.status) && isToday(b.scheduled_start)
    ) ?? null;

    // Backend's start() guard has NO "today" restriction — ANY booking still
    // en_route/arrived (even a stale one from a prior day that was never
    // marked complete) blocks starting a new session. Must match that exactly,
    // or the button stays enabled here while the server still rejects it.
    const anyActiveBooking = bookings.find(b => ['en_route', 'arrived'].includes(b.status)) ?? null;
    const hasActiveSession = !!anyActiveBooking;

    const todaysAccepted = bookings
        .filter(b => b.status === 'accepted' && isToday(b.scheduled_start))
        .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));

    const nextAccepted = todaysAccepted[0] ?? null;

    const todaysTimeline = bookings
        .filter(b => isToday(b.scheduled_start))
        .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));

    // ── Pending Approval — anything still awaiting a therapist decision,
    // regardless of date. Earliest-scheduled first so a same-day request
    // never gets buried under one scheduled weeks out.
    const pendingApproval = bookings
        .filter(b => ['pending', 'pending_payment'].includes(b.status))
        .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));
    const pendingPreview = pendingApproval.slice(0, 5);

    // ── Upcoming Bookings — confirmed sessions after today. Today's own
    // accepted bookings live in Today's Timeline instead, not here.
    const upcomingBookings = bookings
        .filter(b => b.status === 'accepted' && !isToday(b.scheduled_start))
        .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));
    const upcomingPreview = upcomingBookings.slice(0, 5);

    // Booking the Active Session card (and Quick Actions' Contact/View details) act on —
    // widened from just en_route/arrived to also cover an accepted-but-not-started booking,
    // so the card always has a "next step" action rather than only showing once a session
    // is already in progress.
    const focusBooking = activeBooking ?? nextAccepted;

    const primaryAction = primaryActionFor(focusBooking);
    const isPrimaryLoading = actionLoading === `${focusBooking?.id}-${primaryAction?.key}`;

    const isStartingNext = actionLoading === `${nextAccepted?.id}-start`;

    return (
        <TherapistLayout>
            <div className="px-4 py-5 sm:px-6 lg:px-8" style={{ background: 'var(--theme-bg)' }}>
                {/* Greeting lives once, in TherapistLayout's shared header — this is just the date. */}
                <div className="mb-5">
                    <p className="font-mono text-[10px] uppercase" style={{ color: 'var(--theme-text-muted)' }}>
                        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Dubai' })}
                    </p>
                </div>

                {/* ── Stat cards — real fields only ── */}
                {loading ? (
                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} className="h-24 rounded-lg animate-pulse" style={{ background: 'var(--theme-skeleton)' }} />
                        ))}
                    </div>
                ) : stats ? (
                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
                        <StatCard icon={Calendar}      label="Sessions Today"       value={stats.today_sessions}                            delay={0}    />
                        <StatCard icon={ClipboardList} label="Pending"              value={stats.pending_count}   accent="#f59e0b"          delay={0.05} />
                        <StatCard icon={Star}          label="Completed"            value={stats.completed_count} accent="#10b981"          delay={0.1}  />
                        <StatCard icon={Banknote}      label="This Week's Earnings" value={`AED ${stats.week_earnings?.toLocaleString()}`} accent="#3b82f6" delay={0.15} />
                    </div>
                ) : null}

                <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="min-w-0 space-y-5">
                        {/* ── Active session — real data, no Pause ── */}
                        <section className="relative overflow-hidden rounded-lg border p-5 backdrop-blur-2xl sm:p-7"
                            style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}>
                            <div className="absolute inset-y-0 left-0 w-1" style={{ background: 'rgba(226,183,100,0.7)' }} />

                            {!focusBooking ? (
                                <div className="flex flex-col items-center gap-3 py-8 text-center">
                                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                                        <Sparkles size={20} style={{ color: '#e2b764' }} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-2)' }}>No active session right now</p>
                                        <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                            Accepted bookings will show up here when it's time to start
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <span className={`h-2 w-2 rounded-full ${focusBooking.status !== 'accepted' ? 'animate-pulse' : ''}`} style={{ background: '#e2b764' }} />
                                            <span className="font-mono text-[11px] uppercase" style={{ color: '#e2b764' }}>
                                                {focusBooking.status === 'accepted' ? 'Up Next' : focusBooking.status === 'en_route' ? 'En Route' : 'Arrived'}
                                            </span>
                                        </div>
                                        <span className="font-mono text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
                                            {fmtDateTime(focusBooking.scheduled_start)}
                                        </span>
                                    </div>

                                    <div className="mt-5 flex flex-col justify-between gap-5 md:flex-row md:items-end">
                                        <div>
                                            <h2 className="font-display text-3xl leading-none sm:text-[40px]" style={{ color: 'var(--theme-text-head)' }}>
                                                {focusBooking.service?.name ?? '—'}
                                            </h2>
                                            <p className="mt-3 text-sm sm:text-base" style={{ color: 'var(--theme-text-2)' }}>
                                                {focusBooking.customer?.name ?? '—'}
                                                {getZone(focusBooking) && <> · {getZone(focusBooking)}</>}
                                            </p>
                                        </div>
                                        <div className="shrink-0 md:text-right">
                                            <p className="font-display text-3xl" style={{ color: 'var(--theme-text-head)' }}>{fmtTime(focusBooking.scheduled_start)}</p>
                                            {focusBooking.scheduled_end && (
                                                <p className="font-mono text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>until {fmtTime(focusBooking.scheduled_end)}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-6 flex flex-wrap gap-3">
                                        {primaryAction && (() => {
                                            const startBlocked = primaryAction.key === 'start' && hasActiveSession;
                                            const PrimaryIcon  = primaryAction.icon;
                                            return (
                                                <Button
                                                    variant="default"
                                                    disabled={startBlocked || !!actionLoading}
                                                    onClick={() => {
                                                        if (startBlocked || actionLoading) return;
                                                        handleAction(focusBooking.id, primaryAction.key);
                                                    }}
                                                    title={startBlocked
                                                        ? `You already have an active session with ${anyActiveBooking?.customer?.name ?? 'a client'} — mark it complete before starting another.`
                                                        : undefined}
                                                >
                                                    {isPrimaryLoading ? <Loader2 className="animate-spin" /> : <PrimaryIcon />}
                                                    {startBlocked ? 'Session already active' : isPrimaryLoading ? primaryAction.loadingLabel : primaryAction.label}
                                                </Button>
                                            );
                                        })()}
                                        {focusBooking.customer?.phone ? (
                                            <Button variant="outline" asChild>
                                                <a href={`tel:${focusBooking.customer.phone}`}><Phone />Contact client</a>
                                            </Button>
                                        ) : (
                                            <Button variant="outline" disabled><Phone />Contact client</Button>
                                        )}
                                        <Button variant="outline" onClick={() => setSelectedBooking(focusBooking)}>
                                            <Eye />View details
                                        </Button>
                                    </div>
                                </>
                            )}
                        </section>

                        {/* ── Pending Approval — highest-priority section besides Active Session.
                            "Action required, not an error" styling: gold left rail + amber badges,
                            same color language as STATUS_CONFIG.pending in Bookings.jsx, never red. ── */}
                        <section className="relative overflow-hidden rounded-lg border p-5 sm:p-6"
                            style={{ borderColor: 'rgba(245,158,11,0.35)', background: 'var(--theme-card)' }}>
                            <div className="absolute inset-y-0 left-0 w-1" style={{ background: '#f59e0b' }} />

                            <div className="mb-3 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <ClipboardList size={18} style={{ color: '#f59e0b' }} />
                                    <h2 className="font-display text-2xl" style={{ color: 'var(--theme-text-head)' }}>Pending Approval</h2>
                                    {pendingApproval.length > 0 && (
                                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full"
                                            style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                                            {pendingApproval.length}
                                        </span>
                                    )}
                                </div>
                                {pendingApproval.length > pendingPreview.length && (
                                    <Link href="/therapist/bookings?tab=pending"
                                        className="flex-shrink-0 flex items-center gap-0.5 text-xs font-semibold hover:opacity-80 transition-opacity"
                                        style={{ color: '#f59e0b' }}>
                                        View All Pending <ChevronRight size={14} />
                                    </Link>
                                )}
                            </div>

                            {loading ? (
                                <div className="space-y-2">
                                    {[0, 1].map(i => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--theme-skeleton)' }} />)}
                                </div>
                            ) : pendingPreview.length === 0 ? (
                                <p className="py-6 text-center text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                                    Nothing waiting on you — you're all caught up
                                </p>
                            ) : (
                                <ul className="space-y-2">
                                    {pendingPreview.map(booking => {
                                        const duration = booking.service_variant?.duration_minutes ?? booking.service?.duration_minutes ?? null;
                                        const zone = getZone(booking);
                                        const isAccepting = actionLoading === `${booking.id}-accept`;
                                        return (
                                            <li key={booking.id} className="flex items-center gap-3 rounded-xl border p-3"
                                                style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg)' }}>
                                                <div className="flex-shrink-0 w-16 text-center">
                                                    <p className="font-mono text-[10px] uppercase" style={{ color: 'var(--theme-text-muted)' }}>
                                                        {relativeDayLabel(booking.scheduled_start)}
                                                    </p>
                                                    <p className="font-mono text-xs font-semibold" style={{ color: '#f59e0b' }}>
                                                        {fmtTime(booking.scheduled_start)}
                                                    </p>
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--theme-text-head)' }}>
                                                        {booking.service?.name ?? '—'}
                                                    </p>
                                                    <p className="mt-0.5 text-xs truncate" style={{ color: 'var(--theme-text-muted)' }}>
                                                        {booking.customer?.name ?? 'Client'}
                                                        {duration ? ` · ${duration} min` : ''}
                                                        {zone ? ` · ${zone}` : ''}
                                                    </p>
                                                </div>

                                                <div className="flex-shrink-0 flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => handleAction(booking.id, 'accept')}
                                                        disabled={!!actionLoading}
                                                        title="Accept booking"
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                                                        style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', opacity: actionLoading && !isAccepting ? 0.5 : 1 }}
                                                    >
                                                        {isAccepting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                                    </button>
                                                    <button
                                                        onClick={() => setSelectedBooking(booking)}
                                                        disabled={!!actionLoading}
                                                        title="Review or decline"
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                                                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-muted)', opacity: actionLoading && !isAccepting ? 0.5 : 1 }}
                                                    >
                                                        <XCircle size={14} />
                                                    </button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </section>

                        {/* ── Today's Timeline — built client-side from fetched bookings ── */}
                        <section className="rounded-lg border p-5 backdrop-blur-xl sm:p-6"
                            style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}>
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="font-display text-2xl" style={{ color: 'var(--theme-text-head)' }}>Today's Timeline</h2>
                                <span className="font-mono text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>{fmtDate(new Date().toISOString())}</span>
                            </div>
                            {loading ? (
                                <div className="space-y-3">
                                    {[0, 1, 2].map(i => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--theme-skeleton)' }} />)}
                                </div>
                            ) : todaysTimeline.length === 0 ? (
                                <p className="py-6 text-center text-sm" style={{ color: 'var(--theme-text-muted)' }}>No sessions scheduled today</p>
                            ) : (
                                <ol>
                                    {todaysTimeline.map(booking => {
                                        const meta = timelineMeta(booking.status);
                                        return (
                                            <li key={booking.id} className="grid grid-cols-[64px_20px_1fr] gap-2 border-b py-3 last:border-0"
                                                style={{ borderColor: 'var(--theme-border)' }}>
                                                <time className="pt-0.5 font-mono text-xs" style={{ color: meta.color }}>{fmtTime(booking.scheduled_start)}</time>
                                                <span className={`mt-1.5 h-2 w-2 rounded-full ${meta.pulse ? 'animate-pulse' : ''}`} style={{ background: meta.color }} />
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="text-xs" style={{ color: meta.color }}>
                                                            {booking.status === 'completed' && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                                                            {meta.label}
                                                        </div>
                                                        <p className="mt-0.5 text-sm" style={{ color: 'var(--theme-text-head)' }}>
                                                            {booking.customer?.name ?? '—'} — {booking.service?.name ?? '—'}
                                                        </p>
                                                    </div>
                                                    {['pending', 'pending_payment'].includes(booking.status) && (
                                                        <button
                                                            onClick={() => setSelectedBooking(booking)}
                                                            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold hover:opacity-80 transition-opacity"
                                                            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}
                                                        >
                                                            <Eye size={11} />
                                                            Review request
                                                        </button>
                                                    )}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ol>
                            )}
                        </section>

                        {/* ── Upcoming Bookings — confirmed sessions after today. A preview
                            list only, not a calendar — Schedule page is the full source. ── */}
                        <section className="rounded-lg border p-5 backdrop-blur-xl sm:p-6"
                            style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}>
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <CalendarClock size={18} style={{ color: 'var(--theme-text-muted)' }} />
                                    <h2 className="font-display text-2xl" style={{ color: 'var(--theme-text-head)' }}>Upcoming Bookings</h2>
                                </div>
                                <Link href="/therapist/schedule"
                                    className="flex-shrink-0 flex items-center gap-0.5 text-xs font-semibold hover:opacity-80 transition-opacity"
                                    style={{ color: '#e2b764' }}>
                                    View Full Schedule <ChevronRight size={14} />
                                </Link>
                            </div>

                            {loading ? (
                                <div className="space-y-2">
                                    {[0, 1].map(i => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--theme-skeleton)' }} />)}
                                </div>
                            ) : upcomingPreview.length === 0 ? (
                                <p className="py-6 text-center text-sm" style={{ color: 'var(--theme-text-muted)' }}>No upcoming bookings yet</p>
                            ) : (
                                <ul>
                                    {upcomingPreview.map(booking => {
                                        const duration = booking.service_variant?.duration_minutes ?? booking.service?.duration_minutes ?? null;
                                        const zone = getZone(booking);
                                        return (
                                            <li key={booking.id}>
                                                <button
                                                    onClick={() => setSelectedBooking(booking)}
                                                    className="w-full flex items-center gap-3 border-b py-3 last:border-0 text-left hover:opacity-80 transition-opacity"
                                                    style={{ borderColor: 'var(--theme-border)' }}
                                                >
                                                    <div className="flex-shrink-0 w-16">
                                                        <p className="font-mono text-[10px] uppercase" style={{ color: 'var(--theme-text-muted)' }}>
                                                            {relativeDayLabel(booking.scheduled_start)}
                                                        </p>
                                                        <p className="font-mono text-xs" style={{ color: 'var(--theme-text-head)' }}>
                                                            {fmtTime(booking.scheduled_start)}
                                                        </p>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm truncate" style={{ color: 'var(--theme-text-head)' }}>
                                                            {booking.service?.name ?? '—'}
                                                        </p>
                                                        <p className="mt-0.5 text-xs truncate" style={{ color: 'var(--theme-text-muted)' }}>
                                                            {booking.customer?.name ?? '—'}
                                                            {duration ? ` · ${duration} min` : ''}
                                                            {zone ? ` · ${zone}` : ''}
                                                        </p>
                                                    </div>
                                                    <ChevronRight size={15} className="flex-shrink-0" style={{ color: 'var(--theme-text-muted)' }} />
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </section>
                    </div>

                    {/* ── Right column ── */}
                    <aside className="space-y-5">
                        <section className="rounded-lg border p-5" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}>
                            <h2 className="font-mono text-[11px] uppercase" style={{ color: 'var(--theme-text-muted)' }}>Quick actions</h2>
                            <div className="mt-4 space-y-2">
                                <Button
                                    className="w-full justify-between"
                                    variant="ghost"
                                    disabled={!nextAccepted || hasActiveSession || !!actionLoading}
                                    onClick={() => {
                                        // Guard again here, not just via `disabled` — belt and suspenders
                                        // against a stale render/HMR module slipping a click through.
                                        if (!nextAccepted || hasActiveSession || actionLoading) return;
                                        handleAction(nextAccepted.id, 'start');
                                    }}
                                    title={
                                        hasActiveSession
                                            ? `You already have an active session with ${anyActiveBooking?.customer?.name ?? 'a client'} (${anyActiveBooking?.status === 'arrived' ? 'arrived' : 'en route'}) — mark it complete before starting another.`
                                            : !nextAccepted
                                                ? 'No accepted bookings ready to start.'
                                                : undefined
                                    }
                                >
                                    <span className="flex items-center gap-2">
                                        {isStartingNext ? <Loader2 className="animate-spin" /> : <PlayCircle />}
                                        {hasActiveSession ? 'Session already active' : isStartingNext ? 'Starting…' : 'Start next session'}
                                    </span>
                                    <ChevronRight />
                                </Button>

                                {focusBooking?.customer?.phone ? (
                                    <Button className="w-full justify-between" variant="ghost" asChild>
                                        <a href={`tel:${focusBooking.customer.phone}`}>
                                            <span className="flex items-center gap-2"><Phone />Contact client</span>
                                            <ChevronRight />
                                        </a>
                                    </Button>
                                ) : (
                                    <Button className="w-full justify-between" variant="ghost" disabled>
                                        <span className="flex items-center gap-2"><Phone />Contact client</span>
                                        <ChevronRight />
                                    </Button>
                                )}

                                <Button
                                    className="w-full justify-between"
                                    variant="ghost"
                                    disabled={!focusBooking}
                                    onClick={() => focusBooking && setSelectedBooking(focusBooking)}
                                >
                                    <span className="flex items-center gap-2"><Eye />View details</span>
                                    <ChevronRight />
                                </Button>
                            </div>
                        </section>

                        <section className="rounded-lg border p-5" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}>
                            <div className="flex items-center justify-between">
                                <h2 className="font-mono text-[11px] uppercase" style={{ color: 'var(--theme-text-muted)' }}>This week</h2>
                                <CircleDollarSign className="h-4 w-4" style={{ color: '#e2b764' }} />
                            </div>
                            <p className="mt-4 font-display text-3xl" style={{ color: '#e2b764' }}>
                                {stats ? `AED ${stats.week_earnings?.toLocaleString()}` : '—'}
                            </p>
                        </section>

                        {focusBooking?.travel_time_minutes != null && (
                            <section className="rounded-lg border p-5" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}>
                                <div className="flex gap-3">
                                    <Clock3 className="mt-0.5 h-4 w-4" style={{ color: '#e2b764' }} />
                                    <div>
                                        <h2 className="text-sm font-medium" style={{ color: 'var(--theme-text-head)' }}>Travel window</h2>
                                        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--theme-text-muted)' }}>
                                            {focusBooking.travel_time_minutes} minutes reserved before your {fmtTime(focusBooking.scheduled_start)} appointment.
                                        </p>
                                    </div>
                                </div>
                            </section>
                        )}
                    </aside>
                </div>
            </div>

            {/* ── Booking detail modal — reused from Bookings.jsx, not rebuilt.
                A pending/pending_payment booking (reachable from Pending Approval
                or Today's Timeline's "Review request") gets the compact centered
                review modal; every other status keeps the full side-drawer with
                "View details" ── */}
            <AnimatePresence>
                {selectedBooking && (
                    ['pending', 'pending_payment'].includes(selectedBooking.status) ? (
                        <BookingReviewModal
                            booking={selectedBooking}
                            onClose={() => setSelectedBooking(null)}
                            onAction={handleAction}
                            actionLoading={actionLoading}
                        />
                    ) : (
                        <BookingModal
                            booking={selectedBooking}
                            onClose={() => setSelectedBooking(null)}
                            onAction={handleAction}
                            actionLoading={actionLoading}
                        />
                    )
                )}
            </AnimatePresence>

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
