import { Home, Sparkles, CalendarDays, User, Users } from 'lucide-react';
import { Link, usePage } from '@inertiajs/react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';

export default function BottomNav() {
  const { t } = useLanguage();
  const { url } = usePage();

  const tabs = [
    { icon: Home,         label: t.nav.home,     path: '/dashboard'    },
    { icon: Sparkles,     label: t.nav.services, path: '/services'     },
    { icon: Users,        label: 'Therapists',   path: '/therapists'   },
    { icon: CalendarDays, label: t.nav.bookings, path: '/book-session' },
    { icon: User,         label: t.nav.profile,  path: '/my-profile'   },
  ];

  const isActive = (path) => {
    if (path === '/dashboard') return url === '/dashboard';
    return url.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-card-strong rounded-none border-t border-glass-border border-x-0 border-b-0 px-2 pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="flex items-center justify-around py-2">
        {tabs.map((tab) => {
          const Icon   = tab.icon;
          const active = isActive(tab.path);
          return (
            <Link
              key={tab.path}
              href={tab.path}
              className="relative flex flex-col items-center gap-0.5 py-1.5 px-3 min-w-[56px] transition-colors"
            >
              {active && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -top-0.5 w-8 h-0.5 rounded-full gold-gradient"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon className={`w-5 h-5 transition-colors ${active ? 'text-gold' : 'text-muted-foreground'}`} />
              <span className={`text-[10px] font-medium transition-colors ${active ? 'text-gold' : 'text-muted-foreground'}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}