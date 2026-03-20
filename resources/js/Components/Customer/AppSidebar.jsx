import { Home, Sparkles, CalendarDays, User, Crown } from 'lucide-react';
import { Link, usePage } from '@inertiajs/react';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageToggle from "@/Components/Customer/LanguageToggle";

export default function AppSidebar() {
  const { t } = useLanguage();
  const { url } = usePage();

  const navItems = [
    { icon: Home, label: t.nav.home, path: '/' },
    { icon: Sparkles, label: t.nav.services, path: '/services' },
    { icon: CalendarDays, label: t.nav.bookings, path: '/bookings' },
    { icon: User, label: t.nav.profile, path: '/profile' },
  ];

  const isActive = (path) => {
    if (path === '/') return url === '/';
    return url.startsWith(path);
  };

  return (
    <aside className="hidden md:flex flex-col w-64 min-h-screen sticky top-0 h-screen overflow-y-auto glass-card-strong rounded-none border-y-0 border-s-0">
      {/* Logo */}
      <div className="p-6 border-b border-glass-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full gold-gradient flex items-center justify-center">
            <Crown className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold">Infinity Home Spa</h2>
            <p className="text-[10px] text-muted-foreground">Dubai</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
              isActive(item.path)
                ? 'bg-secondary text-foreground font-medium'
                : 'text-muted-foreground hover:bg-secondary/60'
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-glass-border space-y-3">
        <LanguageToggle />
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-full gold-gradient flex items-center justify-center">
            <Crown className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Rashid Al Maktoum</p>
            <p className="text-[10px] text-muted-foreground">{t.header.platinumVip}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

