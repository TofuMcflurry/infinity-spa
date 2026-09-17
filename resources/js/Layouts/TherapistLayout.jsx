import { useState, useEffect, useCallback } from 'react';
import { Link, usePage, router } from '@inertiajs/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Home, CalendarDays, User, Calendar, TrendingUp,
    Crown, LogOut, Menu, X, ChevronRight,
    Bell, CheckCheck,
} from 'lucide-react';
import ThemeToggle from '@/Components/ThemeToggle';

// ── Nav items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
    { icon: Home,         label: 'Dashboard',   href: '/therapist/dashboard' },
    { icon: CalendarDays, label: 'Bookings',     href: '/therapist/bookings'  },
    { icon: User,         label: 'Profile',      href: '/therapist/profile'   },
    { icon: Calendar,     label: 'My Schedule',  href: '/therapist/schedule'  },
    { icon: TrendingUp,   label: 'Earnings',     href: '/therapist/earnings'  },
];

const MOBILE_TABS = [
    { icon: Home,         label: 'Dashboard', href: '/therapist/dashboard' },
    { icon: CalendarDays, label: 'Bookings',  href: '/therapist/bookings'  },
    { icon: User,         label: 'Profile',   href: '/therapist/profile'   },
    { icon: Calendar,     label: 'Schedule',  href: '/therapist/schedule'  },
    { icon: TrendingUp,   label: 'Earnings',  href: '/therapist/earnings'  },
];

const mainNav     = NAV_ITEMS.slice(0, 2);
const personalNav = NAV_ITEMS.slice(2);

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name = '') {
    return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'T';
}

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

// ── Notification bell ─────────────────────────────────────────────────────────
function NotificationBell() {
    const [open, setOpen]               = useState(false);
    const [notifications, setNotifs]    = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);

    const fetchNotifs = useCallback(() => {
        apiFetch('/api/notifications')
            .then(data => {
                setNotifs(data.notifications ?? []);
                setUnreadCount(data.unread_count ?? 0);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        fetchNotifs();
        const id = setInterval(fetchNotifs, 30000);
        return () => clearInterval(id);
    }, [fetchNotifs]);

    const markRead = async (id) => {
        try {
            await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
            setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch {}
    };

    const markAllRead = async () => {
        try {
            await apiFetch('/api/notifications/read-all', { method: 'POST' });
            setNotifs(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadCount(0);
        } catch {}
    };

    const timeAgo = (dateStr) => {
        if (!dateStr) return '';
        const diff = Date.now() - new Date(dateStr).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'just now';
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    };

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}
            >
                <Bell size={16} style={{ color: 'var(--theme-text-2)' }} />
                {unreadCount > 0 && (
                    <span
                        className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full text-[10px] font-bold flex items-center justify-center px-1"
                        style={{ background: '#e2b764', color: '#0b1120' }}
                    >
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                        <motion.div
                            initial={{ opacity: 0, y: -8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0,  scale: 1    }}
                            exit={{    opacity: 0, y: -8, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 top-11 z-50 w-80 rounded-2xl shadow-2xl overflow-hidden"
                            style={{ background: 'var(--theme-notif-bg)', border: '1px solid var(--theme-border)' }}
                        >
                            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                                <div className="flex items-center gap-2">
                                    <Bell size={13} style={{ color: '#e2b764' }} />
                                    <span className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>Notifications</span>
                                    {unreadCount > 0 && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                            style={{ background: 'rgba(226,183,100,0.15)', color: '#e2b764' }}>
                                            {unreadCount} new
                                        </span>
                                    )}
                                </div>
                                {unreadCount > 0 && (
                                    <button
                                        onClick={markAllRead}
                                        className="flex items-center gap-1 text-[10px] font-semibold"
                                        style={{ color: 'var(--theme-text-muted)' }}
                                        onMouseEnter={e => e.currentTarget.style.color = '#e2b764'}
                                        onMouseLeave={e => e.currentTarget.style.color = 'var(--theme-text-muted)'}
                                    >
                                        <CheckCheck size={11} /> Mark all read
                                    </button>
                                )}
                            </div>

                            <div className="max-h-80 overflow-y-auto">
                                {notifications.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-center">
                                        <Bell size={24} style={{ color: 'var(--theme-border)' }} />
                                        <p className="text-sm mt-3" style={{ color: 'var(--theme-text-muted)' }}>No notifications yet</p>
                                    </div>
                                ) : (
                                    notifications.map(n => (
                                        <button
                                            key={n.id}
                                            onClick={() => { markRead(n.id); setOpen(false); }}
                                            className="w-full text-left px-4 py-3 transition-colors border-b last:border-b-0"
                                            style={{
                                                borderColor: 'var(--theme-border)',
                                                background: n.read ? 'transparent' : 'rgba(226,183,100,0.04)',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--theme-divider)'}
                                            onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(226,183,100,0.04)'}
                                        >
                                            <div className="flex items-start gap-3">
                                                {!n.read && (
                                                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#e2b764' }} />
                                                )}
                                                <div className={`flex-1 min-w-0 ${n.read ? 'pl-4' : ''}`}>
                                                    <p className="text-xs font-semibold leading-snug" style={{ color: 'var(--theme-text-head)' }}>{n.title}</p>
                                                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--theme-text-2)' }}>{n.message}</p>
                                                    <p className="text-[10px] mt-1" style={{ color: 'var(--theme-text-muted)' }}>{timeAgo(n.created_at)}</p>
                                                </div>
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
    );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function TherapistSidebar({ user }) {
    const { url } = usePage();
    const isActive = (href) => href && url.startsWith(href);

    const NavLink = ({ item }) => {
        const Icon   = item.icon;
        const active = isActive(item.href);

        if (item.soon) {
            return (
                <div
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm cursor-not-allowed"
                    style={{ color: 'var(--theme-text-muted)', opacity: 0.5 }}
                >
                    <Icon size={18} className="flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    <span
                        className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                        style={{
                            background: 'rgba(226,183,100,0.08)',
                            border: '1px solid rgba(226,183,100,0.2)',
                            color: '#b7882a',
                        }}
                    >
                        Soon
                    </span>
                </div>
            );
        }

        return (
            <Link
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
                    active ? 'bg-secondary font-medium' : 'hover:bg-secondary/60'
                }`}
                style={{ color: active ? 'var(--theme-text-head)' : 'var(--theme-text-2)' }}
            >
                <Icon size={18} className="flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {active && <ChevronRight size={14} style={{ opacity: 0.5 }} />}
            </Link>
        );
    };

    return (
        <aside className="hidden md:flex flex-col w-64 sticky top-0 h-screen glass-card-strong rounded-none border-y-0 border-s-0">

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
                            Therapist Portal
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Nav ── */}
            <nav className="p-3 flex-1 flex flex-col gap-0.5">
                <p className="text-[9px] font-semibold uppercase tracking-widest px-4 pb-1 mt-1"
                    style={{ color: 'var(--theme-text-muted)', opacity: 0.6 }}>
                    Main
                </p>
                {mainNav.map(item => <NavLink key={item.label} item={item} />)}

                <div className="my-2 border-t" style={{ borderColor: 'var(--theme-border)' }} />

                <p className="text-[9px] font-semibold uppercase tracking-widest px-4 pb-1"
                    style={{ color: 'var(--theme-text-muted)', opacity: 0.6 }}>
                    Personal
                </p>
                {personalNav.map(item => <NavLink key={item.label} item={item} />)}
            </nav>

            {/* ── Footer ── */}
            <div className="p-4 border-t" style={{ borderColor: 'var(--theme-border)' }}>
                <div className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'var(--theme-btn-bg)' }}>
                    <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-display font-bold flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}
                    >
                        {getInitials(user?.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate" style={{ color: 'var(--theme-text-head)' }}>
                            {user?.name ?? 'Therapist'}
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>Therapist</div>
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

// ── Mobile top bar ────────────────────────────────────────────────────────────
function MobileTopBar({ user, menuOpen, setMenuOpen }) {
    return (
        <header
            className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 border-b"
            style={{
                background: 'var(--theme-header-bg)',
                borderColor: 'var(--theme-border)',
                backdropFilter: 'blur(16px)',
            }}
        >
            <div className="flex items-center gap-2.5">
                <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}
                >
                    <Crown size={14} />
                </div>
                <div>
                    <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>Infinity Home Spa</p>
                    <p className="text-sm font-display font-bold leading-tight" style={{ color: 'var(--theme-text-head)' }}>
                        {user?.name ?? 'Therapist'}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <ThemeToggle />
                <NotificationBell />
                <button
                    onClick={() => setMenuOpen(o => !o)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}
                >
                    {menuOpen
                        ? <X size={16} style={{ color: '#e2b764' }} />
                        : <Menu size={16} style={{ color: 'var(--theme-text-2)' }} />
                    }
                </button>
            </div>
        </header>
    );
}

// ── Mobile slide-down menu ────────────────────────────────────────────────────
function MobileMenu({ user, onClose }) {
    const { url } = usePage();
    const isActive = (href) => href && url.startsWith(href);

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="md:hidden fixed inset-x-0 top-[57px] z-30 border-b shadow-2xl"
            style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}
        >
            <nav className="p-3 space-y-1">
                {NAV_ITEMS.map(item => {
                    const Icon   = item.icon;
                    const active = isActive(item.href);

                    if (item.soon) {
                        return (
                            <div
                                key={item.label}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
                                style={{ color: 'var(--theme-text-muted)', opacity: 0.5 }}
                            >
                                <Icon size={16} className="flex-shrink-0" />
                                <span className="flex-1">{item.label}</span>
                                <span
                                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                                    style={{
                                        background: 'rgba(226,183,100,0.08)',
                                        border: '1px solid rgba(226,183,100,0.15)',
                                        color: '#b7882a',
                                    }}
                                >
                                    Soon
                                </span>
                            </div>
                        );
                    }

                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            onClick={onClose}
                            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors"
                            style={{
                                background: active ? 'rgba(226,183,100,0.1)' : 'transparent',
                                color:      active ? '#e2b764' : 'var(--theme-text-2)',
                                border:     active ? '1px solid rgba(226,183,100,0.2)' : '1px solid transparent',
                            }}
                        >
                            <Icon size={16} className="flex-shrink-0" />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-3 border-t" style={{ borderColor: 'var(--theme-border)' }}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 px-3 py-2">
                        <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}
                        >
                            {getInitials(user?.name)}
                        </div>
                        <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--theme-text-head)' }}>{user?.name ?? 'Therapist'}</p>
                            <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>Therapist</p>
                        </div>
                    </div>
                    <button
                        onClick={() => router.post(route('logout'))}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            color: '#ef4444',
                        }}
                    >
                        <LogOut size={13} />
                        Logout
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

// ── Mobile bottom nav ─────────────────────────────────────────────────────────
function TherapistBottomNav() {
    const { url } = usePage();
    const isActive = (href) => href && url.startsWith(href);

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-50 md:hidden px-2 pb-[env(safe-area-inset-bottom)]"
            style={{
                background: 'var(--theme-header-bg)',
                backdropFilter: 'blur(20px)',
                borderTop: '1px solid var(--theme-border)',
                boxShadow: '0 -4px 24px rgba(0,0,0,0.2)',
            }}
        >
            <div className="flex items-center justify-around py-2">
                {MOBILE_TABS.map(tab => {
                    const Icon   = tab.icon;
                    const active = isActive(tab.href);

                    return (
                        <Link
                            key={tab.label}
                            href={tab.href}
                            className="relative flex flex-col items-center gap-0.5 py-1.5 px-3 min-w-[48px]"
                        >
                            {active && (
                                <motion.div
                                    layoutId="therapist-nav-indicator"
                                    className="absolute -top-0.5 w-8 h-0.5 rounded-full"
                                    style={{ background: 'linear-gradient(90deg, #b7882a, #e2b764)' }}
                                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                />
                            )}
                            <Icon
                                size={20}
                                style={{ color: active ? '#e2b764' : 'var(--theme-text-muted)' }}
                                className="transition-colors"
                            />
                            <span
                                className="text-[10px] font-medium transition-colors"
                                style={{ color: active ? '#e2b764' : 'var(--theme-text-muted)' }}
                            >
                                {tab.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}

// ── Main layout ───────────────────────────────────────────────────────────────
export default function TherapistLayout({ children }) {
    const { props } = usePage();
    const user      = props.auth?.user;
    const [menuOpen, setMenuOpen] = useState(false);

    const hour     = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const firstName = user?.name?.split(' ')[0] ?? 'Therapist';

    return (
        <div className="therapist-theme flex min-h-screen w-full" style={{ background: 'var(--theme-bg)' }}>

            {/* Desktop sidebar */}
            <TherapistSidebar user={user} />

            <div className="flex-1 min-h-screen overflow-y-auto pb-24 md:pb-0">

                {/* Mobile top bar */}
                <MobileTopBar user={user} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

                {/* Mobile slide-down menu + backdrop */}
                <AnimatePresence>
                    {menuOpen && (
                        <>
                            <motion.div
                                className="fixed inset-0 z-20 md:hidden"
                                style={{ background: 'rgba(0,0,0,0.4)' }}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setMenuOpen(false)}
                            />
                            <MobileMenu user={user} onClose={() => setMenuOpen(false)} />
                        </>
                    )}
                </AnimatePresence>

                {/* Desktop header */}
                <header
                    className="hidden md:flex items-center border-b backdrop-blur-xl sticky top-0 z-30"
                    style={{ background: 'var(--theme-header-bg)', borderColor: 'var(--theme-border)' }}
                >
                    <div className="max-w-7xl mx-auto w-full px-6 h-16 flex items-center justify-between">
                        {/* Greeting */}
                        <div className="min-w-0">
                            <div className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                                {greeting}
                            </div>
                            <h1 className="text-base font-display font-semibold truncate" style={{ color: 'var(--theme-text-head)' }}>
                                {firstName}
                            </h1>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            <ThemeToggle />
                            <NotificationBell />
                            <button
                                onClick={() => router.post(route('logout'))}
                                className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                                style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.querySelector('svg').style.color = '#ef4444'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'var(--theme-btn-bg)'; e.currentTarget.querySelector('svg').style.color = 'var(--theme-text-2)'; }}
                                title="Logout"
                            >
                                <LogOut size={16} style={{ color: 'var(--theme-text-2)' }} />
                            </button>
                        </div>
                    </div>
                </header>

                {children}

            </div>

            {/* Mobile bottom nav */}
            <TherapistBottomNav />

        </div>
    );
}