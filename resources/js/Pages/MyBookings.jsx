import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { ZoomIn } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { router } from '@inertiajs/react';
import {
    Calendar, Clock, MapPin, User, Star,
    ChevronRight, Loader2, CheckCircle2,
    XCircle, AlertCircle, RefreshCw, Sparkles,
    CreditCard, Banknote, X, AlertTriangle,
    Receipt, Image, ExternalLink
} from 'lucide-react';

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

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }) {
    const config = {
        accepted:        { label: 'Upcoming',         bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)',  color: '#10b981' },
        pending:         { label: 'Pending',          bg: 'rgba(226,183,100,0.1)', border: 'rgba(226,183,100,0.3)', color: '#e2b764' },
        pending_payment: { label: 'Awaiting Payment', bg: 'rgba(226,183,100,0.1)', border: 'rgba(226,183,100,0.3)', color: '#e2b764' },
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
function BookingDetailsModal({ booking, onClose }) {
    const [showProof, setShowProof] = useState(false);
    const bookingRef = `IHS-${String(booking.id).padStart(5, '0')}`;

    const downpaymentStatusConfig = {
        pending:   { label: 'Awaiting transfer',  color: '#e2b764', bg: 'rgba(226,183,100,0.08)',  border: 'rgba(226,183,100,0.2)'  },
        submitted: { label: 'Under review',       color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',   border: 'rgba(96,165,250,0.2)'   },
        verified:  { label: 'Verified ✅',        color: '#10b981', bg: 'rgba(16,185,129,0.08)',   border: 'rgba(16,185,129,0.2)'   },
        refunded:  { label: 'Refunded',           color: '#10b981', bg: 'rgba(16,185,129,0.08)',   border: 'rgba(16,185,129,0.2)'   },
        forfeited: { label: 'Forfeited',          color: '#f87171', bg: 'rgba(248,113,113,0.08)',  border: 'rgba(248,113,113,0.2)'  },
    }[booking.downpayment_status] ?? { label: booking.downpayment_status, color: '#94a3b8', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)' };

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
                            { icon: Calendar,  label: 'Date',     value: booking.date                          },
                            { icon: Clock,     label: 'Time',     value: booking.time                          },
                            { icon: Clock,     label: 'Duration', value: `${booking.duration} minutes`         },
                            { icon: MapPin,    label: 'Location', value: booking.location                      },
                            { icon: User,      label: 'Zone',     value: booking.zone_name                     },
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

                    {/* ── Payment Breakdown ── */}
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

                        {booking.downpayment_amount && (
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
                    {booking.downpayment_status && (
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
                                            src={booking.downpayment_proof}
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
                                                    src={booking.downpayment_proof}
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
function BookingCard({ booking, tab, onViewDetails, onCancel }) {
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
                        {booking.payment_method === 'cash'
                            ? <Banknote size={13} style={{ color: '#e2b764' }} />
                            : <CreditCard size={13} style={{ color: '#e2b764' }} />
                        }
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: '#64748b' }}>Payment</p>
                        <p className="text-xs font-medium text-white capitalize">{booking.payment_method}</p>
                    </div>
                </div>
            </div>

            {/* Downpayment status bar */}
            {tab === 'pending' && booking.downpayment_status && (
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
                        {booking.downpayment_status === 'verified'  && '✅ Downpayment verified'}
                        {booking.downpayment_status === 'submitted' && '⏳ Downpayment under review'}
                        {booking.downpayment_status === 'pending'   && '⚠️ Awaiting downpayment transfer'}
                    </span>
                    {booking.downpayment_amount && (
                        <span className="ml-auto font-bold" style={{ color: '#e2b764' }}>
                            AED {booking.downpayment_amount}
                        </span>
                    )}
                </div>
            )}

            {/* Price + Actions row */}
            <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: '#1e2740' }}>
                <div>
                    <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: '#64748b' }}>Total</p>
                    <p className="text-lg font-display font-bold" style={{ color: '#e2b764' }}>
                        AED {booking.price}
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* Cancel button */}
                    {(tab === 'upcoming' || tab === 'pending') && (
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

    const fetchBookings = useCallback(() => {
        setLoading(true);
        apiFetch('/api/my-bookings')
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { fetchBookings(); }, []);

    // ── Cancel handler ────────────────────────────────────────────────────
    const handleCancelConfirm = useCallback(async () => {
        if (!cancelBooking) return;
        setCancelling(true);
        setCancelError(null);
        try {
            await apiFetch('/api/downpayment/cancel', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ booking_id: cancelBooking.id }),
            });
            setShowCancelModal(false);
            setCancelBooking(null);
            fetchBookings();
        } catch (err) {
            setCancelError(err.message);
        } finally {
            setCancelling(false);
        }
    }, [cancelBooking, fetchBookings]);

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
                                                    setCancelError(null);
                                                    setShowCancelModal(true);
                                                }}
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
                        />
                    )}
                </AnimatePresence>

                {/* ── Cancel Confirmation Modal ── */}
                <AnimatePresence>
                    {showCancelModal && cancelBooking && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 backdrop-blur-sm"
                                style={{ background: 'rgba(0,0,0,0.7)' }}
                                onClick={() => !cancelling && setShowCancelModal(false)}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="relative w-full max-w-sm rounded-2xl p-6 z-10"
                                style={{ background: '#0f1629', border: '1px solid #1e2740' }}
                            >
                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
                                    style={{ background: 'rgba(248,113,113,0.1)' }}>
                                    <AlertTriangle size={24} style={{ color: '#f87171' }} />
                                </div>

                                <h3 className="font-display font-bold text-lg text-white text-center mb-1">
                                    Cancel Booking?
                                </h3>
                                <p className="text-sm text-center mb-1" style={{ color: '#94a3b8' }}>
                                    {cancelBooking.service} • {cancelBooking.therapist}
                                </p>
                                <p className="text-xs text-center mb-4" style={{ color: '#64748b' }}>
                                    {cancelBooking.date_short} at {cancelBooking.time}
                                </p>

                                {/* Grace period warning */}
                                {cancelBooking.downpayment_status === 'verified' && (
                                    <div className="p-3 rounded-xl mb-4"
                                        style={{
                                            background: cancelBooking.hours_until_session > 24
                                                ? 'rgba(16,185,129,0.08)'
                                                : 'rgba(248,113,113,0.08)',
                                            border: cancelBooking.hours_until_session > 24
                                                ? '1px solid rgba(16,185,129,0.2)'
                                                : '1px solid rgba(248,113,113,0.2)',
                                        }}>
                                        <p className="text-xs font-medium text-center"
                                            style={{ color: cancelBooking.hours_until_session > 24 ? '#10b981' : '#f87171' }}>
                                            {cancelBooking.hours_until_session > 24
                                                ? '✅ Your downpayment will be fully refunded.'
                                                : '❌ Your downpayment will be forfeited (within 24hrs).'}
                                        </p>
                                    </div>
                                )}

                                {cancelError && (
                                    <p className="text-xs text-center mb-3 px-3 py-2 rounded-xl"
                                        style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
                                        {cancelError}
                                    </p>
                                )}

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowCancelModal(false)}
                                        disabled={cancelling}
                                        className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                                        style={{ background: '#141d33', color: '#94a3b8', border: '1px solid #1e2740' }}
                                    >
                                        Keep Booking
                                    </button>
                                    <button
                                        onClick={handleCancelConfirm}
                                        disabled={cancelling}
                                        className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                                        style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}
                                    >
                                        {cancelling ? <Loader2 size={14} className="animate-spin" /> : 'Yes, Cancel'}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

            </div>
        </AuthenticatedLayout>
    );
}