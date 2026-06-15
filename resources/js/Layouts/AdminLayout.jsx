import { useMemo, useState } from 'react';
import { Link, router, usePage } from '@inertiajs/react';
import { BarChart3, LayoutDashboard, Menu, Shield, Users, X, LogOut, CalendarCheck, UserPlus } from 'lucide-react';
import ThemeToggle from '@/Components/ThemeToggle';

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',     href: '/admin' },
  { icon: CalendarCheck,   label: 'Bookings',       href: '/admin/bookings' },
  { icon: Users,           label: 'Therapists',     href: '/admin/therapists' },
  { icon: UserPlus,        label: 'Guest Bookings', href: '/admin/guest-bookings', badge: true },
  { icon: BarChart3,       label: 'Reports',        href: '/admin/reports', soon: true },
];

function cn(...v) {
  return v.filter(Boolean).join(' ');
}

function initials(name = '') {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map(w => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'A'
  );
}

export default function AdminLayout({ title = 'Admin', children }) {
  const { url, props } = usePage();
  const user = props.auth?.user;
  const [mobileOpen, setMobileOpen] = useState(false);
  const pendingGuestCount = props.pendingGuestBookingsCount ?? 0;

  const firstName = useMemo(() => (user?.name || 'Admin').split(' ')[0], [user?.name]);

  const Sidebar = ({ onNavigate }) => (
    <div className="flex h-full flex-col">

      {/* ── Logo ── */}
      <div className="p-5 border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}
          >
            <Shield size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
              Infinity Home Spa
            </div>
            <div className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
              Admin Panel
            </div>
          </div>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className="p-3 flex-1 flex flex-col gap-0.5">

        {/* Main group */}
        <p className="text-[9px] font-semibold uppercase tracking-widest px-4 pb-1 mt-1"
          style={{ color: 'var(--theme-text-muted)', opacity: 0.6 }}>
          Main
        </p>

        {NAV.slice(0, 4).map(item => {
          const Icon = item.icon;
          const active = item.href && (url === item.href || url.startsWith(item.href + '/'));

          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors relative',
                active ? 'bg-secondary font-medium' : 'hover:bg-secondary/60'
              )}
              style={{ color: active ? 'var(--theme-text-head)' : 'var(--theme-text-2)' }}
            >
              <Icon size={18} className="flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge && pendingGuestCount > 0 && (
                <>
                  <span
                    className="absolute right-3 top-2 w-2 h-2 rounded-full animate-pulse"
                    style={{ background: '#ef4444' }}
                  />
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: '#ef4444', color: 'white' }}
                  >
                    {pendingGuestCount}
                  </span>
                </>
              )}
              {active && !item.badge && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ opacity: 0.5 }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
            </Link>
          );
        })}

        {/* Divider */}
        <div className="my-2 border-t" style={{ borderColor: 'var(--theme-border)' }} />

        {/* Reports (soon) */}
        {NAV.slice(4).map(item => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm cursor-not-allowed"
              style={{ color: 'var(--theme-text-muted)', opacity: 0.5 }}
            >
              <Icon size={18} className="flex-shrink-0" />
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
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="p-4 border-t" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'var(--theme-btn-bg)' }}>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-display font-bold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}
          >
            {initials(user?.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate" style={{ color: 'var(--theme-text-head)' }}>
              {user?.name ?? 'Admin'}
            </div>
            <div className="text-[10px] truncate" style={{ color: 'var(--theme-text-muted)' }}>
              Admin
            </div>
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

    </div>
  );

  return (
    <div className="min-h-screen flex w-full" style={{ background: 'var(--theme-bg)' }}>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:sticky lg:top-0 lg:h-screen glass-card-strong rounded-none border-y-0 border-s-0">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <button
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.45)' }}
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] glass-card-strong">
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              <div className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                Menu
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}
              >
                <X size={16} style={{ color: 'var(--theme-text-2)' }} />
              </button>
            </div>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-h-screen overflow-y-auto pb-6">

        {/* Header */}
        <header
          className="sticky top-0 z-30 border-b backdrop-blur-xl"
          style={{ background: 'var(--theme-header-bg)', borderColor: 'var(--theme-border)' }}
        >
          <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <button
                className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center"
                onClick={() => setMobileOpen(true)}
                style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}
              >
                <Menu size={16} style={{ color: 'var(--theme-text-2)' }} />
              </button>
              <div className="min-w-0">
                <div className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                  Welcome, {firstName}
                </div>
                <h1 className="text-base font-display font-semibold truncate" style={{ color: 'var(--theme-text-head)' }}>
                  {title}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                onClick={() => router.post(route('logout'))}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}
                title="Logout"
              >
                <LogOut size={16} style={{ color: 'var(--theme-text-2)' }} />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 md:px-8 py-6">
          {children}
        </main>

      </div>
    </div>
  );
}