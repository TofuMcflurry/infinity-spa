import { useEffect, useRef } from 'react';
import { Link, router, usePage } from '@inertiajs/react';
import {
    Home, CalendarPlus, Calendar, Sparkles, Users, Heart,
    User as UserIcon, X, ChevronRight, LogOut, Sun, Moon,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/hooks/useTheme';

// Matches the Claude Design prototype's MobileMenuSheet exactly: account
// card, the 7 Customer destinations (PAGES in the prototype script),
// language + theme segmented controls, and a logout action — see README.md
// in the design handoff ("MobileMenuSheet (opens from the menu button...)").
const LINKS = [
    { key: 'dashboard',  label: 'Dashboard',      icon: Home,         path: '/dashboard'    },
    { key: 'bookings',   label: 'Book a Session', icon: CalendarPlus, path: '/book-session' },
    { key: 'mybookings', label: 'My Bookings',    icon: Calendar,     path: '/my-bookings'  },
    { key: 'services',   label: 'Services',       icon: Sparkles,     path: '/services'     },
    { key: 'therapists', label: 'Therapists',     icon: Users,        path: '/therapists'   },
    { key: 'wishlist',   label: 'Wishlist',       icon: Heart,        path: '/wishlist'     },
    { key: 'profile',    label: 'Profile',        icon: UserIcon,     path: '/my-profile'   },
];

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function MobileMenuSheet({ open, onClose, avatarUrl, name }) {
    const { locale, setLocale } = useLanguage();
    const { theme, toggleTheme } = useTheme();
    const { url, props } = usePage();
    const panelRef = useRef(null);

    const user = props.auth?.user;
    const displayName = name || user?.name || 'Guest';
    const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    const isActive = (path) => (path === '/dashboard' ? url === '/dashboard' : url.startsWith(path));

    // Dashboard passes a fresh `onClose` closure on every one of its own
    // re-renders (background polling, etc). Routing calls through a ref
    // keeps the lifecycle effect below keyed on `open` alone, so it doesn't
    // tear down and reinstall — losing focus-trap state — on every
    // unrelated parent render while the sheet stays open.
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    // Scroll lock, Escape-to-close, focus trap, and focus restoration — the
    // prototype only specifies backdrop-dismiss; the rest is standard dialog
    // a11y this component needs regardless of what the reference shows.
    useEffect(() => {
        if (!open) return undefined;

        const previouslyFocused = document.activeElement;
        const prevBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const focusFirst = () => {
            const first = panelRef.current?.querySelector(FOCUSABLE_SELECTOR);
            first?.focus();
        };
        const raf = requestAnimationFrame(focusFirst);

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onCloseRef.current();
                return;
            }
            if (e.key !== 'Tab' || !panelRef.current) return;
            const focusables = Array.from(panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.body.style.overflow = prevBodyOverflow;
            document.removeEventListener('keydown', onKeyDown);
            cancelAnimationFrame(raf);
            if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] md:hidden">
            <div
                className="absolute inset-0"
                style={{ background: 'rgba(28,22,12,0.45)' }}
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="Menu"
                className="absolute bottom-0 left-0 right-0 flex flex-col"
                style={{
                    maxHeight: '90dvh',
                    background: 'var(--theme-bg)',
                    borderRadius: '26px 26px 0 0',
                    boxShadow: '0 -12px 40px rgba(0,0,0,0.18)',
                }}
            >
                <div className="mx-auto mt-2 mb-0.5 w-10 h-[5px] rounded-full flex-shrink-0" style={{ background: '#d9cfbc' }} />

                <div
                    className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 flex flex-col gap-3.5"
                    style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))', overscrollBehavior: 'contain' }}
                >
                    {/* Account card */}
                    <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}>
                        <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <div
                                    className="w-full h-full flex items-center justify-center font-display font-bold text-[17px]"
                                    style={{ background: 'linear-gradient(135deg,#b7882a,#e2b764,#f0c97a)', color: '#0b1120' }}
                                >
                                    {initials}
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-bold truncate" style={{ color: 'var(--theme-text-head)' }}>{displayName}</p>
                            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Customer · Infinity Home Spa</p>
                        </div>
                        <button
                            onClick={onClose}
                            aria-label="Close menu"
                            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ color: 'var(--theme-text-2)' }}
                        >
                            <X size={22} />
                        </button>
                    </div>

                    {/* The 7 Customer destinations */}
                    <div className="flex flex-col gap-0.5 p-1.5 rounded-2xl" style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}>
                        {LINKS.map(({ key, label, icon: Icon, path }) => {
                            const active = isActive(path);
                            return (
                                <Link
                                    key={key}
                                    href={path}
                                    onClick={onClose}
                                    className="flex items-center gap-3 h-12 px-3 rounded-xl text-[15px] font-semibold"
                                    style={{
                                        background: active ? 'var(--theme-tag-gold-bg)' : 'transparent',
                                        color: active ? 'var(--theme-link)' : 'var(--theme-text-head)',
                                    }}
                                >
                                    <Icon size={21} className="flex-shrink-0" />
                                    <span className="flex-1 text-left">{label}</span>
                                    <ChevronRight size={18} style={{ color: 'var(--theme-text-muted)', opacity: 0.6 }} />
                                </Link>
                            );
                        })}
                    </div>

                    {/* Language + Theme — reuse the same setLocale / toggleTheme state
                        LanguageToggle and ThemeToggle already drive elsewhere. */}
                    <div className="grid grid-cols-2 gap-2.5">
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--theme-text-muted)' }}>
                                Language
                            </span>
                            <div className="grid grid-cols-2 gap-[3px] p-[3px] rounded-xl" style={{ background: 'var(--theme-btn-bg)' }}>
                                <button
                                    onClick={() => setLocale('en')}
                                    aria-pressed={locale === 'en'}
                                    className="h-10 rounded-lg text-[13px] font-bold"
                                    style={{ background: locale === 'en' ? '#1f1c17' : 'transparent', color: locale === 'en' ? '#faf7f1' : 'var(--theme-text-2)' }}
                                >
                                    EN
                                </button>
                                <button
                                    onClick={() => setLocale('ar')}
                                    aria-pressed={locale === 'ar'}
                                    className="h-10 rounded-lg text-[13px] font-bold"
                                    style={{ background: locale === 'ar' ? '#1f1c17' : 'transparent', color: locale === 'ar' ? '#faf7f1' : 'var(--theme-text-2)' }}
                                >
                                    عربي
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--theme-text-muted)' }}>
                                Theme
                            </span>
                            <div className="grid grid-cols-2 gap-[3px] p-[3px] rounded-xl" style={{ background: 'var(--theme-btn-bg)' }}>
                                <button
                                    onClick={() => theme !== 'light' && toggleTheme()}
                                    aria-label="Light theme"
                                    aria-pressed={theme === 'light'}
                                    className="h-10 rounded-lg flex items-center justify-center"
                                    style={{ background: theme === 'light' ? '#1f1c17' : 'transparent', color: theme === 'light' ? '#faf7f1' : 'var(--theme-text-2)' }}
                                >
                                    <Sun size={18} />
                                </button>
                                <button
                                    onClick={() => theme !== 'dark' && toggleTheme()}
                                    aria-label="Dark theme"
                                    aria-pressed={theme === 'dark'}
                                    className="h-10 rounded-lg flex items-center justify-center"
                                    style={{ background: theme === 'dark' ? '#1f1c17' : 'transparent', color: theme === 'dark' ? '#faf7f1' : 'var(--theme-text-2)' }}
                                >
                                    <Moon size={18} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Logout — same call CustomerSidebar's own logout button uses. */}
                    <button
                        onClick={() => router.post(route('logout'))}
                        className="h-12 rounded-xl flex-shrink-0 flex items-center justify-center gap-2 font-bold text-[15px]"
                        style={{ border: '1px solid #f1c6bf', background: 'var(--theme-card)', color: '#b13a2a' }}
                    >
                        <LogOut size={19} />
                        Log out
                    </button>
                </div>
            </div>
        </div>
    );
}
