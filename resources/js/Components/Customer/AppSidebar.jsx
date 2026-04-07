import { useState, useEffect } from 'react';
import { Home, Sparkles, CalendarDays, User, Crown, ChevronDown, BookOpen, History, Users } from 'lucide-react';
import { Link, usePage } from '@inertiajs/react';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageToggle from "@/Components/Customer/LanguageToggle";
import ThemeToggle from "@/Components/ThemeToggle";

// API helper
async function apiFetch(url) {
    const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

export default function AppSidebar() {
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
      <div className="p-6 border-b border-glass-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full gold-gradient flex items-center justify-center flex-shrink-0">
            <Crown className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold">Infinity Home Spa</h2>
            <p className="text-[10px] text-muted-foreground">Dubai</p>
          </div>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 p-4 space-y-1">

        {/* Home */}
        <Link
          href="/dashboard"
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
            isActive('/dashboard')
              ? 'bg-secondary text-foreground font-medium'
              : 'text-muted-foreground hover:bg-secondary/60'
          }`}
        >
          <Home className="w-5 h-5 flex-shrink-0" />
          <span>{t.nav.home}</span>
        </Link>

        {/* Services */}
        <Link
          href="/services"
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
            isActive('/services')
              ? 'bg-secondary text-foreground font-medium'
              : 'text-muted-foreground hover:bg-secondary/60'
          }`}
        >
          <Sparkles className="w-5 h-5 flex-shrink-0" />
          <span>{t.nav.services}</span>
        </Link>

        {/* Therapists ← BAGONG ITEM */}
        <Link
          href="/therapists"
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
            isActive('/therapists')
              ? 'bg-secondary text-foreground font-medium'
              : 'text-muted-foreground hover:bg-secondary/60'
          }`}
        >
          <Users className="w-5 h-5 flex-shrink-0" />
          <span>Therapists</span>
        </Link>

        {/* Bookings — collapsible */}
        <div>
          <button
            onClick={() => setBookingsOpen(o => !o)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
              isOnBookings
                ? 'bg-secondary text-foreground font-medium'
                : 'text-muted-foreground hover:bg-secondary/60'
            }`}
          >
            <CalendarDays className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1 text-left">{t.nav.bookings}</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${bookingsOpen ? 'rotate-180' : ''}`}
            />
          </button>

          <div className={`overflow-hidden transition-all duration-200 ${
            bookingsOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
          }`}>
            <div className="ml-4 mt-1 space-y-1 border-l border-white/8 pl-3">
              <Link
                href="/book-session"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-colors ${
                  isActive('/book-session')
                    ? 'bg-secondary text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-secondary/60'
                }`}
              >
                <BookOpen className="w-4 h-4 flex-shrink-0" />
                <span>Book a Session</span>
              </Link>

              <Link
                href="/my-bookings"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-colors ${
                  isActive('/my-bookings')
                    ? 'bg-secondary text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-secondary/60'
                }`}
              >
                <History className="w-4 h-4 flex-shrink-0" />
                <span>History</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Profile */}
        <Link
          href="/my-profile"
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
            isActive('/my-profile')
              ? 'bg-secondary text-foreground font-medium'
              : 'text-muted-foreground hover:bg-secondary/60'
          }`}
        >
          <User className="w-5 h-5 flex-shrink-0" />
          <span>{t.nav.profile}</span>
        </Link>

      </nav>

      {/* ── Footer ── */}
      <div className="p-4 border-t border-glass-border space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1"><LanguageToggle /></div>
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full gold-gradient flex items-center justify-center text-xs font-display font-bold text-primary-foreground">
                {initials}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-[10px] text-muted-foreground">Member</p>
          </div>
        </div>
      </div>

    </aside>
  );
}