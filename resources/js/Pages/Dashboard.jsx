import AuthenticatedLayout from '@/Layouts/CustomerLayout';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { router, usePage } from '@inertiajs/react';
import {
    Bell, LogOut, MapPin, Clock, Calendar,
    Star, ChevronRight, Sparkles, CheckCircle2,
    Navigation, User, CreditCard, Activity,
    Loader2, Banknote, Gift, 
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageToggle from '@/Components/Customer/LanguageToggle';
import ReviewModal from '@/Components/Customer/ReviewModal';
import ThemeToggle from '@/Components/ThemeToggle';
import { useBookingStatus } from '@/hooks/useBookingStatus';

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

function StatusTracker({ booking: initialBooking, onCompleted }) {
    const { booking, wsReady } = useBookingStatus(initialBooking);

    // Fire onCompleted when status hits completed
    const prevStatus = useRef(booking?.status);
    useEffect(() => {
        if (prevStatus.current !== 'completed' && booking?.status === 'completed') {
            onCompleted?.();
        }
        prevStatus.current = booking?.status;
    }, [booking?.status]);

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

    return (
        <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl border p-6 md:p-8"
            style={{ background: 'linear-gradient(135deg, #141d33 0%, #0f1629 100%)', borderColor: isEnRoute ? 'rgba(226,183,100,0.4)' : '#1e2740',
                boxShadow: isEnRoute ? '0 0 40px rgba(226,183,100,0.08)' : 'none',
                transition: 'border-color 0.5s, box-shadow 0.5s' }}
        >
            {/* Glow blob */}
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"
                style={{ background: `${meta.color}08` }} />

            <div className="relative z-10">

                {/* ── Status badge + WS indicator ── */}
                <div className="flex items-center justify-between mb-6">
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

                    {/* Live / Polling indicator */}
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: '#64748b' }}>
                        <span className={`w-1.5 h-1.5 rounded-full ${wsReady ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                        {wsReady ? 'Live' : 'Syncing'}
                    </div>
                </div>

                {/* ── Booking info ── */}
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                    <div>
                        <h2 className="text-2xl font-display font-semibold text-white mb-1">{booking.service}</h2>
                        <p className="flex items-center gap-2 text-sm" style={{ color: '#94a3b8' }}>
                            <User size={14} /> {booking.therapist} • {booking.duration} mins
                        </p>
                    </div>
                    <div className="md:text-right">
                        <p className="text-sm mb-1" style={{ color: '#94a3b8' }}>Scheduled</p>
                        <p className="text-2xl font-display font-light text-white">{booking.datetime}</p>
                    </div>
                </div>

                {/* ── En Route Hero Banner ── */}
                <AnimatePresence>
                    {isEnRoute && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-8 overflow-hidden"
                        >
                            <div className="rounded-xl p-4 flex items-center gap-4"
                                style={{ background: 'rgba(226,183,100,0.08)', border: '1px solid rgba(226,183,100,0.2)' }}>
                                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ background: 'rgba(226,183,100,0.15)', color: '#e2b764' }}>
                                    <Navigation size={20} className="animate-bounce" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold" style={{ color: '#e2b764' }}>Your therapist is on the way!</p>
                                    <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>Get ready — they'll arrive soon.</p>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Progress bar + Steps ── */}
                <div className="relative">
                    <div className="absolute top-5 left-5 right-5 h-px hidden sm:block" style={{ background: '#1e2740' }} />
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
                                            background: active ? meta.color : done ? `${meta.color}30` : '#1e2740',
                                            color:      active ? '#0b1120'  : done ? meta.color          : '#64748b',
                                            boxShadow:  active ? `0 0 20px ${meta.color}50` : 'none',
                                        }}>
                                        <Icon size={18} className={active && step.key === 'en_route' ? 'animate-bounce' : ''} />
                                    </div>
                                    <div className="sm:text-center">
                                        <p className={`text-sm font-medium ${done ? 'text-white' : 'text-slate-500'}`}>{step.label}</p>
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

function UsualBookingCard({ yourUsual }) {
    return (
        <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-display font-semibold text-white">Your Usual?</h2>
            </div>
            <div className="group relative rounded-2xl border p-6 md:p-8 overflow-hidden transition-all"
                style={{ borderColor: 'rgba(226,183,100,0.3)', background: 'linear-gradient(135deg, #141d33 0%, #0f1629 100%)' }}>
                <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                    <Sparkles size={120} style={{ color: '#e2b764' }} />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                                style={{ background: '#e2b764', color: '#0b1120' }}>Auto-Detected</span>
                            <span className="text-sm" style={{ color: '#94a3b8' }}>Based on your history</span>
                        </div>
                        <h3 className="text-2xl font-display font-semibold text-white mb-4">{yourUsual.service?.name}</h3>
                        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm" style={{ color: '#cbd5e1' }}>
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
            style={{ borderColor: '#1e2740', background: '#0f1629' }}
            onMouseEnter={e => e.currentTarget.style.background = '#141d33'}
            onMouseLeave={e => e.currentTarget.style.background = '#0f1629'}
        >
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-display font-bold flex-shrink-0 border-2"
                style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764, #f0c97a)', borderColor: '#1e2740', color: '#0b1120' }}>
                {therapist.avatar}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-white truncate">{therapist.name}</h4>
                    {therapist.familiar && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border flex-shrink-0"
                            style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', borderColor: 'rgba(59,130,246,0.2)' }}>
                            Familiar
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3 text-xs mb-2" style={{ color: '#94a3b8' }}>
                    <span className="flex items-center gap-1" style={{ color: '#e2b764' }}>
                        <Star size={12} className="fill-current" /> {therapist.rating}
                    </span>
                    <span>{therapist.experience} yrs</span>
                    <span>{therapist.gender === 'female' ? '♀ Female' : '♂ Male'}</span>
                </div>
                <button onClick={() => router.visit(route('bookings'))}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all w-full sm:w-auto"
                    style={{ background: '#1e2740', color: '#fff' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#e2b764'; e.currentTarget.style.color = '#0b1120'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#1e2740'; e.currentTarget.style.color = '#fff'; }}
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
            style={{ borderColor: '#1e2740' }}>
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: '#141d33', color: '#94a3b8' }}>
                    <Calendar size={20} />
                </div>
                <div>
                    <h4 className="font-medium text-white mb-1">{item.service}</h4>
                    <p className="text-sm" style={{ color: '#94a3b8' }}>{item.datetime} • {item.therapist} • {item.duration} mins</p>
                </div>
            </div>
            <button onClick={() => router.visit(route('my.bookings'))}
                className="shrink-0 px-4 py-2 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-all"
                style={{ borderColor: '#1e2740', color: '#cbd5e1' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(226,183,100,0.5)'; e.currentTarget.style.color = '#e2b764'; e.currentTarget.style.background = 'rgba(226,183,100,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2740'; e.currentTarget.style.color = '#cbd5e1'; e.currentTarget.style.background = 'transparent'; }}
            >
                Book Again
            </button>
        </div>
    );
}

function PreferenceItem({ icon: Icon, label, value }) {
    return (
        <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: '#141d33', color: '#94a3b8' }}>
                <Icon size={14} />
            </div>
            <div>
                <div className="text-xs" style={{ color: '#64748b' }}>{label}</div>
                <div className="text-sm font-medium" style={{ color: '#e2e8f0' }}>{value}</div>
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
            style={{ background: '#0f1629', borderColor: isAvailable ? 'rgba(226,183,100,0.4)' : '#1e2740' }}>

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
                        <h3 className="font-display font-semibold text-white">Wellness Journey</h3>
                    </div>
                    {cycle > 1 && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(226,183,100,0.1)', color: '#e2b764', border: '1px solid rgba(226,183,100,0.2)' }}>
                            Cycle {cycle}
                        </span>
                    )}
                </div>

                {/* ── Progress ── */}
                <div className="mb-5">
                    <div className="flex justify-between text-sm mb-2">
                        <span style={{ color: '#cbd5e1' }}>Sessions completed</span>
                        <span className="font-semibold" style={{ color: '#e2b764' }}>
                            {count}/{goal} Bookings
                        </span>
                    </div>

                    {/* Progress bar */}
                    <div className="h-2.5 w-full rounded-full overflow-hidden" style={{ background: '#1e2740' }}>
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
                            <p className="text-xs font-medium" style={{ color: '#e2b764' }}>
                                ✨ Congratulations! You've earned a complimentary 60-min session.
                            </p>
                        ) : claimed ? (
                            <p className="text-xs" style={{ color: '#22c55e' }}>
                                Starting fresh — 10 more sessions to your next free reward!
                            </p>
                        ) : (
                            <p className="text-xs" style={{ color: '#64748b' }}>
                                Just{' '}
                                <strong className="text-white">{remaining} more {remaining === 1 ? 'booking' : 'bookings'}</strong>
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
                        style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}
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
                        <p className="text-xs mb-2" style={{ color: '#94a3b8' }}>Your voucher code</p>
                        <p className="text-2xl font-display font-bold tracking-widest mb-1" style={{ color: '#e2b764' }}>
                            {voucher.code}
                        </p>
                        <p className="text-xs" style={{ color: '#94a3b8' }}>
                            Valid for any 60-min service · Expires {voucher.expires_at}
                        </p>
                        <p className="text-xs mt-1" style={{ color: '#64748b' }}>
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
                <div className="pt-5 border-t" style={{ borderColor: '#1e2740' }}>
                    <h4 className="text-sm font-medium text-white mb-3">Your Stats</h4>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl text-center" style={{ background: '#141d33' }}>
                            <div className="text-2xl font-display text-white mb-0.5">
                                {relaxHours > 0 ? `${relaxHours}h` : '0h'}
                            </div>
                            <div className="text-xs" style={{ color: '#94a3b8' }}>Relaxation Time</div>
                        </div>
                        <div className="p-3 rounded-xl text-center" style={{ background: '#141d33' }}>
                            <div className="text-2xl font-display text-white mb-0.5">{totalDone}</div>
                            <div className="text-xs" style={{ color: '#94a3b8' }}>Total Sessions</div>
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

function AutoPreferencesWidget({ prefs }) {
    return (
        <div className="p-6 rounded-2xl border" style={{ background: '#0f1629', borderColor: '#1e2740' }}>
            <h3 className="font-display font-semibold text-white mb-6">Auto-Preferences</h3>
            <p className="text-sm mb-6 leading-relaxed" style={{ color: '#94a3b8' }}>
                We've learned what you love. These preferences are automatically applied to speed up your booking.
            </p>
            {prefs ? (
                <div className="space-y-4">
                    {prefs.time && <PreferenceItem icon={Clock} label="Preferred Time" value={prefs.time} />}
                    {prefs.location && <PreferenceItem icon={MapPin} label="Favorite Location" value={`Home (${prefs.location})`} />}
                    {prefs.payment && <PreferenceItem icon={prefs.payment === 'Cashless' ? CreditCard : Banknote} label="Preferred Payment" value={prefs.payment} />}
                </div>
            ) : (
                <p className="text-sm text-center py-4" style={{ color: '#64748b' }}>Complete your first booking to unlock personalized preferences!</p>
            )}
            <button onClick={() => router.visit(route('my.profile'))}
                className="w-full mt-6 py-2 text-sm transition-colors"
                style={{ color: '#94a3b8' }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
            >
                Manage Preferences
            </button>
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
                                            style={{ borderColor: '#141d33' }} />
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
                                                            <Bell size={24} className="mx-auto mb-2 opacity-20 text-white" />
                                                            <p className="text-xs" style={{ color: '#64748b' }}>No notifications yet</p>
                                                        </div>
                                                    ) : (
                                                        notifications.map(notif => (
                                                            <button key={notif.id} onClick={() => handleNotifClick(notif)}
                                                                className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b last:border-0"
                                                                style={{ borderColor: 'var(--theme-border)', background: notif.read ? 'transparent' : 'rgba(226,183,100,0.04)' }}
                                                                onMouseEnter={e => e.currentTarget.style.background = 'var(--theme-card-hover)'}
                                                                onMouseLeave={e => e.currentTarget.style.background = notif.read ? 'transparent' : 'rgba(226,183,100,0.04)'}
                                                            >
                                                                {!notif.read && (
                                                                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#e2b764' }} />
                                                                )}
                                                                <div className={`flex-1 min-w-0 ${notif.read ? 'pl-3.5' : ''}`}>
                                                                    <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--theme-text-head)' }}>{notif.title}</p>
                                                                    <p className="text-[11px] leading-relaxed" style={{ color: 'var(--theme-text-2)' }}>{notif.message}</p>
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

                    {upcoming && (
                        <StatusTracker
                            booking={upcoming}
                            onCompleted={() => {
                                // Refresh dashboard data + trigger review modal
                                apiFetch('/api/dashboard-data').then(setData);
                                apiFetch('/api/reviews/pending')
                                    .then(reviews => {
                                        if (reviews.length > 0) {
                                            setPendingReview(reviews[0]);
                                            setShowReviewModal(true);
                                        }
                                    });
                            }}
                        />
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
                        <div className="lg:col-span-2 space-y-12">

                            {yourUsual ? (
                                <UsualBookingCard yourUsual={yourUsual} />
                            ) : (
                                <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                                    <div className="flex items-center justify-between mb-6">
                                        <h2 className="text-xl font-display font-semibold text-white">Ready to book?</h2>
                                    </div>
                                    <div className="rounded-2xl border p-8 flex items-center gap-6"
                                        style={{ borderColor: 'rgba(226,183,100,0.3)', background: 'linear-gradient(135deg, #141d33 0%, #0f1629 100%)' }}>
                                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                                            style={{ background: '#e2b764', color: '#0b1120' }}>
                                            <Sparkles size={28} />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-display font-bold text-lg text-white mb-1">Book Your First Session</h3>
                                            <p className="text-sm" style={{ color: '#94a3b8' }}>Experience premium spa services delivered to your doorstep</p>
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
                                    <h2 className="text-xl font-display font-semibold text-white">Top Therapists For You</h2>
                                    <button onClick={() => router.visit(route('bookings'))}
                                        className="text-sm flex items-center gap-1 transition-colors" style={{ color: '#e2b764' }}
                                        onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                                        onMouseLeave={e => e.currentTarget.style.color = '#e2b764'}
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
                                    <h2 className="text-xl font-display font-semibold text-white">Recent Activity</h2>
                                    <button onClick={() => router.visit(route('my.bookings'))}
                                        className="text-sm flex items-center gap-1 transition-colors" style={{ color: '#e2b764' }}
                                        onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                                        onMouseLeave={e => e.currentTarget.style.color = '#e2b764'}
                                    >
                                        View All <ChevronRight size={14} />
                                    </button>
                                </div>
                                {(data?.recent_activity ?? []).length === 0 ? (
                                    <div className="py-12 text-center" style={{ color: '#64748b' }}>
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