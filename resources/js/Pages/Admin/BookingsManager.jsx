import AdminLayout from '@/Layouts/AdminLayout';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, X, Loader2, CheckCircle2, XCircle, AlertCircle,
    Eye, Download, RefreshCw, ShieldCheck, Banknote, Clock,
    Calendar, MapPin, User, CreditCard, RotateCcw, Receipt,
    BadgeCheck, AlertTriangle, ChevronDown, Filter,
} from 'lucide-react';

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
const TABS = [
    { key: 'all',           label: 'All Bookings',     icon: Receipt,      color: '#e2b764' },
    { key: 'verification',  label: 'Verify Payment',   icon: ShieldCheck,  color: '#f59e0b' },
    { key: 'refunds',       label: 'Pending Refunds',  icon: RotateCcw,    color: '#10b981' },
    { key: 'cancelled',     label: 'Cancelled History',icon: XCircle,      color: '#94a3b8' },
];

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

const DP_STYLES = {
    pending:     { label: 'Pending',      color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)' },
    submitted:   { label: 'Submitted',   color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)' },
    verified:    { label: 'Verified',    color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)' },
    refunded:    { label: 'Refundable',  color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)' },
    forfeited:   { label: 'Forfeited',   color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)' },
    refund_sent: { label: 'Refund Sent', color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function Badge({ cfg }) {
    if (!cfg) return null;
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
            {cfg.label}
        </span>
    );
}

function getProofUrl(path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${window.location.origin}${path.startsWith('/') ? '' : '/'}${path}`;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, icon: Icon, loading }) {
    return (
        <div className="rounded-2xl p-5 flex items-center justify-between"
            style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}>
            <div>
                <p className="text-[11px] uppercase tracking-widest font-semibold mb-1"
                    style={{ color: 'var(--theme-text-muted)' }}>{label}</p>
                {loading
                    ? <div className="h-7 w-12 rounded-lg animate-pulse" style={{ background: 'var(--theme-border)' }} />
                    : <p className="text-2xl font-display font-bold" style={{ color }}>{value}</p>
                }
            </div>
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{ background: `${color}15` }}>
                <Icon size={20} style={{ color }} />
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
            <motion.img
                src={url} alt="Payment proof"
                className="relative z-10 max-w-full rounded-2xl shadow-2xl object-contain"
                style={{ maxHeight: '90vh', maxWidth: '90vw' }}
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={e => e.stopPropagation()}
            />
            <button onClick={onClose}
                className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
                <X size={18} />
            </button>
            <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs z-10"
                style={{ color: 'rgba(255,255,255,0.4)' }}>Click anywhere to close</p>
        </motion.div>
    );
}

// ── Booking Detail Drawer ─────────────────────────────────────────────────────
function BookingDrawer({ booking, onClose, onVerify, onRefundSent, verifying, refunding }) {
    const [imgZoom,    setImgZoom]    = useState(false);
    const [refInput,   setRefInput]   = useState('');
    const [showRefund, setShowRefund] = useState(false);

    const proofUrl = getProofUrl(booking.downpayment_proof);
    const dpStyle  = DP_STYLES[booking.downpayment_status] ?? DP_STYLES.pending;
    const stStyle  = STATUS_STYLES[booking.status] ?? STATUS_STYLES.pending;

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
                <p className="text-sm font-medium" style={{ color: 'var(--theme-text-head)' }}>{value ?? '—'}</p>
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

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
                    style={{ borderColor: 'var(--theme-border)', background: 'linear-gradient(135deg, var(--theme-card) 0%, var(--theme-bg) 100%)' }}>
                    <div>
                        <p className="text-[11px] font-mono font-bold" style={{ color: '#e2b764' }}>{booking.ref}</p>
                        <h2 className="font-bold text-lg leading-tight mt-0.5"
                            style={{ color: 'var(--theme-text-head)' }}>{booking.service_name}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge cfg={stStyle} />
                        <button onClick={onClose}
                            className="w-8 h-8 rounded-xl flex items-center justify-center"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                            <X size={15} style={{ color: 'var(--theme-text-muted)' }} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5">

                    {/* ── Verify Action ── */}
                    {booking.downpayment_status === 'submitted' && (
                        <div className="mb-5 p-4 rounded-xl"
                            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
                            <div className="flex items-center gap-2 mb-3">
                                <AlertCircle size={14} style={{ color: '#f59e0b' }} />
                                <p className="text-sm font-semibold" style={{ color: '#f59e0b' }}>
                                    Downpayment proof submitted — needs verification
                                </p>
                            </div>
                            <button onClick={() => onVerify(booking.id)}
                                disabled={verifying}
                                className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                                style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#10b981' }}>
                                {verifying ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                                {verifying ? 'Verifying...' : 'Verify Downpayment'}
                            </button>
                        </div>
                    )}

                    {/* ── Refund Action ── */}
                    {booking.cancellation_type === 'refunded' && booking.downpayment_status === 'refunded' && (
                        <div className="mb-5 p-4 rounded-xl"
                            style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)' }}>
                            <div className="flex items-center gap-2 mb-3">
                                <RotateCcw size={14} style={{ color: '#3b82f6' }} />
                                <p className="text-sm font-semibold" style={{ color: '#3b82f6' }}>
                                    Refund eligible — AED {Number(booking.downpayment_amount).toFixed(2)}
                                </p>
                            </div>
                            {!showRefund ? (
                                <button onClick={() => setShowRefund(true)}
                                    className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                                    style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6' }}>
                                    <Banknote size={14} /> Mark Refund Sent
                                </button>
                            ) : (
                                <div className="space-y-2">
                                    <input
                                        value={refInput}
                                        onChange={e => setRefInput(e.target.value)}
                                        placeholder="Bank reference / transaction ID..."
                                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                                        style={{ background: 'var(--theme-input-bg, #141d33)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => { setShowRefund(false); setRefInput(''); }}
                                            className="flex-1 py-2 rounded-xl text-xs font-medium"
                                            style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)', border: '1px solid var(--theme-border)' }}>
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => { onRefundSent(booking.id, refInput); setShowRefund(false); setRefInput(''); }}
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

                    {/* Refund sent confirmation */}
                    {booking.downpayment_status === 'refund_sent' && (
                        <div className="mb-5 p-4 rounded-xl flex items-start gap-3"
                            style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)' }}>
                            <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#10b981' }} />
                            <div>
                                <p className="text-sm font-semibold" style={{ color: '#10b981' }}>Refund sent ✅</p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                    Ref: {booking.refund_reference} · {booking.refund_sent_at}
                                </p>
                            </div>
                        </div>
                    )}

                    <Section title="Customer">
                        <Row icon={User}     label="Name"  value={booking.customer_name}  accent="#e2b764" />
                        <Row icon={Receipt}  label="Email" value={booking.customer_email} accent="#8b5cf6" />
                    </Section>

                    <Section title="Booking Details">
                        <Row icon={Calendar} label="Scheduled"  value={booking.scheduled_start_fmt} accent="#3b82f6" />
                        <Row icon={MapPin}   label="Location"   value={booking.location}             accent="#10b981" />
                        <Row icon={User}     label="Therapist"  value={booking.therapist_name}       accent="#f59e0b" />
                        <Row icon={CreditCard} label="Payment Method" value={booking.payment_method} accent="#8b5cf6" />
                    </Section>

                    <Section title="Payment">
                        <Row icon={Banknote} label="Service Price"    value={`AED ${Number(booking.service_price).toFixed(2)}`}    accent="#e2b764" />
                        <Row icon={Banknote} label="Downpayment (20%)" value={`AED ${Number(booking.downpayment_amount).toFixed(2)}`} accent="#f59e0b" />
                        <Row icon={Banknote} label="Remaining (80%)"  value={`AED ${Number(booking.remaining_amount).toFixed(2)}`}  accent="#94a3b8" />
                        <div className="flex items-center justify-between py-3">
                            <p className="text-[10px] uppercase tracking-wider font-semibold"
                                style={{ color: 'var(--theme-text-muted)' }}>Downpayment Status</p>
                            <Badge cfg={dpStyle} />
                        </div>
                        {booking.downpayment_submitted_at && (
                            <Row icon={Clock} label="Submitted At" value={booking.downpayment_submitted_at} />
                        )}
                        {booking.downpayment_verified_at && (
                            <Row icon={Clock} label="Verified At" value={booking.downpayment_verified_at} accent="#10b981" />
                        )}
                    </Section>

                    {/* Proof of Payment */}
                    {booking.downpayment_proof && (
                        <div className="mb-5">
                            <p className="text-[10px] uppercase tracking-widest font-bold mb-2 px-1"
                                style={{ color: '#e2b764' }}>Proof of Payment</p>
                            <div className="rounded-xl overflow-hidden relative group cursor-pointer"
                                style={{ border: '1px solid var(--theme-border)' }}
                                onClick={() => setImgZoom(true)}>
                                <img src={proofUrl} alt="Payment proof"
                                    className="w-full max-h-48 object-cover transition-transform group-hover:scale-105" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
                                        style={{ background: 'rgba(226,183,100,0.9)' }}>
                                        <Eye size={14} style={{ color: '#0b1120' }} />
                                        <span className="text-xs font-bold" style={{ color: '#0b1120' }}>View Full</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end mt-2">
                                <a href={proofUrl} target="_blank" rel="noreferrer"
                                    className="text-xs flex items-center gap-1 font-medium"
                                    style={{ color: '#e2b764' }}>
                                    <Download size={11} /> Open in new tab
                                </a>
                            </div>
                        </div>
                    )}

                    {/* Cancellation info */}
                    {booking.cancellation_type && (
                        <div className="mb-5 p-4 rounded-xl space-y-1.5"
                            style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)' }}>
                            <p className="text-[10px] uppercase tracking-wider font-bold"
                                style={{ color: '#64748b' }}>Cancellation</p>
                            <p className="text-xs font-semibold" style={{ color: '#f87171' }}>
                                {booking.cancellation_type === 'refunded'  && '✅ Eligible for refund — cancelled before 24hrs'}
                                {booking.cancellation_type === 'forfeited' && '❌ Forfeited — cancelled within 24hrs'}
                                {booking.cancellation_type === 'no_show'   && '❌ Forfeited — no show'}
                            </p>
                            {booking.cancellation_reason && (
                                <p className="text-xs" style={{ color: '#94a3b8' }}>
                                    Reason: {booking.cancellation_reason}
                                </p>
                            )}
                            {booking.cancelled_at && (
                                <p className="text-[11px]" style={{ color: '#64748b' }}>
                                    Cancelled on {booking.cancelled_at}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="text-center pb-2">
                        <p className="text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
                            Booked on {booking.created_at}
                        </p>
                    </div>
                </div>
            </motion.div>

            <AnimatePresence>
                {imgZoom && <ProofLightbox url={proofUrl} onClose={() => setImgZoom(false)} />}
            </AnimatePresence>
        </motion.div>
    );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ toast }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 z-[90] px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-sm font-semibold"
            style={{
                transform: 'translateX(-50%)',
                background: toast.type === 'error' ? '#7f1d1d' : 'var(--theme-card)',
                border: `1px solid ${toast.type === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(226,183,100,0.3)'}`,
                color: toast.type === 'error' ? '#fca5a5' : '#e2b764',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}>
            {toast.type === 'error'
                ? <AlertCircle size={15} />
                : <CheckCircle2 size={15} />}
            {toast.message}
        </motion.div>
    );
}

// ── Table ─────────────────────────────────────────────────────────────────────
function BookingsTable({ bookings, loading, onView, tab }) {
    const skeletonRows = Array.from({ length: 6 });

    if (loading) return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
                <tbody>
                    {skeletonRows.map((_, i) => (
                        <tr key={i} className="border-b" style={{ borderColor: 'var(--theme-border)' }}>
                            {[100, 160, 130, 90, 80, 80, 60].map((w, j) => (
                                <td key={j} className="px-4 py-4">
                                    <div className="h-3.5 rounded-full animate-pulse"
                                        style={{ width: w, background: 'var(--theme-border)' }} />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    if (!bookings.length) return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(226,183,100,0.07)', border: '1px solid rgba(226,183,100,0.12)' }}>
                <Receipt size={22} style={{ color: '#e2b764' }} />
            </div>
            <div className="text-center">
                <p className="font-semibold mb-1" style={{ color: 'var(--theme-text-head)' }}>No bookings found</p>
                <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>Nothing to show for this filter.</p>
            </div>
        </div>
    );

    // Column configs per tab
    const cols = tab === 'refunds'
        ? ['Ref', 'Customer', 'Service', 'Downpayment', 'Reason', 'Cancelled', '']
        : tab === 'cancelled'
        ? ['Ref', 'Customer', 'Service', 'Type', 'DP Status', 'Cancelled', '']
        : ['Ref', 'Customer / Service', 'Scheduled', 'Downpayment', 'DP Status', 'Status', ''];

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
                <thead>
                    <tr className="border-b text-left"
                        style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg)' }}>
                        {cols.map((h, i) => (
                            <th key={i} className="px-4 py-3 text-[10px] uppercase tracking-widest font-bold"
                                style={{ color: 'var(--theme-text-muted)' }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    <AnimatePresence initial={false}>
                        {bookings.map((b, idx) => (
                            <motion.tr key={b.id}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ delay: Math.min(idx * 0.02, 0.2) }}
                                className="border-b group transition-colors"
                                style={{ borderColor: 'var(--theme-border)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(226,183,100,0.02)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                                {/* Ref */}
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <span className="font-mono text-xs font-bold" style={{ color: '#e2b764' }}>{b.ref}</span>
                                </td>

                                {tab === 'refunds' ? <>
                                    <td className="px-4 py-3">
                                        <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>{b.customer_name}</p>
                                        <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{b.customer_email}</p>
                                    </td>
                                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--theme-text-head)' }}>{b.service_name}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="text-sm font-bold" style={{ color: '#10b981' }}>
                                            AED {Number(b.downpayment_amount).toFixed(2)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 max-w-[160px]">
                                        <p className="text-xs truncate" style={{ color: 'var(--theme-text-muted)' }}>
                                            {b.cancellation_reason ?? '—'}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--theme-text-muted)' }}>
                                        {b.cancelled_at}
                                    </td>
                                </> : tab === 'cancelled' ? <>
                                    <td className="px-4 py-3">
                                        <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>{b.customer_name}</p>
                                        <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{b.service_name}</p>
                                    </td>
                                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--theme-text-muted)' }}>{b.therapist_name}</td>
                                    <td className="px-4 py-3">
                                        {b.cancellation_type && (
                                            <span className="text-xs font-semibold capitalize"
                                                style={{ color: b.cancellation_type === 'refunded' ? '#10b981' : '#f87171' }}>
                                                {b.cancellation_type === 'refunded' ? '✅ Refund' : '❌ Forfeited'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3"><Badge cfg={DP_STYLES[b.downpayment_status]} /></td>
                                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--theme-text-muted)' }}>
                                        {b.cancelled_at}
                                    </td>
                                </> : <>
                                    {/* All / Verification tab */}
                                    <td className="px-4 py-3">
                                        <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>{b.customer_name}</p>
                                        <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{b.service_name}</p>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <p className="text-sm" style={{ color: 'var(--theme-text-head)' }}>{b.scheduled_start_fmt}</p>
                                        <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{b.therapist_name}</p>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {b.downpayment_amount
                                            ? <span className="text-sm font-medium" style={{ color: 'var(--theme-text-head)' }}>
                                                AED {Number(b.downpayment_amount).toFixed(2)}
                                              </span>
                                            : <span style={{ color: 'var(--theme-text-muted)' }}>—</span>}
                                    </td>
                                    <td className="px-4 py-3"><Badge cfg={DP_STYLES[b.downpayment_status]} /></td>
                                    <td className="px-4 py-3"><Badge cfg={STATUS_STYLES[b.status]} /></td>
                                </>}

                                {/* View btn */}
                                <td className="px-4 py-3">
                                    <button onClick={() => onView(b)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                        style={{ background: 'rgba(226,183,100,0.08)', color: '#e2b764', border: '1px solid rgba(226,183,100,0.2)' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(226,183,100,0.16)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(226,183,100,0.08)'; }}>
                                        <Eye size={11} /> View
                                    </button>
                                </td>
                            </motion.tr>
                        ))}
                    </AnimatePresence>
                </tbody>
            </table>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BookingsManager() {
    const [activeTab,       setActiveTab]       = useState('all');
    const [allBookings,     setAllBookings]      = useState([]);
    const [verifyQueue,     setVerifyQueue]      = useState([]);
    const [refundQueue,     setRefundQueue]      = useState([]);
    const [cancelledHist,   setCancelledHist]    = useState([]);
    const [stats,           setStats]            = useState(null);
    const [loading,         setLoading]          = useState(true);
    const [statsLoading,    setStatsLoading]     = useState(true);
    const [search,          setSearch]           = useState('');
    const [selected,        setSelected]         = useState(null);
    const [verifying,       setVerifying]        = useState(false);
    const [refunding,       setRefunding]        = useState(false);
    const [toast,           setToast]            = useState(null);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [all, verify, refunds, cancelled] = await Promise.all([
                apiFetch('/admin/api/bookings'),
                apiFetch('/admin/api/bookings/verification'),
                apiFetch('/admin/api/bookings/pending-refunds'),
                apiFetch('/admin/api/bookings/cancelled-history'),
            ]);
            setAllBookings(all);
            setVerifyQueue(verify);
            setRefundQueue(refunds);
            setCancelledHist(cancelled);
        } catch (e) {
            showToast('Failed to load bookings', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

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

    // Patch a booking in all lists
    const patchBooking = (id, patch) => {
        const p = prev => prev.map(b => b.id === id ? { ...b, ...patch } : b);
        setAllBookings(p);
        setVerifyQueue(p);
        setRefundQueue(p);
        setCancelledHist(p);
        setSelected(prev => prev?.id === id ? { ...prev, ...patch } : prev);
    };

    const handleVerify = async (bookingId) => {
        setVerifying(true);
        try {
            const data = await apiFetch('/admin/api/bookings/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ booking_id: bookingId }),
            });
            patchBooking(bookingId, data.booking);
            // Remove from verify queue
            setVerifyQueue(prev => prev.filter(b => b.id !== bookingId));
            showToast('Downpayment verified! ✅');
            fetchStats();
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setVerifying(false);
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
            setRefundQueue(prev => prev.filter(b => b.id !== bookingId));
            showToast(`Refund marked as sent for ${data.ref} ✅`);
            fetchStats();
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setRefunding(false);
        }
    };

    // Which data to show based on tab
    const tabData = {
        all:          allBookings,
        verification: verifyQueue,
        refunds:      refundQueue,
        cancelled:    cancelledHist,
    };

    const filtered = (tabData[activeTab] ?? []).filter(b => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            (b.ref ?? '').toLowerCase().includes(q) ||
            (b.customer_name ?? '').toLowerCase().includes(q) ||
            (b.service_name ?? '').toLowerCase().includes(q) ||
            (b.therapist_name ?? '').toLowerCase().includes(q)
        );
    });

    const badgeCounts = {
        verification: verifyQueue.length,
        refunds:      refundQueue.length,
    };

    return (
        <AdminLayout title="Bookings Manager">
            <div className="space-y-6">

                {/* ── Stats ── */}
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                    {[
                        { label: 'Total',         value: stats?.total_bookings,       color: '#e2b764', icon: Receipt      },
                        { label: 'Verify Queue',  value: stats?.pending_verification, color: '#f59e0b', icon: ShieldCheck  },
                        { label: 'Refund Queue',  value: stats?.pending_refunds,      color: '#3b82f6', icon: RotateCcw    },
                        { label: 'Active Today',  value: stats?.active_today,         color: '#10b981', icon: Calendar     },
                        { label: 'Done Today',    value: stats?.completed_today,      color: '#8b5cf6', icon: CheckCircle2 },
                        { label: 'Revenue Today', value: stats?.revenue_today ? `AED ${Number(stats.revenue_today).toLocaleString()}` : '0', color: '#e2b764', icon: Banknote },
                    ].map(s => (
                        <StatCard key={s.label} {...s} loading={statsLoading} />
                    ))}
                </div>

                {/* ── Table Card ── */}
                <div className="rounded-2xl border overflow-hidden"
                    style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}>

                    {/* Toolbar */}
                    <div className="flex flex-col md:flex-row md:items-center gap-3 px-5 py-4 border-b"
                        style={{ borderColor: 'var(--theme-border)' }}>

                        {/* Tabs */}
                        <div className="flex items-center gap-1 flex-wrap">
                            {TABS.map(tab => {
                                const isActive = activeTab === tab.key;
                                const Icon = tab.icon;
                                const badge = badgeCounts[tab.key];
                                return (
                                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                                        style={{
                                            background: isActive ? `${tab.color}15` : 'transparent',
                                            color: isActive ? tab.color : 'var(--theme-text-muted)',
                                            border: isActive ? `1px solid ${tab.color}40` : '1px solid transparent',
                                        }}>
                                        <Icon size={13} />
                                        {tab.label}
                                        {badge > 0 && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                                style={{ background: `${tab.color}25`, color: tab.color }}>
                                                {badge}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Search + Refresh */}
                        <div className="md:ml-auto flex items-center gap-2">
                            <div className="relative">
                                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                                    style={{ color: 'var(--theme-text-muted)' }} />
                                <input value={search} onChange={e => setSearch(e.target.value)}
                                    placeholder="Search bookings..."
                                    className="w-52 pl-8 pr-8 py-2 rounded-xl text-xs outline-none transition-all"
                                    style={{ background: 'var(--theme-input-bg, #141d33)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
                                    onFocus={e => e.currentTarget.style.borderColor = '#e2b764'}
                                    onBlur={e => e.currentTarget.style.borderColor = 'var(--theme-border)'} />
                                {search && (
                                    <button onClick={() => setSearch('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <X size={11} style={{ color: 'var(--theme-text-muted)' }} />
                                    </button>
                                )}
                            </div>
                            <button onClick={() => { fetchAll(); fetchStats(); }}
                                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                                style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(226,183,100,0.4)'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--theme-border)'}>
                                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <BookingsTable
                        bookings={filtered}
                        loading={loading}
                        onView={setSelected}
                        tab={activeTab}
                    />

                    {/* Footer */}
                    {!loading && filtered.length > 0 && (
                        <div className="px-5 py-3 border-t flex items-center justify-between"
                            style={{ borderColor: 'var(--theme-border)' }}>
                            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                                Showing <span style={{ color: 'var(--theme-text-2)' }}>{filtered.length}</span> of{' '}
                                <span style={{ color: 'var(--theme-text-2)' }}>{(tabData[activeTab] ?? []).length}</span> bookings
                            </p>
                            {search && (
                                <button onClick={() => setSearch('')} className="text-xs font-medium"
                                    style={{ color: '#e2b764' }}>Clear search</button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Drawer */}
            <AnimatePresence>
                {selected && (
                    <BookingDrawer
                        booking={selected}
                        onClose={() => setSelected(null)}
                        onVerify={handleVerify}
                        onRefundSent={handleRefundSent}
                        verifying={verifying}
                        refunding={refunding}
                    />
                )}
            </AnimatePresence>

            {/* Toast */}
            <AnimatePresence>
                {toast && <Toast toast={toast} />}
            </AnimatePresence>
        </AdminLayout>
    );
}