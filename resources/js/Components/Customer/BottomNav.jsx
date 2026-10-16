import { Home, Sparkles, Calendar, User, Plus } from 'lucide-react';
import { Link, usePage } from '@inertiajs/react';
import { useLanguage } from '@/contexts/LanguageContext';

// Mirrors the Claude Design prototype's mobile nav exactly: Home / Services /
// a raised gold "Book" circle / Bookings / Profile, in a 1fr 1fr 64px 1fr 1fr
// grid. Hidden on the booking wizard, which has its own sticky action bar —
// see README.md in the design handoff ("Hide it on the Bookings wizard page").
function NavTab({ icon: Icon, label, path, active }) {
  return (
    <Link
      href={path}
      className="flex flex-col items-center justify-center gap-0.5 h-[52px] min-w-0"
      style={{ color: active ? 'var(--theme-link)' : 'var(--theme-text-muted)' }}
    >
      <Icon size={24} strokeWidth={active ? 1.75 : 2} fill={active ? 'currentColor' : 'none'} />
      <span className="text-[11px] truncate" style={{ fontWeight: active ? 700 : 600 }}>
        {label}
      </span>
    </Link>
  );
}

export default function BottomNav() {
  const { t } = useLanguage();
  const { url } = usePage();

  if (url.startsWith('/book-session')) return null;

  const isActive = (path) => (path === '/dashboard' ? url === '/dashboard' : url.startsWith(path));

  const leftTabs = [
    { icon: Home, label: t.nav.home, path: '/dashboard' },
    { icon: Sparkles, label: t.nav.services, path: '/services' },
  ];
  const rightTabs = [
    { icon: Calendar, label: t.nav.bookings, path: '/my-bookings' },
    { icon: User, label: t.nav.profile, path: '/my-profile' },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-[1fr_1fr_64px_1fr_1fr] items-end md:hidden"
      style={{
        background: 'var(--theme-header-bg)',
        borderTop: '1px solid var(--theme-border)',
        paddingTop: 6,
        paddingLeft: 6,
        paddingRight: 6,
        paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
      }}
    >
      {leftTabs.map((tab) => (
        <NavTab key={tab.path} {...tab} active={isActive(tab.path)} />
      ))}

      <Link
        href="/book-session"
        aria-label="Book a session"
        className="flex flex-col items-center justify-end gap-[3px] h-[68px]"
        style={{ color: '#6e4f17' }}
      >
        <span
          className="flex items-center justify-center w-[52px] h-[52px] rounded-full -mt-[22px]"
          style={{
            background: 'linear-gradient(135deg, #c99a45, #e8c27a)',
            color: '#0b1120',
            boxShadow: '0 0 0 4px var(--theme-bg), 0 8px 18px -6px rgba(184, 134, 43, 0.6)',
          }}
        >
          <Plus size={26} strokeWidth={2.5} />
        </span>
        <span className="text-[11px] font-bold">{t.nav.book}</span>
      </Link>

      {rightTabs.map((tab) => (
        <NavTab key={tab.path} {...tab} active={isActive(tab.path)} />
      ))}
    </nav>
  );
}
