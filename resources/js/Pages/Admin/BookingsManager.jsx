import AdminLayout from '@/Layouts/AdminLayout';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, X, Loader2, CheckCircle2, XCircle, AlertCircle,
    Eye, Download, RefreshCw, ShieldCheck, Banknote, Clock,
    Calendar, MapPin, User, CreditCard, RotateCcw, Receipt,
    BadgeCheck, AlertTriangle, Filter, ArrowUp, Timer,
    TrendingUp, Activity, ChevronRight, Flame, Archive,
    ChevronLeft, ChevronRight as ChevronRightIcon, Sparkle,
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
const DP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const ITEMS_PER_PAGE = 50;

// Views
const VIEWS = [
    { key: 'activeQueue',   label: 'Active Queue',    icon: Flame,        color: '#ef4444' },
    { key: 'expiredQueue',  label: 'Expired',         icon: AlertTriangle,color: '#64748b' },
    { key: 'all',           label: 'All Bookings',    icon: Archive,      color: '#e2b764' },
    { key: 'refunds',       label: 'Pending Refunds', icon: RotateCcw,    color: '#10b981' },
    { key: 'cancelled',     label: 'Cancelled',       icon: XCircle,      color: '#94a3b8' },
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
    submitted:   { label: 'Submitted',    color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)' },
    verified:    { label: 'Verified',     color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)' },
    refunded:    { label: 'Refundable',   color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)' },
    forfeited:   { label: 'Forfeited',    color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)' },
    refund_sent: { label: 'Refund Sent',  color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)' },
};

function getRemainingMs(submittedAt) {
    if (!submittedAt) return 0;
    const elapsed = Date.now() - new Date(submittedAt).getTime();
    return DP_WINDOW_MS - elapsed;
}

function isRecent(createdAt, hours = 24) {
    if (!createdAt) return false;
    const diff = Date.now() - new Date(createdAt).getTime();
    return diff < hours * 60 * 60 * 1000;
}

function getUrgency(remainingMs) {
    if (remainingMs <= 0)               return 'expired';
    if (remainingMs < 5 * 60 * 1000)   return 'critical';
    if (remainingMs < 10 * 60 * 1000)  return 'warning';
    return 'ok';
}

const URGENCY_STYLES = {
    ok:       { row: 'rgba(16,185,129,0.03)',   border: 'rgba(16,185,129,0.2)', timer: '#10b981', label: 'OK' },
    warning:  { row: 'rgba(245,158,11,0.06)',   border: 'rgba(245,158,11,0.35)', timer: '#f59e0b', label: 'Urgent' },
    critical: { row: 'rgba(239,68,68,0.07)',    border: 'rgba(239,68,68,0.4)',   timer: '#ef4444', label: 'Critical' },
    expired:  { row: 'rgba(148,163,184,0.04)',  border: 'rgba(148,163,184,0.2)', timer: '#64748b', label: 'Expired' },
};

function fmtTimer(ms) {
    if (ms <= 0) return 'EXPIRED';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtAgo(submittedAt) {
    if (!submittedAt) return '—';
    const diffMs = Date.now() - new Date(submittedAt).getTime();
    const m = Math.floor(diffMs / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m ago`;
}

function getProofUrl(path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${window.location.origin}${path.startsWith('/') ? '' : '/'}${path}`;
}

function Badge({ cfg }) {
    if (!cfg) return null;
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
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

// ── Live countdown cell ───────────────────────────────────────────────────────
function CountdownCell({ submittedAt, onExpire }) {
    const [remaining, setRemaining] = useState(() => getRemainingMs(submittedAt));
    const expiredFired = useRef(false);

    useEffect(() => {
        const tick = () => {
            const r = getRemainingMs(submittedAt);
            setRemaining(r);
            if (r <= 0 && !expiredFired.current) {
                expiredFired.current = true;
                onExpire?.();
            }
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [submittedAt]);

    const urgency = getUrgency(remaining);
    const style = URGENCY_STYLES[urgency];
    const pct = Math.max(0, Math.min(100, (remaining / DP_WINDOW_MS) * 100));

    if (urgency === 'expired') {
        return (
            <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono font-bold line-through"
                    style={{ color: '#64748b' }}>EXPIRED</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1 min-w-[72px]">
            <span className="text-sm font-mono font-bold tabular-nums"
                style={{ color: style.timer }}>
                {fmtTimer(remaining)}
            </span>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--theme-border)', width: 64 }}>
                <div className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: style.timer, transition: 'width 1s linear' }} />
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

// ── Booking Detail Drawer ─────────────────────────────────────────────────────
function BookingDrawer({ booking, onClose, onVerify, onRefundSent, verifying, refunding }) {
    const [imgZoom, setImgZoom] = useState(false);
    const [refInput, setRefInput] = useState('');
    const [showRefund, setShowRefund] = useState(false);

    const proofUrl = getProofUrl(booking.downpayment_proof);
    const dpStyle = DP_STYLES[booking.downpayment_status] ?? DP_STYLES.pending;
    const stStyle = STATUS_STYLES[booking.status] ?? STATUS_STYLES.pending;
    const remainingMs = booking.downpayment_submitted_at ? getRemainingMs(booking.downpayment_submitted_at) : null;
    const isExpired = remainingMs !== null && remainingMs <= 0;

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
                        <button onClick={onClose}
                            className="w-8 h-8 rounded-xl flex items-center justify-center"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                            <X size={15} style={{ color: 'var(--theme-text-muted)' }} />
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {booking.downpayment_status === 'submitted' && (
                        <div className="mb-5 p-4 rounded-xl"
                            style={{ background: isExpired ? 'rgba(148,163,184,0.06)' : 'rgba(245,158,11,0.06)', border: `1px solid ${isExpired ? 'rgba(148,163,184,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    {isExpired ? <AlertTriangle size={14} style={{ color: '#94a3b8' }} /> : <AlertCircle size={14} style={{ color: '#f59e0b' }} />}
                                    <p className="text-sm font-semibold" style={{ color: isExpired ? '#94a3b8' : '#f59e0b' }}>
                                        {isExpired ? 'Verification window expired' : 'Proof submitted — needs verification'}
                                    </p>
                                </div>
                                {!isExpired && remainingMs !== null && <CountdownCell submittedAt={booking.downpayment_submitted_at} />}
                            </div>
                            {isExpired ? (
                                <div className="flex items-center gap-2 text-xs py-2 px-3 rounded-lg"
                                    style={{ background: 'rgba(148,163,184,0.1)', color: '#64748b' }}>
                                    <AlertTriangle size={12} /> Window closed — verify manually or escalate
                                </div>
                            ) : (
                                <button onClick={() => onVerify(booking.id)} disabled={verifying}
                                    className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                                    style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#10b981' }}>
                                    {verifying ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                                    {verifying ? 'Verifying...' : 'Verify Downpayment'}
                                </button>
                            )}
                        </div>
                    )}
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
                    <Section title="Payment">
                        <Row icon={Banknote} label="Service Price" value={`AED ${Number(booking.service_price).toFixed(2)}`} accent="#e2b764" />
                        <Row icon={Banknote} label="Downpayment (20%)" value={`AED ${Number(booking.downpayment_amount).toFixed(2)}`} accent="#f59e0b" />
                        <Row icon={Banknote} label="Remaining (80%)" value={`AED ${Number(booking.remaining_amount).toFixed(2)}`} accent="#94a3b8" />
                        <div className="flex items-center justify-between py-3">
                            <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--theme-text-muted)' }}>Downpayment Status</p>
                            <Badge cfg={dpStyle} />
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
                            </p>
                            {booking.cancellation_reason && <p className="text-xs" style={{ color: '#94a3b8' }}>Reason: {booking.cancellation_reason}</p>}
                        </div>
                    )}
                </div>
            </motion.div>
            <AnimatePresence>{imgZoom && <ProofLightbox url={proofUrl} onClose={() => setImgZoom(false)} />}</AnimatePresence>
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

// ── Active Queue Component (FIFO, live countdown) ───────────────────────────
function ActiveQueue({ bookings, onVerify, onView, verifyingId }) {
    const sorted = useMemo(() => {
        return [...bookings].sort((a, b) => 
            new Date(a.downpayment_submitted_at) - new Date(b.downpayment_submitted_at)
        );
    }, [bookings]);

    if (!sorted.length) return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <CheckCircle2 size={22} style={{ color: '#10b981' }} />
            </div>
            <div className="text-center"><p className="font-semibold mb-1" style={{ color: 'var(--theme-text-head)' }}>Queue is clear</p>
            <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>All active verifications completed.</p></div>
        </div>
    );

    return (
        <div>
            <div className="flex items-center gap-3 px-5 py-3 border-b flex-wrap" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg)' }}>
                <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--theme-text-muted)' }}>
                    <ArrowUp size={12} style={{ color: '#f59e0b' }} />
                    <span style={{ color: 'var(--theme-text-2)' }}>FIFO order</span> · oldest first · 30-min window
                </div>
                <div className="ml-auto text-xs" style={{ color: 'var(--theme-text-muted)' }}>{sorted.length} active</div>
            </div>
            <div className="grid gap-3 px-5 py-2.5 text-[10px] uppercase tracking-widest font-bold border-b"
                style={{ gridTemplateColumns: '24px 1fr 90px 100px 90px 90px 80px', borderColor: 'var(--theme-border)', color: 'var(--theme-text-muted)', background: 'var(--theme-bg)' }}>
                <span>#</span><span>Customer / Service</span><span>Ref</span><span>Amount</span><span>Submitted</span><span>Expires in</span><span></span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
                {sorted.map((b, idx) => {
                    const remaining = getRemainingMs(b.downpayment_submitted_at);
                    const urgency = getUrgency(remaining);
                    const ustyle = URGENCY_STYLES[urgency];
                    const isVerifying = verifyingId === b.id;
                    return (
                        <motion.div key={b.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                            className="grid gap-3 px-5 py-3.5 items-center transition-colors"
                            style={{ gridTemplateColumns: '24px 1fr 90px 100px 90px 90px 80px', background: ustyle.row, borderLeft: `3px solid ${ustyle.border}` }}>
                            <div className="text-[11px] font-bold text-center" style={{ color: idx === 0 ? '#f59e0b' : 'var(--theme-text-muted)' }}>{idx + 1}</div>
                            <div><p className="text-sm font-semibold leading-tight" style={{ color: 'var(--theme-text-head)' }}>{b.customer_name}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{b.service_name}</p></div>
                            <span className="font-mono text-xs" style={{ color: '#e2b764' }}>{b.ref}</span>
                            <span className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>AED {Number(b.downpayment_amount).toFixed(2)}</span>
                            <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{fmtAgo(b.downpayment_submitted_at)}</span>
                            <CountdownCell submittedAt={b.downpayment_submitted_at} />
                            <div className="flex items-center gap-1.5">
                                <button onClick={() => onVerify(b.id)} disabled={isVerifying}
                                    className="text-[11px] px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-all disabled:opacity-50"
                                    style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                                    {isVerifying ? <Loader2 size={10} className="animate-spin" /> : <BadgeCheck size={10} />}
                                    {isVerifying ? '...' : 'Verify'}
                                </button>
                                <button onClick={() => onView(b)} className="w-7 h-7 rounded-lg flex items-center justify-center"
                                    style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-muted)', border: '1px solid var(--theme-border)' }}>
                                    <Eye size={11} />
                                </button>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Expired Queue Component ─────────────────────────────────────────────────
function ExpiredQueue({ bookings, onView }) {
    const sorted = useMemo(() => {
        return [...bookings].sort((a, b) => 
            new Date(b.downpayment_submitted_at) - new Date(a.downpayment_submitted_at)
        );
    }, [bookings]);

    if (!sorted.length) return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(148,163,184,0.07)', border: '1px solid rgba(148,163,184,0.15)' }}>
                <Archive size={22} style={{ color: '#64748b' }} />
            </div>
            <div className="text-center"><p className="font-semibold mb-1" style={{ color: 'var(--theme-text-head)' }}>No expired bookings</p>
            <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>All verifications completed within window.</p></div>
        </div>
    );

    return (
        <div>
            <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--theme-border)', background: 'rgba(148,163,184,0.03)' }}>
                <AlertTriangle size={12} style={{ color: '#64748b' }} />
                <span className="text-xs" style={{ color: '#64748b' }}>These bookings exceeded the 30-minute verification window. Manual review required.</span>
            </div>
            <div className="grid gap-3 px-5 py-2.5 text-[10px] uppercase tracking-widest font-bold border-b"
                style={{ gridTemplateColumns: '1fr 90px 100px 90px 90px 80px', borderColor: 'var(--theme-border)', color: 'var(--theme-text-muted)', background: 'var(--theme-bg)' }}>
                <span>Customer / Service</span><span>Ref</span><span>Amount</span><span>Submitted</span><span>Expired</span><span></span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
                {sorted.map((b) => (
                    <div key={b.id} className="grid gap-3 px-5 py-3.5 items-center opacity-70"
                        style={{ gridTemplateColumns: '1fr 90px 100px 90px 90px 80px', background: 'rgba(148,163,184,0.02)' }}>
                        <div><p className="text-sm font-semibold leading-tight" style={{ color: 'var(--theme-text-head)' }}>{b.customer_name}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{b.service_name}</p></div>
                        <span className="font-mono text-xs" style={{ color: '#e2b764', opacity: 0.6 }}>{b.ref}</span>
                        <span className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>AED {Number(b.downpayment_amount).toFixed(2)}</span>
                        <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{fmtAgo(b.downpayment_submitted_at)}</span>
                        <span className="text-xs font-mono" style={{ color: '#64748b' }}>EXPIRED</span>
                        <button onClick={() => onView(b)} className="text-[11px] px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1"
                            style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-muted)', border: '1px solid var(--theme-border)' }}>
                            <Eye size={10} /> Review
                        </button>
                    </div>
                ))}
            </div>
        </div>
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
function LatestBookingsSection({ bookings, onView }) {
    const recentBookings = useMemo(() => {
        return bookings.filter(b => isRecent(b.created_at, 24)).slice(0, 10);
    }, [bookings]);

    if (!recentBookings.length) return null;
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
                        <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--theme-text-muted)' }}>DP Status</th>
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
                                <td className="px-4 py-3"><Badge cfg={DP_STYLES[b.downpayment_status]} /></td>
                                <td className="px-4 py-3"><Badge cfg={STATUS_STYLES[b.status]} /></td>
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
    const [activeView, setActiveView] = useState('activeQueue');
    const [allBookings, setAllBookings] = useState([]);
    const [verifyQueue, setVerifyQueue] = useState([]);
    const [refundQueue, setRefundQueue] = useState([]);
    const [cancelledHist, setCancelledHist] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [statsLoading, setStatsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);
    const [verifyingId, setVerifyingId] = useState(null);
    const [refunding, setRefunding] = useState(false);
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
        setVerifyQueue(prev => prev.filter(b => b.id !== id));
        setRefundQueue(p);
        setCancelledHist(p);
        setSelected(prev => prev?.id === id ? { ...prev, ...patch } : prev);
    };

    const handleVerify = async (bookingId) => {
        setVerifyingId(bookingId);
        try {
            const data = await apiFetch('/admin/api/bookings/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ booking_id: bookingId }),
            });
            patchBooking(bookingId, data.booking);
            showToast('Downpayment verified! ✅');
            fetchStats();
        } catch (e) {
            showToast(e.message, 'error');
            fetchAll();
        } finally {
            setVerifyingId(null);
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

    // Split verification queue into active and expired
    const activeQueue = useMemo(() => {
        return verifyQueue.filter(b => getRemainingMs(b.downpayment_submitted_at) > 0);
    }, [verifyQueue]);

    const expiredQueue = useMemo(() => {
        return verifyQueue.filter(b => getRemainingMs(b.downpayment_submitted_at) <= 0);
    }, [verifyQueue]);

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
        activeQueue: activeQueue.length,
        expiredQueue: expiredQueue.length,
        refunds: refundQueue.length,
    };

    return (
        <AdminLayout title="Bookings Manager">
            <div className="space-y-5">
                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                    {[
                        { label: 'Total', value: stats?.total_bookings, color: '#e2b764', icon: Receipt, sub: 'all time' },
                        { label: 'Active Queue', value: activeQueue.length, color: '#ef4444', icon: Flame, sub: `${activeQueue.filter(b => getRemainingMs(b.downpayment_submitted_at) < 5 * 60 * 1000).length} critical` },
                        { label: 'Expired', value: expiredQueue.length, color: '#64748b', icon: AlertTriangle, sub: 'needs review' },
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
                    {activeView === 'activeQueue' && (
                        <ActiveQueue bookings={activeQueue} onVerify={handleVerify} onView={setSelected} verifyingId={verifyingId} />
                    )}
                    {activeView === 'expiredQueue' && (
                        <ExpiredQueue bookings={expiredQueue} onView={setSelected} />
                    )}
                    {activeView === 'all' && (
                        <>
                            <LatestBookingsSection bookings={allBookings} onView={setSelected} />
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

            <AnimatePresence>{selected && <BookingDrawer booking={selected} onClose={() => setSelected(null)} onVerify={handleVerify} onRefundSent={handleRefundSent} verifying={verifyingId === selected?.id} refunding={refunding} />}</AnimatePresence>
            <AnimatePresence>{toast && <Toast toast={toast} />}</AnimatePresence>
        </AdminLayout>
    );
}