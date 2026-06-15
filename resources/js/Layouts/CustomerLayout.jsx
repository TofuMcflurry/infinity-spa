import { useState, useEffect } from 'react';
import { Home, Sparkles, CalendarDays, User, Crown, ChevronDown, BookOpen, History, Users, LogOut } from 'lucide-react';
import { Link, router, usePage } from '@inertiajs/react';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageToggle from '@/Components/Customer/LanguageToggle';
import ThemeToggle from '@/Components/ThemeToggle';
import BottomNav from '@/Components/Customer/BottomNav';
import FloatingConcierge from '@/Components/Customer/FloatingConcierge';

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch(url) {
    const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function CustomerSidebar() {
    const { t } = useLanguage();
    const { url, props } = usePage();

    const [avatarUrl,    setAvatarUrl]    = useState(null);
    const [profileName,  setProfileName]  = useState(null);

    const isOnBookings = url.startsWith('/my-bookings') || url.startsWith('/book-session');
    const [bookingsOpen, setBookingsOpen] = useState(isOnBookings);

    useEffect(() => {
        if (isOnBookings) setBookingsOpen(true);
    }, [url]);

    useEffect(() => {
        apiFetch('/api/profile-data')
            .then(data => {
                setAvatarUrl(data.avatar);
                setProfileName(data.name);
            })
            .catch(err => console.error('Failed to fetch profile:', err));
    }, []);

    const isActive = (path) => {
        if (path === '/') return url === '/';
        return url.startsWith(path);
    };

    const user        = props.auth?.user;
    const displayName = profileName || user?.name || 'Guest';
    const initials    = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    return (
        <aside className="hidden md:flex flex-col w-64 min-h-screen sticky top-0 h-screen overflow-y-auto glass-card-strong rounded-none border-y-0 border-s-0">

            {/* ── Logo ── */}
            <div className="p-5 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                <div className="flex items-center gap-3">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}
                    >
                        <Crown size={18} />
                    </div>
                    <div className="min-w-0">
                        <div className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                            Infinity Home Spa
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                            Dubai
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Nav ── */}
            <nav className="p-3 flex-1 flex flex-col gap-0.5">

                {/* Main group label */}
                <p className="text-[9px] font-semibold uppercase tracking-widest px-4 pb-1 mt-1"
                    style={{ color: 'var(--theme-text-muted)', opacity: 0.6 }}>
                    Main
                </p>

                {/* Home */}
                <Link
                    href="/dashboard"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors"
                    style={{
                        background: isActive('/dashboard') ? 'var(--theme-btn-bg)' : 'transparent',
                        color: isActive('/dashboard') ? 'var(--theme-text-head)' : 'var(--theme-text-2)',
                        fontWeight: isActive('/dashboard') ? 500 : 400,
                    }}
                    onMouseEnter={e => { if (!isActive('/dashboard')) e.currentTarget.style.background = 'var(--theme-btn-bg)'; }}
                    onMouseLeave={e => { if (!isActive('/dashboard')) e.currentTarget.style.background = 'transparent'; }}
                >
                    <Home size={18} className="flex-shrink-0" />
                    <span className="flex-1">{t.nav.home}</span>
                    {isActive('/dashboard') && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    )}
                </Link>

                {/* Services */}
                <Link
                    href="/services"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors"
                    style={{
                        background: isActive('/services') ? 'var(--theme-btn-bg)' : 'transparent',
                        color: isActive('/services') ? 'var(--theme-text-head)' : 'var(--theme-text-2)',
                        fontWeight: isActive('/services') ? 500 : 400,
                    }}
                    onMouseEnter={e => { if (!isActive('/services')) e.currentTarget.style.background = 'var(--theme-btn-bg)'; }}
                    onMouseLeave={e => { if (!isActive('/services')) e.currentTarget.style.background = 'transparent'; }}
                >
                    <Sparkles size={18} className="flex-shrink-0" />
                    <span className="flex-1">{t.nav.services}</span>
                    {isActive('/services') && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    )}
                </Link>

                {/* Therapists */}
                <Link
                    href="/therapists"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors"
                    style={{
                        background: isActive('/therapists') ? 'var(--theme-btn-bg)' : 'transparent',
                        color: isActive('/therapists') ? 'var(--theme-text-head)' : 'var(--theme-text-2)',
                        fontWeight: isActive('/therapists') ? 500 : 400,
                    }}
                    onMouseEnter={e => { if (!isActive('/therapists')) e.currentTarget.style.background = 'var(--theme-btn-bg)'; }}
                    onMouseLeave={e => { if (!isActive('/therapists')) e.currentTarget.style.background = 'transparent'; }}
                >
                    <Users size={18} className="flex-shrink-0" />
                    <span className="flex-1">Therapists</span>
                    {isActive('/therapists') && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    )}
                </Link>

                {/* Bookings — collapsible */}
                <div>
                    <button
                        onClick={() => setBookingsOpen(o => !o)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors"
                        style={{
                            background: isOnBookings ? 'var(--theme-btn-bg)' : 'transparent',
                            color: isOnBookings ? 'var(--theme-text-head)' : 'var(--theme-text-2)',
                            fontWeight: isOnBookings ? 500 : 400,
                        }}
                        onMouseEnter={e => { if (!isOnBookings) e.currentTarget.style.background = 'var(--theme-btn-bg)'; }}
                        onMouseLeave={e => { if (!isOnBookings) e.currentTarget.style.background = isOnBookings ? 'var(--theme-btn-bg)' : 'transparent'; }}
                    >
                        <CalendarDays size={18} className="flex-shrink-0" />
                        <span className="flex-1 text-left">{t.nav.bookings}</span>
                        <ChevronDown
                            size={14}
                            className={`transition-transform duration-200 ${bookingsOpen ? 'rotate-180' : ''}`}
                            style={{ opacity: 0.5 }}
                        />
                    </button>

                    <div className={`overflow-hidden transition-all duration-200 ${
                        bookingsOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                    }`}>
                        <div className="ml-4 mt-1 space-y-0.5 border-l pl-3" style={{ borderColor: 'var(--theme-border)' }}>
                            <Link
                                href="/book-session"
                                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-colors"
                                style={{
                                    background: isActive('/book-session') ? 'var(--theme-btn-bg)' : 'transparent',
                                    color: isActive('/book-session') ? 'var(--theme-text-head)' : 'var(--theme-text-2)',
                                    fontWeight: isActive('/book-session') ? 500 : 400,
                                }}
                                onMouseEnter={e => { if (!isActive('/book-session')) e.currentTarget.style.background = 'var(--theme-btn-bg)'; }}
                                onMouseLeave={e => { if (!isActive('/book-session')) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <BookOpen size={15} className="flex-shrink-0" />
                                <span>Book a Session</span>
                            </Link>

                            <Link
                                href="/my-bookings"
                                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-colors"
                                style={{
                                    background: isActive('/my-bookings') ? 'var(--theme-btn-bg)' : 'transparent',
                                    color: isActive('/my-bookings') ? 'var(--theme-text-head)' : 'var(--theme-text-2)',
                                    fontWeight: isActive('/my-bookings') ? 500 : 400,
                                }}
                                onMouseEnter={e => { if (!isActive('/my-bookings')) e.currentTarget.style.background = 'var(--theme-btn-bg)'; }}
                                onMouseLeave={e => { if (!isActive('/my-bookings')) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <History size={15} className="flex-shrink-0" />
                                <span>History</span>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Divider */}
                <div className="my-2 border-t" style={{ borderColor: 'var(--theme-border)' }} />

                {/* Personal group label */}
                <p className="text-[9px] font-semibold uppercase tracking-widest px-4 pb-1"
                    style={{ color: 'var(--theme-text-muted)', opacity: 0.6 }}>
                    Personal
                </p>

                {/* Profile */}
                <Link
                    href="/my-profile"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors"
                    style={{
                        background: isActive('/my-profile') ? 'var(--theme-btn-bg)' : 'transparent',
                        color: isActive('/my-profile') ? 'var(--theme-text-head)' : 'var(--theme-text-2)',
                        fontWeight: isActive('/my-profile') ? 500 : 400,
                    }}
                    onMouseEnter={e => { if (!isActive('/my-profile')) e.currentTarget.style.background = 'var(--theme-btn-bg)'; }}
                    onMouseLeave={e => { if (!isActive('/my-profile')) e.currentTarget.style.background = 'transparent'; }}
                >
                    <User size={18} className="flex-shrink-0" />
                    <span className="flex-1">{t.nav.profile}</span>
                    {isActive('/my-profile') && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    )}
                </Link>

            </nav>

            {/* ── Footer ── */}
            <div className="p-4 border-t" style={{ borderColor: 'var(--theme-border)' }}>
                {/* Language + Theme toggles */}
                <div className="flex items-center gap-2 px-1 mb-2">
                    <div className="flex-1"><LanguageToggle /></div>
                    <ThemeToggle />
                </div>

                {/* User card */}
                <div className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'var(--theme-btn-bg)' }}>
                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <div
                                className="w-full h-full flex items-center justify-center text-xs font-display font-bold"
                                style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}
                            >
                                {initials}
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--theme-text-head)' }}>
                            {displayName}
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>Member</p>
                    </div>
                    <button
                        onClick={() => router.post(route('logout'))}
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                        style={{
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            color: '#ef4444',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                        title="Logout"
                    >
                        <LogOut size={13} />
                    </button>
                </div>
            </div>

        </aside>
    );
}

// ── Main Layout ───────────────────────────────────────────────────────────────
export default function CustomerLayout({ children }) {
    return (
        <div className="flex min-h-screen w-full" style={{ background: 'var(--theme-bg)' }}>
            <CustomerSidebar />
            <div className="flex-1 min-h-screen overflow-y-auto pb-24 md:pb-0">
                {children}
            </div>
            <BottomNav />
            <FloatingConcierge />
        </div>
    );
}