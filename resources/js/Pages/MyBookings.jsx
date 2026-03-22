import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { router } from '@inertiajs/react';
import {
    Calendar, Clock, MapPin, User, Star,
    ChevronRight, Loader2, CheckCircle2,
    XCircle, AlertCircle, RefreshCw, Sparkles,
    CreditCard, Banknote
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

// ── API helper ─────────────────────────────────────────────────────────────
async function apiFetch(url) {
    const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
        accepted:  { label: 'Upcoming',  bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)',  color: '#10b981' },
        pending:   { label: 'Pending',   bg: 'rgba(226,183,100,0.1)', border: 'rgba(226,183,100,0.3)', color: '#e2b764' },
        completed: { label: 'Completed', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.3)',  color: '#60a5fa' },
        rejected:  { label: 'Rejected',  bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)', color: '#f87171' },
        cancelled: { label: 'Cancelled', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)', color: '#f87171' },
    }[status] ?? { label: status, bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.3)', color: '#94a3b8' };

    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: config.bg, border: `1px solid ${config.border}`, color: config.color }}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {config.label}
        </span>
    );
}

// ── Booking Card ───────────────────────────────────────────────────────────
function BookingCard({ booking, tab }) {
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
                    {/* Therapist avatar */}
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

            {/* Price + Actions row */}
            <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: '#1e2740' }}>
                <div>
                    <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: '#64748b' }}>Total</p>
                    <p className="text-lg font-display font-bold" style={{ color: '#e2b764' }}>
                        AED {booking.price}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {/* Rejection reason */}
                    {booking.rejection_reason && (
                        <p className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
                            {booking.rejection_reason}
                        </p>
                    )}

                    {/* Book Again — show on completed and cancelled */}
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

                    {/* View details arrow */}
                    <button
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
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState('upcoming');
    const [data,      setData]      = useState(null);
    const [loading,   setLoading]   = useState(true);

    useEffect(() => {
        apiFetch('/api/my-bookings')
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const currentBookings = data?.[activeTab] ?? [];

    // Tab counts
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

                        {/* Title */}
                        <div className="h-16 flex items-center">
                            <h1 className="text-xl font-display font-semibold text-white">
                                My Bookings
                            </h1>
                        </div>

                        {/* Tabs */}
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
                                                    color: active ? tab.color : '#64748b',
                                                }}>
                                                {count}
                                            </span>
                                        )}
                                        {/* Active underline */}
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
                                            />
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    )}
                </main>
            </div>
        </AuthenticatedLayout>
    );
}