import AuthenticatedLayout from '@/Layouts/CustomerLayout';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { router, usePage } from '@inertiajs/react';
import {
    Bell, LogOut, MapPin, Clock, Calendar,
    Star, ChevronRight, Sparkles, CheckCircle2,
    Navigation, User, CreditCard, Activity,
    Loader2, Banknote, Gift, X, Check, Heart,
    XCircle, WifiOff,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageToggle from '@/Components/Customer/LanguageToggle';
import ReviewModal from '@/Components/Customer/ReviewModal';
import ThemeToggle from '@/Components/ThemeToggle';
import { useBookingStatus } from '@/hooks/useBookingStatus';
import TherapistLiveMap from '@/Components/Customer/TherapistLiveMap';

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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// Compares a booking's scheduled_start against "now," both by their
// Asia/Dubai calendar date — matches the timezone convention already used
// server-side (e.g. CustomerDashboardController, AdminBookingController).
const dubaiDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' });
function isScheduledTodayDubai(isoDateString) {
    if (!isoDateString) return false;
    return dubaiDateFmt.format(new Date(isoDateString)) === dubaiDateFmt.format(new Date());
}

// Step keys must match the real `bookings.status` column values exactly
// (see the DB check constraint) — 'in_progress' was never a real status,
// so a completed booking could never match a step and always rendered as 0%.
const STATUS_STEPS = [
    { key: 'pending',    label: 'Pending',     icon: Clock        },
    { key: 'accepted',   label: 'Accepted',    icon: CheckCircle2 },
    { key: 'en_route',   label: 'On The Way',  icon: Navigation   },
    { key: 'arrived',    label: 'Arrived',     icon: MapPin       },
    { key: 'completed',  label: 'Completed',   icon: Sparkles     },
];

// Per-state GPS treatment for the booking card's message note only — the
// connection-status indicator itself (color/icon/freshness text) now lives
// solely in TherapistLiveMap's own map header, not duplicated here. This
// map only drives the note box's tint/icon/copy. Connecting (info/blue),
// Live (success/green, existing copy unchanged), Stale (warning/amber,
// tinted note box), Disconnected (danger/red, tinted note box). Only
// applies while isEnRoute — Arrived has its own unrelated message, untouched
// below.
const GPS_STATE_META = {
    connecting:   { color: '#3b82f6', noteBg: 'rgba(59,130,246,0.08)',  noteBorder: 'rgba(59,130,246,0.18)',  Icon: Loader2 },
    live:         { color: '#e2b764', noteBg: null,                     noteBorder: null,                      Icon: Navigation },
    stale:        { color: '#f59e0b', noteBg: 'rgba(245,158,11,0.08)',  noteBorder: 'rgba(245,158,11,0.2)',   Icon: Clock },
    disconnected: { color: '#ef4444', noteBg: 'rgba(239,68,68,0.08)',   noteBorder: 'rgba(239,68,68,0.2)',    Icon: WifiOff },
};

function gpsMessageCopy(status, therapistFirstName) {
    switch (status) {
        case 'connecting':
            return { title: 'Your therapist is on the way.', body: 'Their live location will appear in a moment.' };
        case 'stale':
            return { title: "We haven't had a location update for a few minutes.", body: `Your booking is still on track; the map shows ${therapistFirstName || 'their'} last known position.` };
        case 'disconnected':
            return { title: 'Live updates are paused while we reconnect.', body: "Your booking hasn't changed." };
        case 'live':
        default:
            return { title: 'Your therapist is on the way!', body: "Get ready — they'll arrive soon." };
    }
}

// booking/wsReady are now owned and kept live by the parent Dashboard (see
// its own useBookingStatus call) — not subscribed here — so the exact same
// subscription stays active across the whole pending→accepted→en_route→
// arrived lifetime instead of only existing while this component happens to
// be mounted. Completion detection has moved up to Dashboard for the same
// reason: it must fire regardless of which card (this one or
// UpcomingSessionCard) is currently rendered when the completed event
// arrives.
function StatusTracker({ booking }) {

    // Tracks a failed <img> load (broken/expired URL) separately from a
    // simply-missing avatar, so either case falls back to initials. Resets
    // whenever the photo URL itself changes, so a new booking's photo gets
    // its own chance to load rather than staying stuck on a prior failure.
    const [avatarFailed, setAvatarFailed] = useState(false);
    useEffect(() => {
        setAvatarFailed(false);
    }, [booking.therapist_avatar]);

    // GPS connection state (connecting/live/stale/disconnected), reported up
    // from TherapistLiveMap via onStatusChange — used only to pick this
    // card's message-note copy/tint/icon below (NOT for a status pill: the
    // one connection-status indicator lives in TherapistLiveMap's own map
    // header, not duplicated here). No second subscription — TherapistLiveMap/
    // useTherapistLiveLocation stays the only place that subscribes. Reset
    // whenever the booking leaves en_route so Arrived never shows a leftover
    // GPS message.
    const [gpsState, setGpsState] = useState(null);
    const handleGpsStatusChange = useCallback((next) => setGpsState(next), []);
    useEffect(() => {
        if (booking.status !== 'en_route') setGpsState(null);
    }, [booking.status]);

    // Local-only UI toggle for the floating booking info card — purely
    // presentational, never touches booking status or GPS state. Open by
    // default; resets to open whenever the customer switches to a different
    // booking (id change), so a collapsed card never silently carries over.
    // Only meaningful while isEnRoute (there's a map to declutter) — Arrived
    // has no map and always shows the card as before.
    const [cardVisible, setCardVisible] = useState(true);
    useEffect(() => {
        setCardVisible(true);
    }, [booking.id]);

    // pending_payment has no dedicated step — it's still "Pending" from the customer's view.
    const stepStatus = booking.status === 'pending_payment' ? 'pending' : booking.status;
    const currentIdx = STATUS_STEPS.findIndex(s => s.key === stepStatus);
    const progress   = currentIdx < 0 ? 0 : (currentIdx / (STATUS_STEPS.length - 1)) * 100;

    const STATUS_META = {
        pending:      { label: 'Pending Booking',     color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)' },
        accepted:     { label: 'Booking Confirmed',   color: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.2)'  },
        en_route:     { label: 'Therapist On The Way',color: '#e2b764', bg: 'rgba(226,183,100,0.1)', border: 'rgba(226,183,100,0.2)' },
        arrived:      { label: 'Therapist Arrived',   color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.2)'  },
        completed:    { label: 'Session Completed',   color: '#a855f7', bg: 'rgba(168,85,247,0.1)',  border: 'rgba(168,85,247,0.2)'  },
    };

    const meta = STATUS_META[stepStatus] ?? STATUS_META.pending;
    const isEnRoute = booking.status === 'en_route';
    const isArrived = booking.status === 'arrived';

    // Same initials derivation already used elsewhere (CustomerLayout.jsx
    // sidebar, Dashboard.jsx header) — therapist_avatar may be null for a
    // therapist who never uploaded a photo, so this is the fallback.
    const therapistInitials = booking.therapist
        ? booking.therapist.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
        : '';
    const therapistFirstName = booking.therapist?.trim().split(/\s+/)[0] ?? '';

    const gpsStatus      = gpsState?.status ?? null;
    const gpsMeta        = GPS_STATE_META[gpsStatus] ?? GPS_STATE_META.live;
    const { title: noteTitle, body: noteBody } = isEnRoute
        ? gpsMessageCopy(gpsStatus, therapistFirstName)
        : { title: 'Your therapist has arrived!', body: 'Enjoy your session.' };
    const NoteIcon = isEnRoute ? gpsMeta.Icon : MapPin;

    return (
        <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl border p-6 md:p-8"
            style={{ background: 'linear-gradient(135deg, var(--theme-card-hover) 0%, var(--theme-card) 100%)', borderColor: isEnRoute ? 'rgba(226,183,100,0.4)' : 'var(--theme-border)',
                boxShadow: isEnRoute ? '0 0 40px rgba(226,183,100,0.08)' : 'none',
                transition: 'border-color 0.5s, box-shadow 0.5s' }}
        >
            {/* Glow blob */}
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"
                style={{ background: `${meta.color}08` }} />

            <div className="relative z-10">

                {/* ── Map + floating tracking card ──────────────────────────
                    GPS v1 (docs/architecture/GPS-ARCHITECTURE.md): reuses
                    TherapistLiveMap/useTherapistLiveLocation as-is — it
                    renders itself only while isEnRoute and hides itself
                    automatically once status leaves en_route. The one
                    connection-status indicator (Connecting/Live/Stale/
                    Disconnected) lives in TherapistLiveMap's own map header
                    above the map canvas — it is NOT duplicated in the card
                    below, which only shows the booking-lifecycle tag (e.g.
                    "Therapist On The Way") and a GPS-aware message note.
                    onStatusChange still feeds that note's copy/tint/icon,
                    without a second subscription.

                    Desktop/tablet (≥640px, isEnRoute): the tracking card
                    floats over the map's top-right corner (mockups 01/02).
                    Positioned top-right specifically because Leaflet's zoom
                    control renders top-left inside TherapistLiveMap — the
                    two can never overlap, at any width, by construction.
                    The 48px top offset clears TherapistLiveMap's own
                    status header strip, which renders above its map
                    canvas, so this card never covers it either.

                    Mobile (<640px, isEnRoute): the card is NOT floated over
                    the map — it stacks below it with a small negative
                    margin, visually overlapping only the map's bottom edge
                    (where just the attribution text lives, never the
                    marker/zoom controls) rather than its top, per mockup 02.

                    When arrived (map not shown — TherapistLiveMap only
                    renders for isEnRoute): the card is a plain stacked
                    block, same as before this stage — there is no map to
                    float over. */}
                <div className="relative mb-5">
                    <AnimatePresence>
                        {isEnRoute && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <TherapistLiveMap booking={booking} responsiveHeight onStatusChange={handleGpsStatusChange} />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {(isEnRoute || isArrived) && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className={isEnRoute
                                    ? (cardVisible
                                        ? 'relative -mt-4 mx-3 lg:mx-0 lg:mt-0 lg:absolute lg:z-[700] lg:top-12 lg:right-5 lg:w-[360px] overflow-hidden'
                                        // Collapsed: no map-edge overlap on mobile (requirement 8 —
                                        // must never risk overlapping the map's zoom/attribution
                                        // controls), plain flow spacing instead; desktop keeps the
                                        // same floating slot the card itself uses, right-aligned.
                                        : 'relative mt-3 mx-3 flex justify-center lg:mx-0 lg:mt-0 lg:absolute lg:z-[700] lg:top-12 lg:right-5 lg:w-[360px] lg:justify-end')
                                    : 'relative overflow-hidden'}
                            >
                                {isArrived || cardVisible ? (
                                <div className="rounded-xl p-4 lg:p-5"
                                    style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>

                                    {/* Booking-lifecycle status tag, and — only while isEnRoute,
                                        where there's a map to declutter — a close button that
                                        hides just this card (not the map/marker/status indicator/
                                        zoom controls/attribution/progress tracker below). The GPS
                                        connection-status indicator is not duplicated here; it lives
                                        solely in TherapistLiveMap's own map header above. */}
                                    <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                                        <motion.div
                                            key={booking.status}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase"
                                            style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: meta.color }} />
                                            {meta.label}
                                        </motion.div>

                                        {isEnRoute && (
                                            <button
                                                type="button"
                                                onClick={() => setCardVisible(false)}
                                                aria-label="Hide booking details"
                                                aria-expanded="true"
                                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#e2b764]"
                                                style={{ color: 'var(--theme-text-muted)' }}
                                                onMouseEnter={e => { e.currentTarget.style.color = 'var(--theme-text-head)'; e.currentTarget.style.background = 'var(--theme-btn-bg)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--theme-text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                <X size={16} />
                                            </button>
                                        )}
                                    </div>

                                    <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--theme-text-muted)' }}>
                                        Today's Session
                                    </p>
                                    <h2 className="text-2xl font-display font-semibold mb-3" style={{ color: 'var(--theme-text-head)' }}>{booking.service}</h2>

                                    {/* Therapist photo (44-48px), full name and caption — stacked,
                                        not squeezed onto one inline line with other text. */}
                                    <div className="flex items-center gap-3">
                                        <span className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 inline-flex items-center justify-center"
                                            style={{ border: '1px solid var(--theme-border)' }}>
                                            {booking.therapist_avatar && !avatarFailed ? (
                                                <img
                                                    src={booking.therapist_avatar}
                                                    alt={`${booking.therapist}, your therapist`}
                                                    className="w-full h-full object-cover"
                                                    onError={() => setAvatarFailed(true)}
                                                />
                                            ) : (
                                                <span className="w-full h-full inline-flex items-center justify-center text-sm font-display font-bold"
                                                    style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}>
                                                    {therapistInitials}
                                                </span>
                                            )}
                                        </span>
                                        <div>
                                            <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>{booking.therapist}</p>
                                            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Your therapist</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between mt-4 pt-3 text-xs" style={{ borderTop: '1px solid var(--theme-border)' }}>
                                        <span className="font-bold uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>Scheduled</span>
                                        <span className="font-mono" style={{ color: 'var(--theme-text-2)' }}>{booking.datetime}</span>
                                    </div>

                                    {/* GPS-aware message note (mockups 03-06): copy, icon and —
                                        for stale/disconnected — a tinted box follow the live
                                        connection state while isEnRoute; Arrived keeps its own
                                        existing, unrelated message untouched. No extra hairline
                                        here — the Scheduled row above already provides the one
                                        divider the mockups show between sections. */}
                                    <div className="flex items-center gap-3 mt-4"
                                        style={isEnRoute && gpsMeta.noteBg
                                            ? { background: gpsMeta.noteBg, border: `1px solid ${gpsMeta.noteBorder}`, borderRadius: 10, padding: '12px' }
                                            : undefined}>
                                        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                            style={{
                                                background: isArrived ? 'rgba(59,130,246,0.15)' : `${gpsMeta.color}26`,
                                                color: isArrived ? '#3b82f6' : gpsMeta.color,
                                            }}>
                                            {isArrived
                                                ? <MapPin size={18} />
                                                : <NoteIcon size={18} className={gpsStatus === 'connecting' ? 'animate-spin' : gpsStatus === 'live' || gpsStatus === null ? 'animate-bounce' : ''} />}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold" style={{ color: isArrived ? '#3b82f6' : gpsMeta.color }}>
                                                {noteTitle}
                                            </p>
                                            <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-2)' }}>
                                                {noteBody}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setCardVisible(true)}
                                        aria-expanded="false"
                                        className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#e2b764]"
                                        style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-head)', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(226,183,100,0.5)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--theme-border)'; }}
                                    >
                                        Booking details
                                    </button>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── Progress bar + Steps ── */}
                <div className="relative">
                    <div className="absolute top-5 left-5 right-5 h-px hidden sm:block" style={{ background: 'var(--theme-border)' }} />
                    <motion.div
                        className="absolute top-5 left-5 h-px hidden sm:block"
                        initial={{ width: 0 }}
                        animate={{ width: `calc(${progress}% - 40px)` }}
                        transition={{ duration: 0.8, ease: 'easeInOut' }}
                        style={{ background: meta.color }}
                    />
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between gap-6 sm:gap-0">
                        {STATUS_STEPS.map((step, i) => {
                            const done   = i <= currentIdx;
                            const active = i === currentIdx;
                            const Icon   = step.icon;
                            return (
                                <motion.div
                                    key={step.key}
                                    className="flex sm:flex-col items-center gap-4 sm:gap-3"
                                    initial={false}
                                    animate={{ scale: active ? 1.05 : 1 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${active ? 'shadow-lg' : ''}`}
                                        style={{
                                            background: active ? meta.color : done ? `${meta.color}30` : 'var(--theme-border)',
                                            color:      active ? '#0b1120'  : done ? meta.color          : 'var(--theme-text-muted)',
                                            boxShadow:  active ? `0 0 20px ${meta.color}50` : 'none',
                                        }}>
                                        <Icon size={18} className={active && step.key === 'en_route' ? 'animate-bounce' : ''} />
                                    </div>
                                    <div className="sm:text-center">
                                        <p className={`text-sm font-medium ${active ? '' : 'hidden sm:block'}`} style={{ color: done ? 'var(--theme-text-head)' : 'var(--theme-text-muted)' }}>{step.label}</p>
                                        {active && (
                                            <motion.p
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="text-xs mt-0.5 sm:mt-1"
                                                style={{ color: meta.color }}
                                            >
                                                {step.key === 'en_route'   ? '🚗 Heading your way'  :
                                                 step.key === 'arrived'    ? '📍 They are here!'    :
                                                 step.key === 'completed'  ? '💆 Session complete'   :
                                                 'In progress'}
                                            </motion.p>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </motion.section>
    );
}

// ── Compact upcoming-session card ──────────────────────────────────────────
// Used for pending/accepted bookings (today or future-dated) and for any
// future-dated booking regardless of status — deliberately NOT the live
// StatusTracker, since only en_route/arrived get the prominent live view.
function UpcomingSessionCard({ booking, isToday }) {
    const isPendingLike = booking.status === 'pending' || booking.status === 'pending_payment';
    const isAccepted    = booking.status === 'accepted';

    const meta = isPendingLike
        ? { label: 'Pending Confirmation', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)' }
        : { label: 'Booking Confirmed',    color: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.2)'  };

    return (
        <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border p-6 md:p-7"
            style={{ borderColor: 'var(--theme-border)', background: 'linear-gradient(135deg, var(--theme-card-hover) 0%, var(--theme-card) 100%)' }}
        >
            <div className="flex items-center justify-between gap-3 mb-4">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase"
                    style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
                    {meta.label}
                </span>
                <button onClick={() => router.visit(route('my.bookings'))}
                    className="text-xs flex items-center gap-1 transition-colors flex-shrink-0" style={{ color: '#e2b764' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--theme-text-head)'}
                    onMouseLeave={e => e.currentTarget.style.color = '#e2b764'}
                >
                    View in My Bookings <ChevronRight size={12} />
                </button>
            </div>

            <h3 className="text-xl font-display font-semibold mb-2" style={{ color: 'var(--theme-text-head)' }}>{booking.service}</h3>
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm" style={{ color: 'var(--theme-text-2)' }}>
                <span className="flex items-center gap-2"><User size={14} /> {booking.therapist}</span>
                <span className="flex items-center gap-2"><Clock size={14} /> {booking.datetime}</span>
            </div>

            {/* Only shown for an accepted booking scheduled today — not a live
                tracker, just sets expectations for what happens next. */}
            {isToday && isAccepted && (
                <p className="mt-4 text-xs flex items-center gap-2 px-3 py-2.5 rounded-xl"
                    style={{ background: 'rgba(226,183,100,0.06)', color: '#e2b764', border: '1px solid rgba(226,183,100,0.15)' }}>
                    <Navigation size={12} /> Track therapist when en route.
                </p>
            )}
        </motion.section>
    );
}

// ── Brief, dismissible "session completed" confirmation ───────────────────
// Inline (not a modal/overlay) so it never blocks navigation or traps the
// customer — auto-dismisses after ~4s, or immediately on manual dismiss.
function SessionCompletedConfirmation({ booking, onDismiss }) {
    useEffect(() => {
        const timeout = setTimeout(() => onDismiss?.(), 4000);
        return () => clearTimeout(timeout);
    }, [onDismiss]);

    return (
        <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="relative overflow-hidden rounded-2xl p-6 flex items-center gap-4"
            style={{ background: 'linear-gradient(135deg, var(--theme-card-hover) 0%, var(--theme-card) 100%)', border: '1px solid rgba(168,85,247,0.3)' }}
        >
            <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #a855f7, #c084fc)', boxShadow: '0 0 24px rgba(168,85,247,0.3)' }}>
                <Check size={22} style={{ color: '#0b1120', strokeWidth: 3 }} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#a855f7' }}>Session Completed!</p>
                <p className="text-sm" style={{ color: 'var(--theme-text)' }}>
                    {booking?.service ? `Your ${booking.service} session is done — it's` : 'Your session is done — it\'s'} now in your booking history.
                </p>
            </div>
            <button onClick={() => onDismiss?.()}
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-muted)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--theme-text-head)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--theme-text-muted)'}
                aria-label="Dismiss"
            >
                <X size={14} />
            </button>
        </motion.section>
    );
}

function UsualBookingCard({ yourUsual }) {
    return (
        <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-display font-semibold" style={{ color: 'var(--theme-text-head)' }}>Your Usual?</h2>
            </div>
            <div className="group relative rounded-2xl border p-6 md:p-8 overflow-hidden transition-all"
                style={{ borderColor: 'rgba(226,183,100,0.3)', background: 'linear-gradient(135deg, var(--theme-card-hover) 0%, var(--theme-card) 100%)' }}>
                <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                    <Sparkles size={120} style={{ color: '#e2b764' }} />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                                style={{ background: '#e2b764', color: '#0b1120' }}>Auto-Detected</span>
                            <span className="text-sm" style={{ color: 'var(--theme-text-2)' }}>Based on your history</span>
                        </div>
                        <h3 className="text-2xl font-display font-semibold mb-4" style={{ color: 'var(--theme-text-head)' }}>{yourUsual.service?.name}</h3>
                        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm" style={{ color: 'var(--theme-text)' }}>
                            {yourUsual.therapist?.name && <div className="flex items-center gap-2"><User size={14} style={{ color: '#e2b764' }} />{yourUsual.therapist.name}</div>}
                            {yourUsual.time && <div className="flex items-center gap-2"><Clock size={14} style={{ color: '#e2b764' }} />{yourUsual.time}</div>}
                            {yourUsual.location && <div className="flex items-center gap-2"><MapPin size={14} style={{ color: '#e2b764' }} />{yourUsual.location}</div>}
                        </div>
                    </div>
                    <button onClick={() => router.visit(route('bookings'))}
                        className="shrink-0 w-full md:w-auto px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                        style={{ background: '#e2b764', color: '#0b1120', boxShadow: '0 8px 20px rgba(226,183,100,0.3)' }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 8px 30px rgba(226,183,100,0.5)'}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 8px 20px rgba(226,183,100,0.3)'}
                    >
                        <Sparkles size={18} /> 1-Click Book
                    </button>
                </div>
            </div>
        </motion.section>
    );
}

function TherapistCard({ therapist }) {
    return (
        <div className="flex items-center gap-4 p-4 rounded-xl border transition-colors group cursor-pointer"
            style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--theme-btn-bg)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--theme-card)'}
        >
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-display font-bold flex-shrink-0 border-2"
                style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764, #f0c97a)', borderColor: 'var(--theme-border)', color: '#0b1120' }}>
                {therapist.avatar}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium truncate" style={{ color: 'var(--theme-text-head)' }}>{therapist.name}</h4>
                    {therapist.familiar && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border flex-shrink-0"
                            style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', borderColor: 'rgba(59,130,246,0.2)' }}>
                            Familiar
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3 text-xs mb-2" style={{ color: 'var(--theme-text-2)' }}>
                    <span className="flex items-center gap-1" style={{ color: '#e2b764' }}>
                        <Star size={12} className="fill-current" /> {therapist.rating}
                    </span>
                    <span>{therapist.experience} yrs</span>
                    <span>{therapist.gender === 'female' ? '♀ Female' : '♂ Male'}</span>
                </div>
                <button onClick={() => router.visit(route('bookings'))}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all w-full sm:w-auto"
                    style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-head)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#e2b764'; e.currentTarget.style.color = '#0b1120'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--theme-btn-bg)'; e.currentTarget.style.color = 'var(--theme-text-head)'; }}
                >
                    Book Now
                </button>
            </div>
        </div>
    );
}

function RecentActivityItem({ item }) {
    return (
        <div className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b last:border-0"
            style={{ borderColor: 'var(--theme-border)' }}>
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)' }}>
                    <Calendar size={20} />
                </div>
                <div>
                    <h4 className="font-medium mb-1" style={{ color: 'var(--theme-text-head)' }}>{item.service}</h4>
                    <p className="text-sm" style={{ color: 'var(--theme-text-2)' }}>{item.datetime} • {item.therapist} • {item.duration} mins</p>
                </div>
            </div>
            <button onClick={() => router.visit(route('my.bookings'))}
                className="shrink-0 px-4 py-2 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-all"
                style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(226,183,100,0.5)'; e.currentTarget.style.color = 'var(--theme-link)'; e.currentTarget.style.background = 'rgba(226,183,100,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--theme-border)'; e.currentTarget.style.color = 'var(--theme-text)'; e.currentTarget.style.background = 'transparent'; }}
            >
                Book Again
            </button>
        </div>
    );
}

function PreferenceItem({ icon: Icon, label, value }) {
    return (
        <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)' }}>
                <Icon size={14} />
            </div>
            <div>
                <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{label}</div>
                <div className="text-sm font-medium" style={{ color: 'var(--theme-text-head)' }}>{value}</div>
            </div>
        </div>
    );
}

// ── Replace your existing LoyaltyWidget function with this ───────────────────
// Make sure these are imported at the top of Dashboard.jsx:
// import { Activity, Gift, CheckCircle2, Loader2, Sparkles } from 'lucide-react';

function LoyaltyWidget({ loyalty, onRedeemed }) {
    const [claiming, setClaiming] = useState(false);
    const [claimed,  setClaimed]  = useState(false);

    const count     = loyalty?.completed_count    ?? 0;
    const goal      = loyalty?.bookings_required  ?? 10;
    const remaining = loyalty?.bookings_remaining ?? 10;
    const pct       = loyalty?.progress_percentage ?? 0;
    const status    = loyalty?.status             ?? 'in_progress';
    const cycle     = loyalty?.reward_cycle       ?? 1;
    const totalDone = loyalty?.total_completed    ?? 0;
    const redeemed  = loyalty?.total_redeemed     ?? 0;
    const isAvailable = status === 'available';
    const hasVoucher  = status === 'voucher_issued' || !!loyalty?.active_voucher;
    const voucher     = loyalty?.active_voucher;

    // Estimate relaxation hours — average 90 mins per session
    const relaxHours = totalDone > 0 ? Math.round((totalDone * 90) / 60) : 0;

    const handleClaim = async () => {
        setClaiming(true);
        try {
            const res = await fetch('/api/loyalty/claim', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-XSRF-TOKEN': decodeURIComponent(
                        document.cookie.split('; ').find(r => r.startsWith('XSRF-TOKEN='))?.split('=')[1] ?? ''
                    ),
                },
            });
            const data = await res.json();
            if (data.success) {
                setClaimed(true);
                onRedeemed?.();
            }
        } catch (e) {
            console.error('Redeem failed:', e);
        } finally {
            setClaiming(false);
        }
    };

    return (
        <div className="rounded-2xl border overflow-hidden"
            style={{ background: 'var(--theme-card)', borderColor: isAvailable ? 'rgba(226,183,100,0.4)' : 'var(--theme-border)' }}>

            {/* ── Reward available banner ── */}
            {isAvailable && !claimed && (
                <div className="px-5 py-3 flex items-center gap-2"
                    style={{ background: 'linear-gradient(135deg, rgba(183,136,42,0.2), rgba(226,183,100,0.12))' }}>
                    <Gift size={14} style={{ color: '#e2b764', flexShrink: 0 }} />
                    <p className="text-xs font-semibold" style={{ color: '#e2b764' }}>
                        🎉 Your free session is ready to claim!
                    </p>
                </div>
            )}

            {/* ── Claimed success banner ── */}
            {claimed && (
                <div className="px-5 py-3 flex items-center gap-2"
                    style={{ background: 'rgba(34,197,94,0.1)' }}>
                    <CheckCircle2 size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
                    <p className="text-xs font-semibold" style={{ color: '#22c55e' }}>
                        Reward claimed! Cycle {cycle + 1} has started. 🎊
                    </p>
                </div>
            )}

            <div className="p-6">
                {/* ── Header ── */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: 'rgba(226,183,100,0.1)', color: '#e2b764' }}>
                            <Activity size={16} />
                        </div>
                        <h3 className="font-display font-semibold" style={{ color: 'var(--theme-text-head)' }}>Wellness Journey</h3>
                    </div>
                    {cycle > 1 && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                            style={{ background: 'var(--theme-tag-gold-bg)', color: 'var(--theme-link)', border: '1px solid var(--theme-tag-gold-border)' }}>
                            Cycle {cycle}
                        </span>
                    )}
                </div>

                {/* ── Progress ── */}
                <div className="mb-5">
                    <div className="flex justify-between text-sm mb-2">
                        <span style={{ color: 'var(--theme-text)' }}>Sessions completed</span>
                        <span className="font-semibold" style={{ color: 'var(--theme-link)' }}>
                            {count}/{goal} Bookings
                        </span>
                    </div>

                    {/* Progress bar */}
                    <div className="h-2.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--theme-border)' }}>
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
                            className="h-full rounded-full"
                            style={{
                                background: isAvailable
                                    ? 'linear-gradient(90deg, #b7882a, #e2b764, #f5d78e)'
                                    : 'linear-gradient(90deg, #b7882a, #e2b764)',
                            }}
                        />
                    </div>

                    {/* Status message */}
                    <div className="mt-2.5">
                        {isAvailable && !claimed ? (
                            <p className="text-xs font-medium" style={{ color: 'var(--theme-link)' }}>
                                ✨ Congratulations! You've earned a complimentary 60-min session.
                            </p>
                        ) : claimed ? (
                            <p className="text-xs" style={{ color: '#22c55e' }}>
                                Starting fresh — 10 more sessions to your next free reward!
                            </p>
                        ) : (
                            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                                Just{' '}
                                <strong style={{ color: 'var(--theme-text-head)' }}>{remaining} more {remaining === 1 ? 'booking' : 'bookings'}</strong>
                                {' '}to unlock a complimentary 60-min upgrade.
                            </p>
                        )}
                    </div>
                </div>

                {/* Claim button — kapag available pa lang */}
                {isAvailable && !claimed && (
                    <button
                        onClick={handleClaim}
                        disabled={claiming}
                        className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mb-5 transition-opacity disabled:opacity-70"
                        style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: 'var(--theme-cta-ink)' }}
                    >
                        {claiming
                            ? <Loader2 size={15} className="animate-spin" />
                            : <Sparkles size={15} />
                        }
                        {claiming ? 'Claiming...' : 'Claim Free Session'}
                    </button>
                )}

                {/* Voucher code display — kapag may voucher na */}
                {hasVoucher && voucher && (
                    <div className="mb-5 p-4 rounded-xl text-center"
                        style={{ background: 'rgba(226,183,100,0.1)', border: '1px solid rgba(226,183,100,0.3)' }}>
                        <p className="text-xs mb-2" style={{ color: 'var(--theme-text-2)' }}>Your voucher code</p>
                        <p className="text-2xl font-display font-bold tracking-widest mb-1" style={{ color: '#e2b764' }}>
                            {voucher.code}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--theme-text-2)' }}>
                            Valid for any 60-min service · Expires {voucher.expires_at}
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'var(--theme-text-muted)' }}>
                            {voucher.days_until_expiry} days remaining
                        </p>
                        {/* Copy button */}
                        <button
                            onClick={() => navigator.clipboard.writeText(voucher.code)}
                            className="mt-3 px-4 py-1.5 rounded-lg text-xs font-semibold"
                            style={{ background: 'rgba(226,183,100,0.15)', border: '1px solid rgba(226,183,100,0.3)', color: '#e2b764' }}>
                            📋 Copy Code
                        </button>
                    </div>
                )}

                {/* ── Stats ── */}
                <div className="pt-5 border-t" style={{ borderColor: 'var(--theme-border)' }}>
                    <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--theme-text-head)' }}>Your Stats</h4>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl text-center" style={{ background: 'var(--theme-btn-bg)' }}>
                            <div className="text-2xl font-display mb-0.5" style={{ color: 'var(--theme-text-head)' }}>
                                {relaxHours > 0 ? `${relaxHours}h` : '0h'}
                            </div>
                            <div className="text-xs" style={{ color: 'var(--theme-text-2)' }}>Relaxation Time</div>
                        </div>
                        <div className="p-3 rounded-xl text-center" style={{ background: 'var(--theme-btn-bg)' }}>
                            <div className="text-2xl font-display mb-0.5" style={{ color: 'var(--theme-text-head)' }}>{totalDone}</div>
                            <div className="text-xs" style={{ color: 'var(--theme-text-2)' }}>Total Sessions</div>
                        </div>
                    </div>

                    {/* Redeemed count */}
                    {redeemed > 0 && (
                        <div className="mt-3 flex items-center justify-center gap-1.5 py-2 rounded-xl"
                            style={{ background: 'rgba(226,183,100,0.06)', border: '1px solid rgba(226,183,100,0.12)' }}>
                            <Gift size={12} style={{ color: '#e2b764' }} />
                            <p className="text-xs" style={{ color: '#e2b764' }}>
                                {redeemed} free {redeemed === 1 ? 'session' : 'sessions'} redeemed
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Compact wishlist preview row — mirrors RecentActivityItem's border-b
// last:border-0 pattern for the divider between rows. Navigates to the
// full Wishlist page; never books directly from the dashboard. ────────────
function WishlistPreviewItem({ item }) {
    const service = item.service;
    const name = service?.name ?? 'Service';
    const activeVariants = (service?.variants ?? []).filter(v => v.is_active);
    const isUnavailable = !service || !service.is_active || !!service.archived_at || activeVariants.length === 0;
    const minPrice = activeVariants.length ? Math.min(...activeVariants.map(v => Number(v.price))) : null;
    const imageUrl = service?.image ? `/storage/${service.image}` : null;

    return (
        <button
            onClick={() => router.visit(route('wishlist'))}
            className="w-full flex items-center gap-3 py-3 text-left transition-colors border-b last:border-0"
            style={{ borderColor: 'var(--theme-border)' }}
        >
            <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center relative"
                style={{ background: 'var(--theme-btn-bg)' }}>
                {imageUrl ? (
                    <img src={imageUrl} alt={name} className="w-full h-full object-cover" style={{ opacity: isUnavailable ? 0.45 : 1 }} />
                ) : (
                    <Heart size={16} style={{ color: 'var(--theme-border)' }} />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--theme-text-head)' }}>{name}</p>
                {isUnavailable ? (
                    <p className="text-xs" style={{ color: '#f87171' }}>Currently unavailable</p>
                ) : (
                    <p className="text-xs" style={{ color: 'var(--theme-text-2)' }}>
                        From AED {minPrice.toLocaleString()}
                    </p>
                )}
            </div>
            <ChevronRight size={14} style={{ color: 'var(--theme-text-muted)', flexShrink: 0 }} />
        </button>
    );
}

// ── My Wishlist dashboard summary — compact preview only, not a second
// Wishlist page. Loads /api/wishlist independently so a failure here never
// blocks the rest of the dashboard (see Dashboard()'s own useEffect). ─────
function WishlistWidget({ items, loading, error }) {
    const preview = items.slice(0, 3);
    const count = items.length;

    return (
        <div className="p-6 rounded-2xl border" style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}>
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                    <Heart size={16} style={{ color: '#e2b764' }} fill="#e2b764" />
                    <h3 className="font-display font-semibold" style={{ color: 'var(--theme-text-head)' }}>My Wishlist</h3>
                </div>
                {!loading && !error && count > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: 'var(--theme-tag-gold-bg)', color: 'var(--theme-link)' }}>
                        {count} saved
                    </span>
                )}
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--theme-text-muted)' }}>Your saved services for later.</p>

            {loading ? (
                <div className="space-y-3">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-lg animate-pulse flex-shrink-0" style={{ background: 'var(--theme-skeleton)' }} />
                            <div className="flex-1 space-y-1.5">
                                <div className="h-3 rounded animate-pulse" style={{ background: 'var(--theme-skeleton)', width: '70%' }} />
                                <div className="h-2.5 rounded animate-pulse" style={{ background: 'var(--theme-skeleton)', width: '40%' }} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : error ? (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--theme-text-muted)' }}>
                    Couldn't load your wishlist right now.
                </p>
            ) : count === 0 ? (
                <div className="py-4 text-center">
                    <Heart size={24} className="mx-auto mb-2" style={{ color: 'var(--theme-border)' }} />
                    <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--theme-text-muted)' }}>
                        No saved services yet.<br />Save your favorite treatments for later.
                    </p>
                    <button onClick={() => router.visit(route('services'))}
                        className="text-xs font-semibold px-4 py-2 rounded-xl transition-all"
                        style={{ background: 'var(--theme-cta)', color: 'var(--theme-cta-ink)' }}>
                        Browse Services
                    </button>
                </div>
            ) : (
                <>
                    <div>
                        {preview.map(item => <WishlistPreviewItem key={item.id} item={item} />)}
                    </div>
                    <button onClick={() => router.visit(route('wishlist'))}
                        className="w-full mt-3 pt-3 border-t text-sm flex items-center justify-center gap-1 transition-colors"
                        style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-link)' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--theme-text-head)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--theme-link)'}
                    >
                        View Wishlist <ChevronRight size={14} />
                    </button>
                </>
            )}
        </div>
    );
}

function AutoPreferencesWidget({ prefs }) {
    return (
        <div className="p-6 rounded-2xl border" style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}>
            <h3 className="font-display font-semibold mb-6" style={{ color: 'var(--theme-text-head)' }}>Auto-Preferences</h3>
            <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--theme-text-2)' }}>
                We've learned what you love. These preferences are automatically applied to speed up your booking.
            </p>
            {prefs ? (
                <div className="space-y-4">
                    {prefs.time && <PreferenceItem icon={Clock} label="Preferred Time" value={prefs.time} />}
                    {prefs.location && <PreferenceItem icon={MapPin} label="Favorite Location" value={`Home (${prefs.location})`} />}
                    {prefs.payment && <PreferenceItem icon={prefs.payment === 'Cashless' ? CreditCard : Banknote} label="Preferred Payment" value={prefs.payment} />}
                </div>
            ) : (
                <p className="text-sm text-center py-4" style={{ color: 'var(--theme-text-muted)' }}>Complete your first booking to unlock personalized preferences!</p>
            )}
            <button onClick={() => router.visit(route('my.profile'))}
                className="w-full mt-6 py-2 text-sm transition-colors"
                style={{ color: 'var(--theme-text-2)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--theme-text-head)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--theme-text-2)'}
            >
                Manage Preferences
            </button>
        </div>
    );
}

// ── Notification icon/color ─────────────────────────────────────────────────
// Reuses the exact `icon`/`color` fields already sent by BookingNotification
// (see app/Notifications/BookingNotification.php) and the same brand hex
// values already used for status badges elsewhere in the app.
const NOTIF_ICONS = {
    'check-circle': CheckCircle2,
    'x-circle':     XCircle,
    navigation:     Navigation,
    'map-pin':      MapPin,
    star:           Star,
    check:          Check,
    bell:           Bell,
};
const NOTIF_COLORS = {
    green: '#10b981',
    red:   '#f87171',
    blue:  '#3b82f6',
    gold:  '#e2b764',
    gray:  '#94a3b8',
};

function NotifIcon({ icon, color }) {
    const Icon = NOTIF_ICONS[icon] ?? Bell;
    const hex  = NOTIF_COLORS[color] ?? NOTIF_COLORS.gray;

    return (
        <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${hex}1a`, color: hex }}
        >
            <Icon size={13} />
        </div>
    );
}

export default function Dashboard() {
    const { t } = useLanguage();
    const { props } = usePage();

    const [data,               setData]               = useState(null);
    const [loading,            setLoading]            = useState(true);
    const [avatarUrl,          setAvatarUrl]          = useState(null);
    const [userProfile,        setUserProfile]        = useState(null);
    const [pendingReview,      setPendingReview]      = useState(null);
    const [showReviewModal,    setShowReviewModal]    = useState(false);
    const [showNotifications,  setShowNotifications]  = useState(false);
    const [notifications,      setNotifications]      = useState([]);
    const [unreadCount,        setUnreadCount]        = useState(0);
    const [justCompletedBooking, setJustCompletedBooking] = useState(null);

    // Coordinates the "Session Completed!" confirmation's dismissal with the
    // dashboard-data refresh it kicks off, so dismissing can never reveal a
    // stale upcoming_booking that still says en_route/arrived (see
    // handleUpcomingCompleted/handleCompletedDismiss below). `refreshSettled`
    // defaults true since no completion refresh is in flight until one starts.
    const [refreshSettled,     setRefreshSettled]     = useState(true);
    const timerElapsedRef     = useRef(true);
    const refreshSeqRef       = useRef(0);
    const completionGuardRef  = useRef(null);

    const [wishlistItems,      setWishlistItems]      = useState([]);
    const [wishlistLoading,    setWishlistLoading]    = useState(true);
    const [wishlistError,      setWishlistError]      = useState(false);

    const fetchNotifications = useCallback(() => {
        apiFetch('/api/notifications')
            .then(data => {
                setNotifications(data.notifications ?? []);
                setUnreadCount(data.unread_count ?? 0);
            })
            .catch(console.error);
    }, []);

    useEffect(() => {
        apiFetch('/api/dashboard-data')
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));

        apiFetch('/api/reviews/pending')
            .then(reviews => {
                if (reviews.length > 0) {
                    setPendingReview(reviews[0]);
                    setShowReviewModal(true);
                }
            })
            .catch(console.error);

        fetchNotifications();

        // Independent of dashboard-data — a wishlist failure never blocks
        // the rest of the page. Already ordered newest-first by the API.
        apiFetch('/api/wishlist')
            .then(setWishlistItems)
            .catch(() => setWishlistError(true))
            .finally(() => setWishlistLoading(false));
    }, []);

    useEffect(() => {
        apiFetch('/api/profile-data')
            .then(data => { setUserProfile(data); setAvatarUrl(data.avatar); })
            .catch(console.error);
    }, []);

    const handleMarkAllRead = useCallback(async () => {
        await apiFetch('/api/notifications/read-all', { method: 'POST' });
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
    }, []);

    const handleNotifClick = useCallback(async (notif) => {
        if (!notif.read) {
            await apiFetch(`/api/notifications/${notif.id}/read`, { method: 'POST' });
            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        }
        setShowNotifications(false);
        router.visit(notif.url ?? '/my-bookings');
    }, []);

    const handleLogout = () => router.post(route('logout'));

    // Actually clears the confirmation and checks for a pending review — only
    // ever called once both the 4s display timer has elapsed AND the
    // post-completion dashboard-data refresh has settled (success or
    // failure), so data.upcoming_booking can never still be the stale
    // pre-completion snapshot at the moment the confirmation goes away.
    const finalizeDismiss = useCallback(() => {
        setJustCompletedBooking(null);
        apiFetch('/api/reviews/pending')
            .then(reviews => {
                if (reviews.length > 0) {
                    setPendingReview(reviews[0]);
                    setShowReviewModal(true);
                }
            })
            .catch(console.error);
    }, []);

    // Booking just transitioned to completed — show the brief confirmation
    // first, then refresh the underlying data. completionGuardRef ignores a
    // duplicate signal for the same booking id (e.g. StrictMode's double
    // effect invoke, or StatusTracker remounting mid-transition) so it can
    // never restart the timer/refresh or fire an overlapping fetch for a
    // booking already being handled.
    const handleUpcomingCompleted = useCallback((completedBooking) => {
        const bookingId = completedBooking?.id ?? data?.upcoming_booking?.id ?? null;
        if (bookingId !== null && completionGuardRef.current === bookingId) return;
        completionGuardRef.current = bookingId;

        setJustCompletedBooking(completedBooking ?? data?.upcoming_booking ?? null);
        timerElapsedRef.current = false;
        setRefreshSettled(false);

        const seq = ++refreshSeqRef.current;
        apiFetch('/api/dashboard-data')
            .then(fresh => {
                // Only the most recent refresh may apply — an older,
                // slower-resolving request must never overwrite a newer
                // result (out-of-order response protection).
                if (seq === refreshSeqRef.current) setData(fresh);
            })
            .catch((err) => {
                console.error('[Dashboard] post-completion refresh failed', err);
                // A failed refresh must never resurrect the just-completed
                // booking — trust the WebSocket-confirmed completion for
                // this one booking even though the refresh itself didn't
                // succeed, rather than leaving the stale pre-completion
                // snapshot in place.
                if (seq === refreshSeqRef.current) {
                    setData(prev => (prev?.upcoming_booking?.id === bookingId
                        ? { ...prev, upcoming_booking: null }
                        : prev));
                }
            })
            .finally(() => {
                if (seq === refreshSeqRef.current) setRefreshSettled(true);
            });
    }, [data?.upcoming_booking]);

    // Called when the confirmation's 4s timer elapses or it's dismissed
    // manually. If the refresh above hasn't settled yet, wait for it instead
    // of dismissing immediately — the effect below finalizes as soon as it
    // does — so stale en_route/arrived data is never revealed in between.
    const handleCompletedDismiss = useCallback(() => {
        timerElapsedRef.current = true;
        if (refreshSettled) finalizeDismiss();
    }, [refreshSettled, finalizeDismiss]);

    useEffect(() => {
        if (refreshSettled && timerElapsedRef.current && justCompletedBooking) {
            finalizeDismiss();
        }
    }, [refreshSettled, justCompletedBooking, finalizeDismiss]);

    // ── Booking-status realtime subscription (parent-owned) ──────────────
    // Previously this subscription lived inside StatusTracker, which itself
    // only ever mounted once data.upcoming_booking.status was already
    // en_route/arrived — so Accept (→accepted) and Start Session
    // (→en_route) fired their broadcasts while nothing on the customer side
    // was listening yet, and only a manual refresh could reveal them. Owning
    // it here instead keeps exactly one subscription active for the entire
    // lifetime of having any upcoming booking at all, pending through
    // completed, so every transition renders live.
    const { booking: liveUpcomingBooking, wsReady } = useBookingStatus(data?.upcoming_booking);
    const prevUpcomingRef = useRef({ id: null, status: null });

    useEffect(() => {
        if (!liveUpcomingBooking?.id) return;
        // Stale/mismatched guard — only act on this if it's still the exact
        // booking currently shown; an id change is handled by
        // useBookingStatus's own effect re-subscribing, not by this one.
        if (data?.upcoming_booking?.id !== liveUpcomingBooking.id) return;

        const isNewBooking = prevUpcomingRef.current.id !== liveUpcomingBooking.id;
        const prevStatus   = isNewBooking ? null : prevUpcomingRef.current.status;
        prevUpcomingRef.current = { id: liveUpcomingBooking.id, status: liveUpcomingBooking.status };

        // A transition into completed goes through the existing confirmation
        // + race-protected refetch flow directly — completed must never be
        // written into data.upcoming_booking itself, since that would let
        // the render ternary fall through to UpcomingSessionCard/StatusTracker
        // with a completed booking for a frame before the confirmation can
        // take over. handleUpcomingCompleted's own completionGuardRef still
        // protects against a duplicate/overlapping call here.
        if (!isNewBooking && prevStatus !== 'completed' && liveUpcomingBooking.status === 'completed') {
            handleUpcomingCompleted(liveUpcomingBooking);
            return;
        }

        if (liveUpcomingBooking.status !== data.upcoming_booking.status) {
            setData(prev => (prev?.upcoming_booking?.id === liveUpcomingBooking.id
                ? { ...prev, upcoming_booking: { ...prev.upcoming_booking, status: liveUpcomingBooking.status } }
                : prev));
        }
    }, [liveUpcomingBooking?.id, liveUpcomingBooking?.status]);

    const user     = props.auth?.user;
    const initials = userProfile?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                  ?? user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                  ?? 'U';

    const hour     = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    if (loading) return (
        <AuthenticatedLayout>
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-gold" />
            </div>
        </AuthenticatedLayout>
    );

    const upcoming  = data?.upcoming_booking;
    const yourUsual = data?.your_usual;
    const prefs     = data?.preferences;
    const stats     = data?.stats;

    return (
        <AuthenticatedLayout>
            <div className="min-h-screen pb-24 relative" style={{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }}>

                {/* ── Header ── */}
                <header className="sticky top-0 z-30 border-b backdrop-blur-xl"
                    style={{ background: 'var(--theme-header-bg)', borderColor: 'var(--theme-border)' }}>
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-gold/40 flex-shrink-0">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full gold-gradient flex items-center justify-center">
                                        <span className="text-sm font-display font-bold text-primary-foreground">{initials}</span>
                                    </div>
                                )}
                            </div>
                            <h1 className="text-lg font-display font-semibold leading-tight" style={{ color: 'var(--theme-text-head)' }}>
                                {greeting}, {user?.name?.split(' ')[0] ?? 'Guest'}
                            </h1>
                        </div>

                        <div className="flex items-center gap-3">
                            <LanguageToggle />
                            <ThemeToggle />

                            {/* ── Notification Bell ── */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowNotifications(o => !o)}
                                    className="w-10 h-10 rounded-full flex items-center justify-center relative transition-colors"
                                    style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)' }}
                                    onMouseEnter={e => e.currentTarget.style.color = 'var(--theme-text-head)'}
                                    onMouseLeave={e => e.currentTarget.style.color = 'var(--theme-text-2)'}
                                >
                                    <Bell size={18} />
                                    {unreadCount > 0 && (
                                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 border-2"
                                            style={{ borderColor: 'var(--theme-btn-bg)' }} />
                                    )}
                                </button>

                                {/* Notification Dropdown */}
                                <AnimatePresence>
                                    {showNotifications && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                                            <motion.div
                                                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0,  scale: 1    }}
                                                exit={{ opacity: 0,  y: -8, scale: 0.95  }}
                                                className="absolute right-0 top-12 w-80 rounded-2xl shadow-2xl z-50 overflow-hidden"
                                                style={{ background: 'var(--theme-notif-bg)', border: '1px solid var(--theme-border)' }}
                                            >
                                                {/* Header */}
                                                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-display font-bold text-sm" style={{ color: 'var(--theme-text-head)' }}>Notifications</h3>
                                                        {unreadCount > 0 && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                                                                style={{ background: 'rgba(226,183,100,0.15)', color: '#e2b764' }}>
                                                                {unreadCount}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {unreadCount > 0 && (
                                                        <button onClick={handleMarkAllRead} className="text-[11px] transition-colors" style={{ color: '#e2b764' }}>
                                                            Mark all read
                                                        </button>
                                                    )}
                                                </div>

                                                {/* List */}
                                                <div className="max-h-96 overflow-y-auto">
                                                    {notifications.length === 0 ? (
                                                        <div className="py-10 text-center">
                                                            <Bell size={24} className="mx-auto mb-2 opacity-20" style={{ color: 'var(--theme-text-head)' }} />
                                                            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>No notifications yet</p>
                                                        </div>
                                                    ) : (
                                                        notifications.map(notif => (
                                                            <button key={notif.id} onClick={() => handleNotifClick(notif)}
                                                                className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b last:border-0"
                                                                style={{ borderColor: 'var(--theme-border)', background: notif.read ? 'transparent' : 'rgba(226,183,100,0.04)' }}
                                                                onMouseEnter={e => e.currentTarget.style.background = 'var(--theme-card-hover)'}
                                                                onMouseLeave={e => e.currentTarget.style.background = notif.read ? 'transparent' : 'rgba(226,183,100,0.04)'}
                                                            >
                                                                <NotifIcon icon={notif.icon} color={notif.color} />
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-start gap-1.5">
                                                                        {!notif.read && (
                                                                            <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#e2b764' }} />
                                                                        )}
                                                                        <p className="text-xs font-semibold mb-0.5 break-words" style={{ color: 'var(--theme-text-head)' }}>{notif.title}</p>
                                                                    </div>
                                                                    <p className="text-[11px] leading-relaxed break-words" style={{ color: 'var(--theme-text-2)' }}>{notif.message}</p>
                                                                    <p className="text-[10px] mt-1" style={{ color: 'var(--theme-text-muted)' }}>{notif.created_at}</p>
                                                                </div>
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>

                            <button onClick={handleLogout}
                                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                                style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; e.currentTarget.style.color = '#ef4444'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'var(--theme-btn-bg)'; e.currentTarget.style.color = 'var(--theme-text-2)'; }}
                            >
                                <LogOut size={18} />
                            </button>
                        </div>
                    </div>
                </header>

                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">

                    {/* ── Upcoming session area ──────────────────────────────────────
                        Exactly one of these renders at a time — never stacked —
                        to avoid duplicate/conflicting booking status displays:
                          1. Brief "Session Completed!" confirmation (transient)
                          2. Live StatusTracker — only for en_route / arrived
                          3. Compact UpcomingSessionCard — pending/accepted today,
                             or any future-dated booking (never a live tracker)
                          4. Nothing upcoming — existing prompt/usual-booking flow
                             below, plus a link into My Bookings' Upcoming tab */}
                    <AnimatePresence mode="wait">
                        {justCompletedBooking ? (
                            <SessionCompletedConfirmation
                                key="completed"
                                booking={justCompletedBooking}
                                onDismiss={handleCompletedDismiss}
                            />
                        ) : upcoming && ['en_route', 'arrived'].includes(upcoming.status) ? (
                            <StatusTracker
                                key="tracker"
                                booking={upcoming}
                            />
                        ) : upcoming ? (
                            <UpcomingSessionCard
                                key="compact"
                                booking={upcoming}
                                isToday={isScheduledTodayDubai(upcoming.scheduled_start)}
                            />
                        ) : (
                            <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="flex items-center justify-between gap-3 flex-wrap">
                                <p className="text-sm" style={{ color: 'var(--theme-text-2)' }}>No upcoming sessions scheduled.</p>
                                <button onClick={() => router.visit(route('my.bookings'))}
                                    className="text-sm flex items-center gap-1 transition-colors" style={{ color: 'var(--theme-link)' }}
                                    onMouseEnter={e => e.currentTarget.style.color = 'var(--theme-text-head)'}
                                    onMouseLeave={e => e.currentTarget.style.color = 'var(--theme-link)'}
                                >
                                    View Upcoming Bookings <ChevronRight size={14} />
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
                        <div className="lg:col-span-2 space-y-12">

                            {yourUsual ? (
                                <UsualBookingCard yourUsual={yourUsual} />
                            ) : (
                                <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                                    <div className="flex items-center justify-between mb-6">
                                        <h2 className="text-xl font-display font-semibold" style={{ color: 'var(--theme-text-head)' }}>Ready to book?</h2>
                                    </div>
                                    <div className="rounded-2xl border p-8 flex items-center gap-6"
                                        style={{ borderColor: 'rgba(226,183,100,0.3)', background: 'linear-gradient(135deg, var(--theme-card-hover) 0%, var(--theme-card) 100%)' }}>
                                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                                            style={{ background: '#e2b764', color: '#0b1120' }}>
                                            <Sparkles size={28} />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-display font-bold text-lg mb-1" style={{ color: 'var(--theme-text-head)' }}>Book Your First Session</h3>
                                            <p className="text-sm" style={{ color: 'var(--theme-text-2)' }}>Experience premium spa services delivered to your doorstep</p>
                                        </div>
                                        <button onClick={() => router.visit(route('bookings'))}
                                            className="shrink-0 px-5 py-2.5 rounded-xl font-bold text-sm"
                                            style={{ background: '#e2b764', color: '#0b1120' }}>
                                            Book Now
                                        </button>
                                    </div>
                                </motion.section>
                            )}

                            <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-xl font-display font-semibold" style={{ color: 'var(--theme-text-head)' }}>Top Therapists For You</h2>
                                    <button onClick={() => router.visit(route('bookings'))}
                                        className="text-sm flex items-center gap-1 transition-colors" style={{ color: 'var(--theme-link)' }}
                                        onMouseEnter={e => e.currentTarget.style.color = 'var(--theme-text-head)'}
                                        onMouseLeave={e => e.currentTarget.style.color = 'var(--theme-link)'}
                                    >
                                        View All <ChevronRight size={14} />
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    {(data?.top_therapists ?? []).slice(0, 2).map(therapist => (
                                        <TherapistCard key={therapist.id} therapist={therapist} />
                                    ))}
                                </div>
                            </motion.section>

                            <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-xl font-display font-semibold" style={{ color: 'var(--theme-text-head)' }}>Recent Activity</h2>
                                    <button onClick={() => router.visit(route('my.bookings'))}
                                        className="text-sm flex items-center gap-1 transition-colors" style={{ color: 'var(--theme-link)' }}
                                        onMouseEnter={e => e.currentTarget.style.color = 'var(--theme-text-head)'}
                                        onMouseLeave={e => e.currentTarget.style.color = 'var(--theme-link)'}
                                    >
                                        View All <ChevronRight size={14} />
                                    </button>
                                </div>
                                {(data?.recent_activity ?? []).length === 0 ? (
                                    <div className="py-12 text-center" style={{ color: 'var(--theme-text-muted)' }}>
                                        <Calendar size={32} className="mx-auto mb-3 opacity-50" />
                                        <p>No bookings yet. Start your wellness journey!</p>
                                    </div>
                                ) : (
                                    <div>
                                        {(data?.recent_activity ?? []).map(item => (
                                            <RecentActivityItem key={item.id} item={item} />
                                        ))}
                                    </div>
                                )}
                            </motion.section>
                        </div>

                        <div className="space-y-8">
                            <LoyaltyWidget
                                loyalty={data?.loyalty}
                                onRedeemed={() => {
                                    apiFetch('/api/dashboard-data')
                                        .then(setData)
                                        .catch(console.error);
                                }}
                            />
                            <WishlistWidget items={wishlistItems} loading={wishlistLoading} error={wishlistError} />
                            <AutoPreferencesWidget prefs={prefs} />
                        </div>
                    </div>
                </main>

                {/* ── Review Modal ── */}
                <AnimatePresence>
                    {showReviewModal && pendingReview && (
                        <ReviewModal
                            bookingId={pendingReview.booking_id}
                            onClose={() => setShowReviewModal(false)}
                            onSubmitted={() => {
                                setShowReviewModal(false);
                                apiFetch('/api/dashboard-data').then(setData);
                            }}
                        />
                    )}
                </AnimatePresence>

            </div>
        </AuthenticatedLayout>
    );
}