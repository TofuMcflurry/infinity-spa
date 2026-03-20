import { Home, Sparkles, CalendarDays, User } from 'lucide-react';
import { Link, usePage } from '@inertiajs/react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';

export default function BottomNav() {
  const { t } = useLanguage();
  const { url } = usePage();

  const tabs = [
    { icon: Home, label: t.nav.home, path: '/' },
    { icon: Sparkles, label: t.nav.services, path: '/services' },
    { icon: CalendarDays, label: t.nav.bookings, path: '/bookings' },
    { icon: User, label: t.nav.profile, path: '/profile' },
  ];

  const activeIndex = tabs.findIndex(
    (tab) => tab.path === '/' ? url === '/' : url.startsWith(tab.path)
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-card-strong rounded-none border-t border-glass-border border-x-0 border-b-0 px-2 pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="flex items-center justify-around py-2">
        {tabs.map((tab, i) => {
          const Icon = tab.icon;
          const isActive = activeIndex === i;
          return (
            <Link
              key={tab.path}
              href={tab.path}
              className="relative flex flex-col items-center gap-0.5 py-1.5 px-4 min-w-[64px] transition-colors"
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -top-0.5 w-8 h-0.5 rounded-full gold-gradient"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon
                className={`w-5 h-5 transition-colors ${
                  isActive ? 'text-gold' : 'text-muted-foreground'
                }`}
              />
              <span
                className={`text-[10px] font-medium transition-colors ${
                  isActive ? 'text-gold' : 'text-muted-foreground'
                }`}
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

