import TherapistLayout from '@/Layouts/TherapistLayout';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePage } from '@inertiajs/react';
import {
    Calendar, Clock, MapPin, User, CheckCircle2,
    XCircle, Loader2, Banknote, ClipboardList,
    Star, AlertCircle, X, Navigation, Car,
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

const TABS = [
    { key: 'pending',   label: 'Pending'   },
    { key: 'accepted',  label: 'Active'    },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
];

const tabKeys = {
    pending:   ['pending'],
    accepted:  ['accepted', 'en_route', 'arrived'],
    completed: ['completed'],
    cancelled: ['rejected', 'cancelled'],
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

// ── Reject modal ─────────────────────────────────────────────────────────────
function RejectModal({ booking, onConfirm, onClose, loading }) {
    const [reason, setReason] = useState('');

    return (
        <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            {/* Backdrop */}
            <motion.div
                className="absolute inset-0"
                style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
                onClick={onClose}
            />

            {/* Modal */}
            <motion.div
                className="relative w-full max-w-md rounded-2xl border overflow-hidden"
                style={{ background: '#0f1629', borderColor: '#1e2740' }}
                initial={{ scale: 0.95, y: 16 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 16 }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#1e2740' }}>
                    <div className="flex items-center gap-3">
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: 'rgba(239,68,68,0.12)' }}
                        >
                            <XCircle size={15} style={{ color: '#ef4444' }} />
                        </div>
                        <div>
                            <h3 className="font-display font-bold text-white text-sm">Reject Booking</h3>
                            <p className="text-[11px]" style={{ color: '#64748b' }}>
                                IHS-{String(booking.id).padStart(4, '0')}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                        style={{ background: '#141d33' }}
                    >
                        <X size={14} style={{ color: '#64748b' }} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">
                    <p className="text-sm" style={{ color: '#94a3b8' }}>
                        You are about to reject the booking for{' '}
                        <span className="text-white font-semibold">{booking.customer?.name ?? 'this customer'}</span>.
                        Provide an optional reason below.
                    </p>

                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>
                            Reason (optional)
                        </label>
                        <textarea
                            rows={3}
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="e.g. Schedule conflict, not available in this area…"
                            className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-colors"
                            style={{
                                background: '#141d33',
                                border: '1px solid #1e2740',
                                color: '#e2e8f0',
                            }}
                            onFocus={e => e.currentTarget.style.borderColor = '#e2b764'}
                            onBlur={e => e.currentTarget.style.borderColor = '#1e2740'}
                        />
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                            style={{ background: '#141d33', color: '#94a3b8', border: '1px solid #1e2740' }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onConfirm(reason)}
                            disabled={loading}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                            style={{
                                background: loading ? '#7f1d1d' : '#ef4444',
                                color: '#fff',
                                opacity: loading ? 0.7 : 1,
                            }}
                        >
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                            {loading ? 'Rejecting…' : 'Confirm Reject'}
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ── Booking card ─────────────────────────────────────────────────────────────
function BookingCard({ booking, onAction, actionLoading }) {
    const [showReject, setShowReject] = useState(false);

    const fmt = (dateStr) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const fmtTime = (dateStr) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    const isLoading = (action) => actionLoading === `${booking.id}-${action}`;

    const ActionButton = ({ action, label, icon: Icon, color, bg, loadingLabel }) => (
        <button
            onClick={() => onAction(booking.id, action)}
            disabled={!!actionLoading}
            className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
            style={{
                background: isLoading(action) ? `${bg}80` : bg,
                color,
                border: `1px solid ${color}30`,
                opacity: actionLoading && !isLoading(action) ? 0.5 : 1,
            }}
        >
            {isLoading(action)
                ? <><Loader2 size={12} className="animate-spin" />{loadingLabel ?? label}</>
                : <><Icon size={12} />{label}</>
            }
        </button>
    );

    const renderActions = () => {
        switch (booking.status) {
            case 'pending':
                return (
                    <div className="flex gap-2 pt-1">
                        <ActionButton
                            action="accept"
                            label="Accept"
                            loadingLabel="Accepting…"
                            icon={CheckCircle2}
                            color="#10b981"
                            bg="rgba(16,185,129,0.12)"
                        />
                        <button
                            onClick={() => setShowReject(true)}
                            disabled={!!actionLoading}
                            className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                            style={{
                                background: 'rgba(239,68,68,0.1)',
                                color: '#ef4444',
                                border: '1px solid rgba(239,68,68,0.25)',
                                opacity: actionLoading ? 0.5 : 1,
                            }}
                        >
                            <XCircle size={12} /> Reject
                        </button>
                    </div>
                );
            case 'accepted':
                return (
                    <div className="flex gap-2 pt-1">
                        <ActionButton
                            action="en-route"
                            label="En Route"
                            loadingLabel="Updating…"
                            icon={Car}
                            color="#3b82f6"
                            bg="rgba(59,130,246,0.12)"
                        />
                    </div>
                );
            case 'en_route':
                return (
                    <div className="flex gap-2 pt-1">
                        <ActionButton
                            action="arrived"
                            label="Arrived"
                            loadingLabel="Updating…"
                            icon={MapPin}
                            color="#8b5cf6"
                            bg="rgba(139,92,246,0.12)"
                        />
                    </div>
                );
            case 'arrived':
                return (
                    <div className="flex gap-2 pt-1">
                        <ActionButton
                            action="complete"
                            label="Mark Complete"
                            loadingLabel="Completing…"
                            icon={CheckCircle2}
                            color="#e2b764"
                            bg="rgba(226,183,100,0.12)"
                        />
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <>
            <motion.div
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="relative overflow-hidden rounded-2xl border p-5"
                style={{
                    background: 'linear-gradient(135deg, #141d33 0%, #0f1629 100%)',
                    borderColor: '#1e2740',
                }}
            >
                {/* Subtle glow */}
                <div
                    className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl pointer-events-none"
                    style={{ background: 'rgba(226,183,100,0.04)', transform: 'translate(30%, -30%)' }}
                />

                <div className="relative z-10 space-y-4">
                    {/* Top row: ref + status */}
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <p className="text-[11px] font-mono font-semibold" style={{ color: '#e2b764' }}>
                                IHS-{String(booking.id).padStart(4, '0')}
                            </p>
                            <h4 className="font-display font-bold text-white mt-0.5 text-base leading-tight">
                                {booking.service?.name ?? '—'}
                            </h4>
                        </div>
                        <StatusBadge status={booking.status} />
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Customer */}
                        <div className="flex items-center gap-2">
                            <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ background: 'rgba(226,183,100,0.1)' }}
                            >
                                <User size={13} style={{ color: '#e2b764' }} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wide" style={{ color: '#64748b' }}>Customer</p>
                                <p className="text-sm text-white font-medium truncate">{booking.customer?.name ?? '—'}</p>
                            </div>
                        </div>

                        {/* Date */}
                        <div className="flex items-center gap-2">
                            <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ background: 'rgba(59,130,246,0.1)' }}
                            >
                                <Calendar size={13} style={{ color: '#3b82f6' }} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wide" style={{ color: '#64748b' }}>Date</p>
                                <p className="text-sm text-white font-medium">{fmt(booking.scheduled_start)}</p>
                            </div>
                        </div>

                        {/* Time */}
                        <div className="flex items-center gap-2">
                            <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ background: 'rgba(139,92,246,0.1)' }}
                            >
                                <Clock size={13} style={{ color: '#8b5cf6' }} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wide" style={{ color: '#64748b' }}>Time</p>
                                <p className="text-sm text-white font-medium">{fmtTime(booking.scheduled_start)}</p>
                            </div>
                        </div>

                        {/* Fee */}
                        <div className="flex items-center gap-2">
                            <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ background: 'rgba(16,185,129,0.1)' }}
                            >
                                <Banknote size={13} style={{ color: '#10b981' }} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wide" style={{ color: '#64748b' }}>Fee</p>
                                <p className="text-sm text-white font-medium">
                                    {booking.service?.price ? `AED ${booking.service.price}` : '—'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Location */}
                    {booking.location_address && (
                        <div
                            className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
                            style={{ background: '#0b1120', border: '1px solid #1e2740' }}
                        >
                            <MapPin size={13} className="mt-0.5 flex-shrink-0" style={{ color: '#e2b764' }} />
                            <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
                                {booking.location_address}
                            </p>
                        </div>
                    )}

                    {/* Rejection reason */}
                    {booking.rejection_reason && (
                        <div
                            className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
                            style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}
                        >
                            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" style={{ color: '#ef4444' }} />
                            <p className="text-xs" style={{ color: '#fca5a5' }}>
                                {booking.rejection_reason}
                            </p>
                        </div>
                    )}

                    {/* Action buttons */}
                    {renderActions()}
                </div>
            </motion.div>

            {/* Reject modal */}
            <AnimatePresence>
                {showReject && (
                    <RejectModal
                        booking={booking}
                        onClose={() => setShowReject(false)}
                        onConfirm={(reason) => {
                            setShowReject(false);
                            onAction(booking.id, 'reject', { reason });
                        }}
                        loading={isLoading('reject')}
                    />
                )}
            </AnimatePresence>
        </>
    );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ tab }) {
    const messages = {
        pending:   { icon: ClipboardList, title: 'No pending bookings',   sub: 'New booking requests will appear here.' },
        accepted:  { icon: Navigation,    title: 'No active bookings',    sub: 'Accepted bookings will show up here.'   },
        completed: { icon: Star,          title: 'No completed sessions', sub: 'Finished sessions will be listed here.' },
        cancelled: { icon: XCircle,       title: 'No cancelled bookings', sub: 'Cancelled or rejected bookings show here.' },
    };
    const cfg = messages[tab] ?? messages.pending;
    const Icon = cfg.icon;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 text-center"
        >
            <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(226,183,100,0.08)', border: '1px solid rgba(226,183,100,0.15)' }}
            >
                <Icon size={24} style={{ color: '#e2b764' }} />
            </div>
            <p className="font-display font-semibold text-white mb-1">{cfg.title}</p>
            <p className="text-sm" style={{ color: '#64748b' }}>{cfg.sub}</p>
        </motion.div>
    );
}

// ── Main Bookings page ────────────────────────────────────────────────────────
export default function Bookings() {
    const [bookings, setBookings]           = useState({});
    const [loading, setLoading]             = useState(true);
    const [activeTab, setActiveTab]         = useState('pending');
    const [actionLoading, setActionLoading] = useState(null);
    const [toast, setToast]                 = useState(null);

    // ── Fetch bookings ────────────────────────────────────────────────────────
    const fetchBookings = useCallback(() => {
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
            accept:      `/therapist/api/bookings/${bookingId}/accept`,
            reject:      `/therapist/api/bookings/${bookingId}/reject`,
            complete:    `/therapist/api/bookings/${bookingId}/complete`,
            'en-route':  `/api/therapist/bookings/${bookingId}/en-route`,
            arrived:     `/api/therapist/bookings/${bookingId}/arrived`,
        };

        try {
            const data = await apiFetch(urlMap[action], {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            showToast(data.message ?? 'Booking updated!');
            fetchBookings();
        } catch {
            showToast('Something went wrong. Please try again.', 'error');
        } finally {
            setActionLoading(null);
        }
    }, [fetchBookings]);

    // ── Tab bookings ──────────────────────────────────────────────────────────
    const tabBookings = (tabKeys[activeTab] ?? []).flatMap(k => bookings[k] ?? []);

    return (
        <TherapistLayout>
            <div className="min-h-screen pb-24 md:pb-8" style={{ background: '#0b1120' }}>

                {/* ── Page header ───────────────────────────────────────────── */}
                <div className="max-w-4xl mx-auto px-4 md:px-8 pt-6 pb-2">
                    <h1 className="font-display font-bold text-white text-2xl">Bookings</h1>
                    <p className="text-sm" style={{ color: '#64748b' }}>Manage your client sessions</p>
                </div>

                {/* ── Tabs container ────────────────────────────────────────── */}
                <div className="max-w-4xl mx-auto px-4 md:px-8 pt-2 pb-8">
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="rounded-2xl border overflow-hidden"
                        style={{ background: '#0f1629', borderColor: '#1e2740' }}
                    >
                        {/* Tab bar */}
                        <div className="relative flex border-b" style={{ borderColor: '#1e2740' }}>
                            {TABS.map(tab => {
                                const count = (tabKeys[tab.key] ?? []).flatMap(k => bookings[k] ?? []).length;
                                const isActive = activeTab === tab.key;
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveTab(tab.key)}
                                        className="relative flex-1 py-3.5 text-xs font-semibold transition-colors"
                                        style={{ color: isActive ? '#e2b764' : '#64748b' }}
                                    >
                                        {isActive && (
                                            <motion.div
                                                layoutId="bookings-tab-indicator"
                                                className="absolute inset-0"
                                                style={{ background: 'rgba(226,183,100,0.06)' }}
                                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                            />
                                        )}
                                        <span className="relative z-10 flex items-center justify-center gap-1.5">
                                            {tab.label}
                                            {count > 0 && (
                                                <span
                                                    className="w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold"
                                                    style={{
                                                        background: isActive ? '#e2b764' : '#1e2740',
                                                        color: isActive ? '#0b1120' : '#94a3b8',
                                                    }}
                                                >
                                                    {count > 9 ? '9+' : count}
                                                </span>
                                            )}
                                        </span>
                                        {isActive && (
                                            <motion.div
                                                layoutId="bookings-tab-underline"
                                                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                                                style={{ background: '#e2b764' }}
                                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Booking grid */}
                        <div className="p-4">
                            {loading ? (
                                <div className="space-y-4">
                                    {[0, 1, 2].map(i => (
                                        <div
                                            key={i}
                                            className="h-40 rounded-2xl animate-pulse"
                                            style={{ background: '#141d33' }}
                                        />
                                    ))}
                                </div>
                            ) : tabBookings.length === 0 ? (
                                <EmptyState tab={activeTab} />
                            ) : (
                                <AnimatePresence mode="popLayout">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {tabBookings.map(booking => (
                                            <BookingCard
                                                key={booking.id}
                                                booking={booking}
                                                onAction={handleAction}
                                                actionLoading={actionLoading}
                                            />
                                        ))}
                                    </div>
                                </AnimatePresence>
                            )}
                        </div>
                    </motion.div>
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
                            background: toast.type === 'error' ? '#7f1d1d' : '#0f1629',
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
