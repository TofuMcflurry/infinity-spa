import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { router, usePage } from '@inertiajs/react';
import {
    Bell, LogOut, MapPin, Clock, Calendar,
    Star, ChevronRight, Sparkles, CheckCircle2,
    Navigation, User, CreditCard, Activity,
    Loader2, Banknote, Home
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageToggle from '@/Components/Customer/LanguageToggle';

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch(url) {
    const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// ── Status Tracker ────────────────────────────────────────────────────────────
const STATUS_STEPS = [
    { key: 'pending',  label: 'Pending',  icon: Clock         },
    { key: 'accepted', label: 'Accepted', icon: CheckCircle2  },
    { key: 'en_route', label: 'En Route', icon: Navigation    },
    { key: 'arrived',  label: 'Arrived',  icon: MapPin        },
];

function StatusTracker({ booking }) {
    const currentIdx = STATUS_STEPS.findIndex(s => s.key === booking.status);
    const progress   = currentIdx < 0 ? 0 : (currentIdx / (STATUS_STEPS.length - 1)) * 100;

    return (
        <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl border border-[#1e2740] p-6 md:p-8"
            style={{ background: 'linear-gradient(135deg, #141d33 0%, #0f1629 100%)' }}
        >
            {/* Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"
                style={{ background: 'rgba(226,183,100,0.05)' }} />

            <div className="relative z-10">
                {/* Top row */}
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-3"
                            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            {booking.status === 'accepted' ? 'Active Booking' : 'Pending Booking'}
                        </div>
                        <h2 className="text-2xl font-display font-semibold text-white mb-1">{booking.service}</h2>
                        <p className="flex items-center gap-2 text-sm" style={{ color: '#94a3b8' }}>
                            <User size={14} /> {booking.therapist} • {booking.duration} mins
                        </p>
                    </div>
                    <div className="md:text-right">
                        <p className="text-sm mb-1" style={{ color: '#94a3b8' }}>Scheduled</p>
                        <p className="text-3xl font-display font-light text-white">{booking.time}</p>
                    </div>
                </div>

                {/* Timeline */}
                <div className="relative">
                    {/* Background line */}
                    <div className="absolute top-5 left-5 right-5 h-px hidden sm:block" style={{ background: '#1e2740' }} />
                    {/* Progress line */}
                    <div className="absolute top-5 left-5 h-px hidden sm:block transition-all duration-1000"
                        style={{ background: '#e2b764', width: `calc(${progress}% - 40px)` }} />

                    <div className="relative z-10 flex flex-col sm:flex-row justify-between gap-6 sm:gap-0">
                        {STATUS_STEPS.map((step, i) => {
                            const done   = i <= currentIdx;
                            const active = i === currentIdx;
                            const Icon   = step.icon;
                            return (
                                <div key={step.key} className="flex sm:flex-col items-center gap-4 sm:gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${
                                        active
                                            ? 'shadow-[0_0_15px_rgba(226,183,100,0.4)]'
                                            : ''
                                    }`}
                                        style={{
                                            background: active
                                                ? '#e2b764'
                                                : done
                                                    ? 'rgba(226,183,100,0.2)'
                                                    : '#1e2740',
                                            color: active ? '#0b1120' : done ? '#e2b764' : '#64748b',
                                        }}>
                                        <Icon size={18} className={active && step.key === 'en_route' ? 'animate-bounce' : ''} />
                                    </div>
                                    <div className="sm:text-center">
                                        <p className={`text-sm font-medium ${done ? 'text-white' : 'text-slate-500'}`}>
                                            {step.label}
                                        </p>
                                        {active && (
                                            <p className="text-xs mt-0.5 sm:mt-1" style={{ color: '#e2b764' }}>
                                                {step.key === 'en_route' ? '5 mins away' : 'In progress'}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </motion.section>
    );
}

// ── Your Usual Card ───────────────────────────────────────────────────────────
function UsualBookingCard({ yourUsual }) {
    return (
        <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
        >
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-display font-semibold text-white">Your Usual?</h2>
            </div>

            <div className="group relative rounded-2xl border p-6 md:p-8 overflow-hidden transition-all"
                style={{
                    borderColor: 'rgba(226,183,100,0.3)',
                    background: 'linear-gradient(135deg, #141d33 0%, #0f1629 100%)',
                }}>
                {/* Sparkle bg */}
                <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                    <Sparkles size={120} style={{ color: '#e2b764' }} />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                                style={{ background: '#e2b764', color: '#0b1120' }}>
                                Auto-Detected
                            </span>
                            <span className="text-sm" style={{ color: '#94a3b8' }}>Based on your history</span>
                        </div>
                        <h3 className="text-2xl font-display font-semibold text-white mb-4">
                            {yourUsual.service?.name}
                        </h3>
                        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm" style={{ color: '#cbd5e1' }}>
                            {yourUsual.therapist?.name && (
                                <div className="flex items-center gap-2">
                                    <User size={14} style={{ color: '#e2b764' }} />
                                    {yourUsual.therapist.name}
                                </div>
                            )}
                            {yourUsual.time && (
                                <div className="flex items-center gap-2">
                                    <Clock size={14} style={{ color: '#e2b764' }} />
                                    {yourUsual.time}
                                </div>
                            )}
                            {yourUsual.location && (
                                <div className="flex items-center gap-2">
                                    <MapPin size={14} style={{ color: '#e2b764' }} />
                                    {yourUsual.location}
                                </div>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => router.visit(route('bookings'))}
                        className="shrink-0 w-full md:w-auto px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                        style={{
                            background: '#e2b764',
                            color: '#0b1120',
                            boxShadow: '0 8px 20px rgba(226,183,100,0.3)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 8px 30px rgba(226,183,100,0.5)'}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 8px 20px rgba(226,183,100,0.3)'}
                    >
                        <Sparkles size={18} />
                        1-Click Book
                    </button>
                </div>
            </div>
        </motion.section>
    );
}

// ── Therapist Card ────────────────────────────────────────────────────────────
function TherapistCard({ therapist }) {
    return (
        <div className="flex items-center gap-4 p-4 rounded-xl border transition-colors group cursor-pointer"
            style={{ borderColor: '#1e2740', background: '#0f1629' }}
            onMouseEnter={e => e.currentTarget.style.background = '#141d33'}
            onMouseLeave={e => e.currentTarget.style.background = '#0f1629'}
        >
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-display font-bold flex-shrink-0 border-2 transition-colors"
                style={{
                    background: 'linear-gradient(135deg, #b7882a, #e2b764, #f0c97a)',
                    borderColor: '#1e2740',
                    color: '#0b1120',
                }}>
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
                <button
                    onClick={() => router.visit(route('bookings'))}
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

// ── Recent Activity Item ──────────────────────────────────────────────────────
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
                    <p className="text-sm" style={{ color: '#94a3b8' }}>
                        {item.date} • {item.therapist} • {item.duration} mins
                    </p>
                </div>
            </div>
            <button
                onClick={() => router.visit(route('bookings'))}
                className="shrink-0 px-4 py-2 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-all"
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
                Book Again
            </button>
        </div>
    );
}

// ── Preference Item ───────────────────────────────────────────────────────────
function PreferenceItem({ icon: Icon, label, value }) {
    return (
        <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: '#141d33', color: '#94a3b8' }}>
                <Icon size={14} />
            </div>
            <div>
                <div className="text-xs" style={{ color: '#64748b' }}>{label}</div>
                <div className="text-sm font-medium" style={{ color: '#e2e8f0' }}>{value}</div>
            </div>
        </div>
    );
}

// ── Loyalty / Wellness Widget ─────────────────────────────────────────────────
function LoyaltyWidget({ stats }) {
    const sessions = stats?.total_sessions ?? 0;
    const goal     = 10;
    const pct      = Math.min((sessions / goal) * 100, 100);

    return (
        <div className="p-6 rounded-2xl border" style={{ background: '#0f1629', borderColor: '#1e2740' }}>
            <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(226,183,100,0.1)', color: '#e2b764' }}>
                    <Activity size={16} />
                </div>
                <h3 className="font-display font-semibold text-white">Wellness Journey</h3>
            </div>

            <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                    <span style={{ color: '#cbd5e1' }}>Sessions completed</span>
                    <span className="font-medium" style={{ color: '#e2b764' }}>{sessions}/{goal} Bookings</span>
                </div>
                <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: '#1e2740' }}>
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 1, delay: 0.5 }}
                        className="h-full rounded-full"
                        style={{ background: '#e2b764' }}
                    />
                </div>
                {sessions < goal && (
                    <p className="text-xs mt-3" style={{ color: '#64748b' }}>
                        Just <strong className="text-white">{goal - sessions} more bookings</strong> to unlock a complimentary 60-min upgrade.
                    </p>
                )}
            </div>

            <div className="pt-6 border-t" style={{ borderColor: '#1e2740' }}>
                <h4 className="text-sm font-medium text-white mb-4">Your Stats</h4>
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-xl text-center" style={{ background: '#141d33' }}>
                        <div className="text-2xl font-display text-white mb-1">
                            {sessions ? `${Math.round(sessions * 1.2)}h` : '0h'}
                        </div>
                        <div className="text-xs" style={{ color: '#94a3b8' }}>Relaxation Time</div>
                    </div>
                    <div className="p-3 rounded-xl text-center" style={{ background: '#141d33' }}>
                        <div className="text-2xl font-display text-white mb-1">{sessions}</div>
                        <div className="text-xs" style={{ color: '#94a3b8' }}>Sessions</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Auto Preferences Widget ───────────────────────────────────────────────────
function AutoPreferencesWidget({ prefs }) {
    return (
        <div className="p-6 rounded-2xl border" style={{ background: '#0f1629', borderColor: '#1e2740' }}>
            <h3 className="font-display font-semibold text-white mb-6">Auto-Preferences</h3>
            <p className="text-sm mb-6 leading-relaxed" style={{ color: '#94a3b8' }}>
                We've learned what you love. These preferences are automatically applied to speed up your booking.
            </p>

            {prefs ? (
                <div className="space-y-4">
                    {prefs.time && (
                        <PreferenceItem icon={Clock} label="Preferred Time" value={prefs.time} />
                    )}
                    {prefs.location && (
                        <PreferenceItem icon={MapPin} label="Favorite Location" value={`Home (${prefs.location})`} />
                    )}
                    {prefs.payment && (
                        <PreferenceItem
                            icon={prefs.payment === 'Cashless' ? CreditCard : Banknote}
                            label="Preferred Payment"
                            value={prefs.payment}
                        />
                    )}
                </div>
            ) : (
                <p className="text-sm text-center py-4" style={{ color: '#64748b' }}>
                    Complete your first booking to unlock personalized preferences!
                </p>
            )}

            <button
                onClick={() => router.visit(route('my.profile'))}
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

// ── MAIN DASHBOARD ────────────────────────────────────────────────────────────
export default function Dashboard() {
    const { t } = useLanguage();
    const { props } = usePage();

    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [avatarUrl, setAvatarUrl] = useState(null);
    const [userProfile, setUserProfile] = useState(null);

    useEffect(() => {
        apiFetch('/api/dashboard-data')
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        apiFetch('/api/profile-data')
            .then(data => {
                setUserProfile(data);
                setAvatarUrl(data.avatar);
            })
            .catch(err => console.error(err));
    }, []);

    const handleLogout = () => router.post(route('logout'));

    const user     = props.auth?.user;
    const initials = userProfile?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? 'U';

    // Greeting based on time
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
            <div className="min-h-screen pb-24 relative" style={{ background: '#0b1120', color: '#cbd5e1' }}>

                {/* ── Header ── */}
                <header className="sticky top-0 z-30 border-b backdrop-blur-xl"
                    style={{ background: 'rgba(11,17,32,0.8)', borderColor: '#1e2740' }}>
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            {/* Avatar */}
                            <div className="relative group">
                                <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-gold/40 flex-shrink-0">
                                    {avatarUrl ? (
                                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full gold-gradient flex items-center justify-center">
                                            <span className="text-sm font-display font-bold text-primary-foreground">
                                                {initials}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <h1 className="text-lg font-display font-semibold text-white leading-tight">
                                    {greeting}, {user?.name?.split(' ')[0] ?? 'Guest'}
                                </h1>
                                <div className="hidden md:block">
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="md:hidden">
                            </div>
                            <LanguageToggle />
                            <button className="w-10 h-10 rounded-full flex items-center justify-center relative transition-colors"
                                style={{ background: '#141d33', color: '#94a3b8' }}
                                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                                onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                            >
                                <Bell size={18} />
                                <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-red-500 border-2"
                                    style={{ borderColor: '#141d33' }} />
                            </button>
                            <button
                                onClick={handleLogout}
                                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                                style={{ background: '#141d33', color: '#94a3b8' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; e.currentTarget.style.color = '#ef4444'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#141d33'; e.currentTarget.style.color = '#94a3b8'; }}
                            >
                                <LogOut size={18} />
                            </button>
                        </div>
                    </div>
                </header>

                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">

                    {/* ── Active Booking Tracker ── */}
                    {upcoming && <StatusTracker booking={upcoming} />}

                    {/* ── Main Grid ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">

                        {/* ════ LEFT (2/3) ════ */}
                        <div className="lg:col-span-2 space-y-12">

                            {/* Your Usual */}
                            {yourUsual ? (
                                <UsualBookingCard yourUsual={yourUsual} />
                            ) : (
                                <motion.section
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                >
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
                                            <p className="text-sm" style={{ color: '#94a3b8' }}>
                                                Experience premium spa services delivered to your doorstep
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => router.visit(route('bookings'))}
                                            className="shrink-0 px-5 py-2.5 rounded-xl font-bold text-sm transition-all"
                                            style={{ background: '#e2b764', color: '#0b1120' }}
                                        >
                                            Book Now
                                        </button>
                                    </div>
                                </motion.section>
                            )}

                            {/* Top Therapists */}
                            <motion.section
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                            >
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-xl font-display font-semibold text-white">Top Therapists For You</h2>
                                    <button
                                        onClick={() => router.visit(route('bookings'))}
                                        className="text-sm flex items-center gap-1 transition-colors"
                                        style={{ color: '#e2b764' }}
                                        onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                                        onMouseLeave={e => e.currentTarget.style.color = '#e2b764'}
                                    >
                                        View All <ChevronRight size={14} />
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    {(data?.top_therapists ?? []).map(therapist => (
                                        <TherapistCard key={therapist.id} therapist={therapist} />
                                    ))}
                                </div>
                            </motion.section>

                            {/* Recent Activity */}
                            <motion.section
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                            >
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-xl font-display font-semibold text-white">Recent Activity</h2>
                                    <button
                                        onClick={() => router.visit(route('my.bookings'))}
                                        className="text-sm flex items-center gap-1 transition-colors"
                                        style={{ color: '#e2b764' }}
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

                        {/* ════ RIGHT (1/3) ════ */}
                        <div className="space-y-8">
                            <LoyaltyWidget stats={stats} />
                            <AutoPreferencesWidget prefs={prefs} />
                        </div>
                    </div>
                </main>

            </div>
        </AuthenticatedLayout>
    );
}