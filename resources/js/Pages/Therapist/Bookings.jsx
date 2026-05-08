import TherapistLayout from '@/Layouts/TherapistLayout';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Calendar, Clock, MapPin, User, CheckCircle2,
    XCircle, Loader2, Banknote, Star, AlertCircle, X, Car,
    Eye, Image as ImageIcon,
    Navigation, ClipboardList, Download, RefreshCw, Phone,
    FileText, CreditCard, Building2, Hourglass,
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

// ── Constants ────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
    pending: {
        label: 'Pending', color: '#f59e0b',
        bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)',
        icon: Hourglass,
    },
    accepted: {
        label: 'Accepted', color: '#10b981',
        bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)',
        icon: CheckCircle2,
    },
    en_route: {
        label: 'En Route', color: '#3b82f6',
        bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)',
        icon: Car,
    },
    arrived: {
        label: 'Arrived', color: '#8b5cf6',
        bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.3)',
        icon: MapPin,
    },
    completed: {
        label: 'Completed', color: '#e2b764',
        bg: 'rgba(226,183,100,0.12)', border: 'rgba(226,183,100,0.3)',
        icon: Star,
    },
    rejected: {
        label: 'Rejected', color: '#ef4444',
        bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)',
        icon: XCircle,
    },
    cancelled: {
        label: 'Cancelled', color: '#6b7280',
        bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.3)',
        icon: XCircle,
    },
    pending_payment: {
        label: 'Awaiting Payment', color: '#94a3b8',
        bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)',
        icon: Banknote,
    },
};

const PAYMENT_STATUS_CONFIG = {
    no_proof: {
        label: 'No Proof', color: '#ef4444',
        bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)',
    },
    submitted: {
        label: 'Submitted', color: '#f59e0b',
        bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)',
    },
    verified: {
        label: 'Verified', color: '#10b981',
        bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)',
    },
};

const TABS = [
    { key: 'all',       label: 'All'       },
    { key: 'pending',   label: 'Pending'   },
    { key: 'active',    label: 'Active'    },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
];

const TAB_STATUSES = {
    all:       ['pending', 'accepted', 'en_route', 'arrived', 'completed', 'rejected', 'cancelled', 'pending_payment'],
    pending:   ['pending', 'pending_payment'],
    active:    ['accepted', 'en_route', 'arrived'],
    completed: ['completed'],
    cancelled: ['rejected', 'cancelled'],
};

const OPTIMISTIC_STATUS = {
    accept:   'accepted',
    reject:   'rejected',
    start:    'en_route',
    arrived:  'arrived',
    complete: 'completed',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-US', {
        timeZone: 'Asia/Dubai', month: 'short', day: 'numeric', year: 'numeric',
    });
}

function fmtTime(str) {
    if (!str) return '—';
    return new Date(str).toLocaleTimeString('en-US', {
        timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit',
    });
}

function bookingCode(id) {
    return `IHS-${String(id).padStart(4, '0')}`;
}

// ── Compute paymentStatus from downpayment_status field ──────────────────────
function getPaymentStatus(booking) {
    if (booking.downpayment_status === 'verified') return 'verified';
    if (booking.downpayment_proof) return 'submitted';
    return 'no_proof';
}

// ── StatusBadge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, small }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
    const Icon = cfg.icon;
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full font-semibold ${small ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'}`}
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
        >
            <Icon size={small ? 9 : 11} />
            {cfg.label}
        </span>
    );
}

// ── PaymentBadge ─────────────────────────────────────────────────────────────
function PaymentBadge({ status }) {
    const cfg = PAYMENT_STATUS_CONFIG[status] ?? PAYMENT_STATUS_CONFIG.no_proof;
    return (
        <span
            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold"
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
        >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
            {cfg.label}
        </span>
    );
}

// ── DetailRow ────────────────────────────────────────────────────────────────
function DetailRow({ icon: Icon, label, value, accent }) {
    return (
        <div className="flex items-start gap-3 py-2.5 border-b last:border-0" style={{ borderColor: 'var(--theme-border)' }}>
            <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: accent ? `${accent}15` : 'var(--theme-btn-bg)' }}
            >
                <Icon size={13} style={{ color: accent ?? 'var(--theme-text-muted)' }} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: 'var(--theme-text-muted)' }}>{label}</p>
                <p className="text-sm font-medium leading-snug" style={{ color: 'var(--theme-text-head)' }}>{value ?? '—'}</p>
            </div>
        </div>
    );
}

// ── Reject modal ─────────────────────────────────────────────────────────────
function RejectConfirmModal({ onConfirm, onClose, loading }) {
    const [reason, setReason] = useState('');
    return (
        <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
            <motion.div
                className="absolute inset-0"
                style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
                onClick={onClose}
            />
            <motion.div
                className="relative w-full max-w-sm rounded-2xl border p-6 z-10"
                style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}
                initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
            >
                <h3 className="font-bold text-base mb-1" style={{ color: 'var(--theme-text-head)' }}>Reject Booking</h3>
                <p className="text-xs mb-4" style={{ color: 'var(--theme-text-muted)' }}>
                    Provide an optional reason for rejection.
                </p>
                <textarea
                    rows={3}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="e.g. Schedule conflict…"
                    className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none mb-4"
                    style={{
                        background: 'var(--theme-input-bg)',
                        border: '1px solid var(--theme-border)',
                        color: 'var(--theme-text)',
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#e2b764'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--theme-border)'}
                />
                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2 rounded-xl text-sm font-semibold"
                        style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)', border: '1px solid var(--theme-border)' }}
                    >Cancel</button>
                    <button
                        onClick={() => onConfirm(reason)}
                        disabled={loading}
                        className="flex-1 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5"
                        style={{ background: '#ef4444', color: '#fff', opacity: loading ? 0.7 : 1 }}
                    >
                        {loading ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                        Reject
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ── Booking Detail Drawer ────────────────────────────────────────────────────
function BookingModal({ booking, onClose, onAction, actionLoading }) {
    const [showReject, setShowReject] = useState(false);
    const [imgZoom, setImgZoom] = useState(false);

    useEffect(() => {
        const handle = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handle);
        return () => window.removeEventListener('keydown', handle);
    }, [onClose]);

    const isLoading = (a) => actionLoading === `${booking.id}-${a}`;
    const anyLoading = !!actionLoading;

    // ── Fix: use downpayment_status field ────────────────────────────────────
    const paymentStatus = getPaymentStatus(booking);

    const section = (title, children) => (
        <div className="mb-5">
            <p className="text-[10px] uppercase tracking-widest font-bold mb-3 px-1" style={{ color: '#e2b764' }}>
                {title}
            </p>
            <div
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--theme-border)', background: 'var(--theme-bg)' }}
            >
                <div className="px-3">{children}</div>
            </div>
        </div>
    );

    const getFullImageUrl = (path) => {
        if (!path) return '';
        if (path.startsWith('http')) return path;
        if (path.startsWith('/')) return `${window.location.origin}${path}`;
        return `${window.location.origin}/${path}`;
    };

    const renderStatusActions = () => {
        switch (booking.status) {
            case 'accepted':
                return (
                    <button
                        onClick={() => onAction(booking.id, 'start')}
                        disabled={anyLoading}
                        className="flex-1 min-w-[120px] py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                        style={{ background: isLoading('start') ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', opacity: anyLoading && !isLoading('start') ? 0.5 : 1 }}
                    >
                        {isLoading('start') ? <Loader2 size={12} className="animate-spin" /> : <Car size={12} />}
                        {isLoading('start') ? 'Updating…' : 'En Route'}
                    </button>
                );
            case 'en_route':
                return (
                    <button
                        onClick={() => onAction(booking.id, 'arrived')}
                        disabled={anyLoading}
                        className="flex-1 min-w-[120px] py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                        style={{ background: isLoading('arrived') ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.12)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)', opacity: anyLoading && !isLoading('arrived') ? 0.5 : 1 }}
                    >
                        {isLoading('arrived') ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
                        {isLoading('arrived') ? 'Updating…' : 'Mark Arrived'}
                    </button>
                );
            case 'arrived':
                return (
                    <button
                        onClick={() => onAction(booking.id, 'complete')}
                        disabled={anyLoading}
                        className="flex-1 min-w-[120px] py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                        style={{ background: isLoading('complete') ? 'rgba(226,183,100,0.2)' : 'rgba(226,183,100,0.12)', color: '#e2b764', border: '1px solid rgba(226,183,100,0.3)', opacity: anyLoading && !isLoading('complete') ? 0.5 : 1 }}
                    >
                        {isLoading('complete') ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        {isLoading('complete') ? 'Completing…' : 'Mark Complete'}
                    </button>
                );
            default:
                return null;
        }
    };

    return (
        <motion.div
            className="fixed inset-0 z-50 flex items-start justify-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
            <motion.div
                className="absolute inset-0"
                style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
                onClick={onClose}
            />

            <motion.div
                className="relative h-full w-full max-w-lg flex flex-col"
                style={{ background: 'var(--theme-card)', borderLeft: '1px solid var(--theme-border)' }}
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
                    style={{ borderColor: 'var(--theme-border)' }}
                >
                    <div>
                        <p className="text-[11px] font-mono font-bold" style={{ color: '#e2b764' }}>
                            {bookingCode(booking.id)}
                        </p>
                        <h2 className="font-bold text-lg leading-tight mt-0.5" style={{ color: 'var(--theme-text-head)' }}>
                            {booking.service?.name ?? 'Booking Details'}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <StatusBadge status={booking.status} />
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-xl flex items-center justify-center"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}
                        >
                            <X size={15} style={{ color: 'var(--theme-text-muted)' }} />
                        </button>
                    </div>
                </div>

                {/* Scrollable body */}
                <div
                    className="flex-1 overflow-y-auto px-6 py-5"
                    style={{ scrollbarWidth: 'thin', scrollbarColor: '#e2b76430 var(--theme-border)' }}
                >
                    {/* Actions */}
                    <div className="mb-6 p-4 rounded-xl" style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)' }}>
                        <p className="text-[10px] uppercase tracking-widest font-bold mb-3" style={{ color: '#e2b764' }}>
                            Actions
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {['pending', 'pending_payment'].includes(booking.status) && (
                                <button
                                    onClick={() => onAction(booking.id, 'accept')}
                                    disabled={anyLoading}
                                    className="flex-1 min-w-[120px] py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                                    style={{ background: isLoading('accept') ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', opacity: anyLoading && !isLoading('accept') ? 0.5 : 1 }}
                                >
                                    {isLoading('accept') ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                    {isLoading('accept') ? 'Accepting…' : 'Accept Booking'}
                                </button>
                            )}

                            {['pending', 'pending_payment', 'accepted'].includes(booking.status) && (
                                <button
                                    onClick={() => setShowReject(true)}
                                    disabled={anyLoading}
                                    className="flex-1 min-w-[120px] py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', opacity: anyLoading ? 0.5 : 1 }}
                                >
                                    <XCircle size={12} /> Reject Booking
                                </button>
                            )}

                            {renderStatusActions()}
                        </div>
                    </div>

                    {section('Customer', <>
                        <DetailRow icon={User}     label="Name"  value={booking.customer?.name}  accent="#e2b764" />
                        <DetailRow icon={Phone}    label="Phone" value={booking.customer?.phone} accent="#3b82f6" />
                        <DetailRow icon={FileText} label="Email" value={booking.customer?.email} accent="#8b5cf6" />
                    </>)}

                    {section('Schedule', <>
                        <DetailRow icon={Calendar} label="Date" value={fmtDate(booking.scheduled_start)} accent="#3b82f6" />
                        <DetailRow icon={Clock}    label="Time" value={`${fmtTime(booking.scheduled_start)}${booking.scheduled_end ? ` – ${fmtTime(booking.scheduled_end)}` : ''}`} accent="#8b5cf6" />
                        {booking.travel_time_minutes && (
                            <DetailRow icon={Car} label="Est. Travel Time" value={`${booking.travel_time_minutes} min`} accent="#f59e0b" />
                        )}
                    </>)}

                    {section('Location', <>
                        <DetailRow icon={MapPin}     label="Address" value={booking.location ?? '—'} accent="#10b981" />
                        {booking.location_notes && (
                            <DetailRow icon={Navigation} label="Notes" value={booking.location_notes} />
                        )}
                    </>)}

                    {section('Payment Breakdown', <>
                        <DetailRow icon={Building2}  label="Service"       value={booking.service?.name}  accent="#e2b764" />
                        <DetailRow icon={Banknote}   label="Service Price" value={booking.service?.price ? `AED ${Number(booking.service.price).toFixed(2)}` : '—'} accent="#10b981" />
                        {booking.downpayment != null && (
                            <DetailRow icon={CreditCard} label="Downpayment" value={`AED ${Number(booking.downpayment).toFixed(2)}`} accent="#f59e0b" />
                        )}
                        {booking.service?.price && booking.downpayment != null && (
                            <DetailRow icon={Banknote} label="Balance Due" value={`AED ${(Number(booking.service.price) - Number(booking.downpayment)).toFixed(2)}`} accent="#8b5cf6" />
                        )}
                        <div className="py-2.5 flex items-center justify-between">
                            <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--theme-text-muted)' }}>Payment Status</p>
                            <PaymentBadge status={paymentStatus} />
                        </div>
                    </>)}

                    {/* ── Proof of Payment ── */}
                    {section('Proof of Payment',
                        paymentStatus === 'verified' ? (
                            // ── Verified state — green banner + read-only image ──
                            <div className="py-4 flex flex-col gap-3">
                                <div
                                    className="w-full px-4 py-3 rounded-xl flex items-center gap-3"
                                    style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}
                                >
                                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{ background: 'rgba(16,185,129,0.15)' }}>
                                        <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold" style={{ color: '#10b981' }}>Downpayment Verified</p>
                                        <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                            Admin has confirmed this payment.
                                        </p>
                                    </div>
                                </div>
                                {booking.downpayment_proof && (
                                    <div
                                        className="relative rounded-xl overflow-hidden w-full cursor-pointer group"
                                        style={{ border: '1px solid rgba(16,185,129,0.2)' }}
                                        onClick={() => setImgZoom(true)}
                                    >
                                        <img
                                            src={getFullImageUrl(booking.downpayment_proof)}
                                            alt="Payment proof"
                                            className="w-full object-cover max-h-52 transition-transform group-hover:scale-105"
                                            onError={(e) => { e.target.src = 'https://via.placeholder.com/400x300?text=Image+Not+Found'; }}
                                        />
                                        <div
                                            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            style={{ background: 'rgba(0,0,0,0.4)' }}
                                        >
                                            <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: 'rgba(16,185,129,0.9)' }}>
                                                <Eye size={16} style={{ color: '#fff' }} />
                                                <span className="text-xs font-semibold text-white">View Full Screenshot</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : paymentStatus === 'submitted' ? (
                            // ── Submitted but not yet verified ──
                            <div className="py-3">
                                <div
                                    className="relative rounded-xl overflow-hidden cursor-pointer group"
                                    style={{ border: '1px solid var(--theme-border)' }}
                                    onClick={() => setImgZoom(true)}
                                >
                                    <img
                                        src={getFullImageUrl(booking.downpayment_proof)}
                                        alt="Payment proof"
                                        className="w-full object-cover max-h-52 transition-transform group-hover:scale-105"
                                        onError={(e) => { e.target.src = 'https://via.placeholder.com/400x300?text=Image+Not+Found'; }}
                                    />
                                    <div
                                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        style={{ background: 'rgba(0,0,0,0.4)' }}
                                    >
                                        <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: 'rgba(226,183,100,0.9)' }}>
                                            <Eye size={16} style={{ color: '#0b1120' }} />
                                            <span className="text-xs font-semibold" style={{ color: '#0b1120' }}>View Full Screenshot</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 px-1">
                                    <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Pending admin verification</p>
                                    <a
                                        href={getFullImageUrl(booking.downpayment_proof)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs flex items-center gap-1 font-medium"
                                        style={{ color: '#e2b764' }}
                                    >
                                        <Download size={11} /> Open in new tab
                                    </a>
                                </div>
                            </div>
                        ) : (
                            // ── No proof uploaded ──
                            <div className="py-5 flex flex-col items-center gap-2 text-center">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.08)' }}>
                                    <ImageIcon size={18} style={{ color: '#ef4444' }} />
                                </div>
                                <p className="text-sm font-medium" style={{ color: 'var(--theme-text-2)' }}>No proof uploaded</p>
                                <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Customer has not submitted payment proof yet.</p>
                            </div>
                        )
                    )}

                    {booking.rejection_reason && (
                        <div
                            className="mb-5 px-4 py-3 rounded-xl flex gap-3"
                            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
                        >
                            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                            <div>
                                <p className="text-[10px] uppercase font-bold mb-1" style={{ color: '#ef4444' }}>Rejection Reason</p>
                                <p className="text-xs" style={{ color: '#fca5a5' }}>{booking.rejection_reason}</p>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>

            <AnimatePresence>
                {showReject && (
                    <RejectConfirmModal
                        onClose={() => setShowReject(false)}
                        onConfirm={(reason) => {
                            setShowReject(false);
                            onAction(booking.id, 'reject', { reason });
                        }}
                        loading={isLoading('reject')}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {imgZoom && (
                    <motion.div
                        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setImgZoom(false)}
                    >
                        <motion.div
                            className="absolute inset-0"
                            style={{ background: 'rgba(0,0,0,0.95)' }}
                        />
                        <motion.div
                            className="relative z-10 max-w-full max-h-full"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25 }}
                        >
                            <img
                                src={getFullImageUrl(booking.downpayment_proof)}
                                alt="Payment proof fullscreen"
                                className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </motion.div>
                        <button
                            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                            style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}
                            onClick={() => setImgZoom(false)}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        >
                            <X size={18} style={{ color: '#fff' }} />
                        </button>
                        <p className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                            Click anywhere to close
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ── Table Row ────────────────────────────────────────────────────────────────
function TableRow({ booking, onView, index }) {
    // ── Fix: use downpayment_status field ────────────────────────────────────
    const paymentStatus = getPaymentStatus(booking);

    return (
        <motion.tr
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: Math.min(index * 0.03, 0.25) }}
            className="group border-b transition-colors"
            style={{ borderColor: 'var(--theme-border)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--theme-row-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
            <td className="px-4 py-3 whitespace-nowrap">
                <span className="font-mono text-xs font-bold" style={{ color: '#e2b764' }}>
                    {bookingCode(booking.id)}
                </span>
            </td>
            <td className="px-4 py-3">
                <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--theme-text-head)' }}>
                    {booking.customer?.name ?? '—'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                    {booking.service?.name ?? '—'}
                </p>
            </td>
            <td className="px-4 py-3 whitespace-nowrap">
                <p className="text-sm" style={{ color: 'var(--theme-text-head)' }}>{fmtDate(booking.scheduled_start)}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{fmtTime(booking.scheduled_start)}</p>
            </td>
            <td className="px-4 py-3 whitespace-nowrap">
                {booking.downpayment != null ? (
                    <>
                        <p className="text-sm font-medium" style={{ color: 'var(--theme-text-head)' }}>
                            AED {Number(booking.downpayment).toFixed(2)}
                        </p>
                        {booking.service?.price && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                / AED {Number(booking.service.price).toFixed(2)}
                            </p>
                        )}
                    </>
                ) : (
                    <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>—</span>
                )}
            </td>
            <td className="px-4 py-3">
                <PaymentBadge status={paymentStatus} />
            </td>
            <td className="px-4 py-3">
                <StatusBadge status={booking.status} small />
            </td>
            <td className="px-4 py-3">
                <button
                    onClick={() => onView(booking)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{ background: 'rgba(226,183,100,0.08)', color: '#e2b764', border: '1px solid rgba(226,183,100,0.2)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(226,183,100,0.16)'; e.currentTarget.style.borderColor = 'rgba(226,183,100,0.4)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(226,183,100,0.08)'; e.currentTarget.style.borderColor = 'rgba(226,183,100,0.2)'; }}
                >
                    <Eye size={12} /> View
                </button>
            </td>
        </motion.tr>
    );
}

// ── Empty State ──────────────────────────────────────────────────────────────
function EmptyTableState({ query }) {
    return (
        <tr>
            <td colSpan={7}>
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-16 text-center"
                >
                    <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                        style={{ background: 'rgba(226,183,100,0.07)', border: '1px solid rgba(226,183,100,0.12)' }}
                    >
                        <ClipboardList size={22} style={{ color: '#e2b764' }} />
                    </div>
                    <p className="font-semibold mb-1" style={{ color: 'var(--theme-text-head)' }}>
                        {query ? 'No results found' : 'No bookings here'}
                    </p>
                    <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                        {query ? `No bookings match "${query}"` : 'Bookings for this filter will appear here.'}
                    </p>
                </motion.div>
            </td>
        </tr>
    );
}

// ── Skeleton Row ─────────────────────────────────────────────────────────────
function SkeletonRow() {
    return (
        <tr className="border-b" style={{ borderColor: 'var(--theme-border)' }}>
            {[140, 180, 100, 90, 80, 80, 60].map((w, i) => (
                <td key={i} className="px-4 py-4">
                    <div className="h-3.5 rounded-full animate-pulse" style={{ width: w, background: 'var(--theme-skeleton)' }} />
                    {i === 1 && (
                        <div className="h-2.5 rounded-full animate-pulse mt-2" style={{ width: 100, background: 'var(--theme-skeleton)' }} />
                    )}
                </td>
            ))}
        </tr>
    );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function Bookings() {
    const [bookings, setBookings]               = useState([]);
    const [loading, setLoading]                 = useState(true);
    const [activeTab, setActiveTab]             = useState('all');
    const [search, setSearch]                   = useState('');
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [actionLoading, setActionLoading]     = useState(null);
    const [toast, setToast]                     = useState(null);
    const searchRef                             = useRef(null);

    const fetchBookings = useCallback(() => {
        setLoading(true);
        apiFetch('/therapist/api/bookings?per_page=500')
            .then(data => setBookings(data.data ?? []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchBookings();

        if (window.Echo) {
            const channel = window.Echo.private('bookings');
            channel.listen('BookingStatusUpdated', (e) => {
                if (!e?.booking) return;
                setBookings(prev =>
                    prev.map(b => b.id === e.booking.id ? { ...b, ...e.booking } : b)
                );
                setSelectedBooking(prev =>
                    prev?.id === e.booking.id ? { ...prev, ...e.booking } : prev
                );
            });
            return () => window.Echo.leave('bookings');
        }
    }, [fetchBookings]);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    const patchBooking = useCallback((bookingId, patch) => {
        setBookings(prev =>
            prev.map(b => b.id === bookingId ? { ...b, ...patch } : b)
        );
        setSelectedBooking(prev =>
            prev?.id === bookingId ? { ...prev, ...patch } : prev
        );
    }, []);

    const handleAction = useCallback(async (bookingId, action, body = {}) => {
        const key = `${bookingId}-${action}`;
        setActionLoading(key);

        const optimisticStatus = OPTIMISTIC_STATUS[action];
        if (optimisticStatus) {
            patchBooking(bookingId, { status: optimisticStatus });
        }

        const urlMap = {
            accept:           `/therapist/api/bookings/${bookingId}/accept`,
            reject:           `/therapist/api/bookings/${bookingId}/reject`,
            complete:         `/therapist/api/bookings/${bookingId}/complete`,
            start:            `/therapist/api/bookings/${bookingId}/start`,
            arrived:          `/therapist/api/bookings/${bookingId}/arrived`,
            'verify-payment': `/therapist/api/bookings/${bookingId}/verify-payment`,
        };

        try {
            const data = await apiFetch(urlMap[action], {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            showToast(data.message ?? 'Action completed!');

            if (data.booking) {
                patchBooking(bookingId, data.booking);
            }

        } catch {
            showToast('Something went wrong. Please try again.', 'error');
            fetchBookings();
        } finally {
            setActionLoading(null);
        }
    }, [patchBooking, fetchBookings]);

    const filtered = bookings.filter(b => {
        const inTab = (TAB_STATUSES[activeTab] ?? []).includes(b.status);
        if (!inTab) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            bookingCode(b.id).toLowerCase().includes(q) ||
            (b.customer?.name ?? '').toLowerCase().includes(q) ||
            (b.service?.name ?? '').toLowerCase().includes(q)
        );
    });

    const stats = [
        { label: 'Total',     value: bookings.length,                                                                    color: '#e2b764' },
        { label: 'Pending',   value: bookings.filter(b => b.status === 'pending').length,                                color: '#f59e0b' },
        { label: 'Active',    value: bookings.filter(b => ['accepted','en_route','arrived'].includes(b.status)).length,  color: '#10b981' },
        { label: 'Completed', value: bookings.filter(b => b.status === 'completed').length,                              color: '#3b82f6' },
    ];

    return (
        <TherapistLayout>
            <div
                className="min-h-screen pb-10"
                style={{ background: 'var(--theme-bg)', '--theme-row-hover': 'rgba(226,183,100,0.03)' }}
            >
                <div className="max-w-screen-xl mx-auto px-4 md:px-8 pt-6">

                    {/* Header */}
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <h1 className="font-display font-bold text-2xl" style={{ color: 'var(--theme-text-head)' }}>
                                Bookings
                            </h1>
                            <p className="text-sm mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                {loading ? 'Loading…' : `${bookings.length.toLocaleString()} total bookings`}
                            </p>
                        </div>
                        <button
                            onClick={fetchBookings}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
                            style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(226,183,100,0.4)'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--theme-border)'}
                        >
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                    </div>

                    {/* Stats strip */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        {stats.map(s => (
                            <div
                                key={s.label}
                                className="rounded-xl px-4 py-3 flex items-center justify-between"
                                style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}
                            >
                                <p className="text-xs font-semibold" style={{ color: 'var(--theme-text-muted)' }}>{s.label}</p>
                                <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Table card */}
                    <div
                        className="rounded-2xl border overflow-hidden"
                        style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}
                    >
                        {/* Toolbar */}
                        <div
                            className="flex flex-col md:flex-row md:items-center gap-3 px-5 py-4 border-b"
                            style={{ borderColor: 'var(--theme-border)' }}
                        >
                            <div className="flex items-center gap-1 flex-wrap">
                                {TABS.map(tab => {
                                    const count = bookings.filter(b => (TAB_STATUSES[tab.key] ?? []).includes(b.status)).length;
                                    const isActive = activeTab === tab.key;
                                    return (
                                        <button
                                            key={tab.key}
                                            onClick={() => setActiveTab(tab.key)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                            style={{
                                                background: isActive ? 'rgba(226,183,100,0.12)' : 'transparent',
                                                color: isActive ? '#e2b764' : 'var(--theme-text-muted)',
                                                border: isActive ? '1px solid rgba(226,183,100,0.3)' : '1px solid transparent',
                                            }}
                                        >
                                            {tab.label}
                                            {count > 0 && (
                                                <span
                                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                                    style={{
                                                        background: isActive ? 'rgba(226,183,100,0.25)' : 'var(--theme-btn-bg)',
                                                        color: isActive ? '#e2b764' : 'var(--theme-text-2)',
                                                    }}
                                                >
                                                    {count > 99 ? '99+' : count}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="md:ml-auto relative">
                                <Search
                                    size={13}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                                    style={{ color: 'var(--theme-text-muted)' }}
                                />
                                <input
                                    ref={searchRef}
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search name or booking code…"
                                    className="w-full md:w-64 pl-8 pr-8 py-2 rounded-xl text-xs outline-none transition-all"
                                    style={{
                                        background: 'var(--theme-input-bg)',
                                        border: '1px solid var(--theme-border)',
                                        color: 'var(--theme-text)',
                                    }}
                                    onFocus={e => e.currentTarget.style.borderColor = '#e2b764'}
                                    onBlur={e => e.currentTarget.style.borderColor = 'var(--theme-border)'}
                                />
                                {search && (
                                    <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <X size={12} style={{ color: 'var(--theme-text-muted)' }} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px]">
                                <thead>
                                    <tr
                                        className="border-b text-left"
                                        style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg)' }}
                                    >
                                        {['Booking', 'Customer / Service', 'Scheduled', 'Payment', 'Pay Status', 'Status', ''].map((h, i) => (
                                            <th
                                                key={i}
                                                className="px-4 py-3 text-[10px] uppercase tracking-widest font-bold"
                                                style={{ color: 'var(--theme-text-muted)' }}
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                                    ) : filtered.length === 0 ? (
                                        <EmptyTableState query={search} />
                                    ) : (
                                        <AnimatePresence initial={false}>
                                            {filtered.map((booking, index) => (
                                                <TableRow
                                                    key={booking.id}
                                                    booking={booking}
                                                    index={index}
                                                    onView={setSelectedBooking}
                                                />
                                            ))}
                                        </AnimatePresence>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        {!loading && filtered.length > 0 && (
                            <div
                                className="px-5 py-3 border-t flex items-center justify-between"
                                style={{ borderColor: 'var(--theme-border)' }}
                            >
                                <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                                    Showing <span style={{ color: 'var(--theme-text-2)' }}>{filtered.length}</span> of{' '}
                                    <span style={{ color: 'var(--theme-text-2)' }}>{bookings.length}</span> bookings
                                </p>
                                {search && (
                                    <button onClick={() => setSearch('')} className="text-xs font-medium" style={{ color: '#e2b764' }}>
                                        Clear search
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Drawer */}
            <AnimatePresence>
                {selectedBooking && (
                    <BookingModal
                        booking={selectedBooking}
                        onClose={() => setSelectedBooking(null)}
                        onAction={handleAction}
                        actionLoading={actionLoading}
                    />
                )}
            </AnimatePresence>

            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 24, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24, scale: 0.95 }}
                        className="fixed bottom-6 left-1/2 z-[80] px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-sm font-semibold"
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