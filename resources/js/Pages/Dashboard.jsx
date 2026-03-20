import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { motion } from 'framer-motion';
import { Bell, Crown, LogOut } from 'lucide-react';
import { usePage, router } from '@inertiajs/react';
import ActiveStatusCard from '@/Components/Customer/ActiveStatusCard';
import BookingHistory from '@/Components/Customer/BookingHistory';
import VIPProfile from '@/Components/Customer/VIPProfile';
import FinanceSection from '@/Components/Customer/FinanceSection';
import WellnessJourney from '@/Components/Customer/WellnessJourney';
import ClientPreferences from '@/Components/Customer/ClientPreferences';
import LanguageToggle from '@/Components/Customer/LanguageToggle';
import { useLanguage } from '@/contexts/LanguageContext';

export default function Dashboard() {
  const { t } = useLanguage();
  const { props } = usePage();

  const handleLogout = () => {
    router.post(route('logout'));
  };

  return (
    <AuthenticatedLayout>
      <div className="min-h-screen bg-background">
        {/* Sticky Header */}
        <header className="sticky top-0 z-40 glass-card-strong rounded-none border-x-0 border-t-0 px-5 pt-[env(safe-area-inset-top)] pb-4">
          <div className="flex items-center justify-between pt-3 max-w-6xl mx-auto">
            <div>
              <motion.p
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-xs text-muted-foreground uppercase tracking-widest"
              >
                {t.header.welcomeBack}
              </motion.p>
              <motion.h1
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="font-display text-xl font-bold mt-0.5"
              >
                {props.auth?.user?.name || 'Rashid Al Maktoum'}
              </motion.h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden md:block">
                <LanguageToggle />
              </div>
              <button className="relative p-2 rounded-xl bg-secondary">
                <Bell className="w-5 h-5 text-foreground/70" />
                <div className="absolute top-1 end-1 w-2 h-2 rounded-full gold-gradient" />
              </button>
              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="p-2 rounded-xl bg-secondary hover:bg-destructive/20 transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5 text-foreground/70" />
              </button>
              <div className="w-10 h-10 rounded-full gold-gradient flex items-center justify-center">
                <Crown className="w-5 h-5 text-primary-foreground" />
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="px-4 py-5 max-w-6xl mx-auto space-y-5">
          {/* VIP Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-gold/20 bg-gold/5"
          >
            <Crown className="w-5 h-5 text-gold" />
            <div>
              <p className="text-sm font-display font-semibold gold-text">
                {t.header.platinumVip}
              </p>
              <p className="text-[11px] text-muted-foreground">
                12 {t.header.sessionsCompleted} • {t.header.memberSince} 2023
              </p>
            </div>
          </motion.div>

          {/* Mobile language toggle */}
          <div className="md:hidden">
            <LanguageToggle />
          </div>

          {/* 3-column Desktop Grid / 1-column Mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* LEFT Column — Live Tracking + Bookings + Finance */}
            <div className="lg:col-span-2 space-y-5">
              <ActiveStatusCard />
              <BookingHistory />

              {/* Stats Row */}
              <div className="grid grid-cols-2 gap-4">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.25 }}
                  className="glass-card p-4 flex flex-col items-center justify-center text-center"
                >
                  <span className="text-2xl font-display font-bold gold-text">12</span>
                  <span className="text-[11px] text-muted-foreground mt-1">{t.stats.sessions}</span>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="glass-card p-4 flex flex-col items-center justify-center text-center"
                >
                  <span className="text-2xl font-display font-bold gold-text">4.9</span>
                  <span className="text-[11px] text-muted-foreground mt-1">{t.stats.avgRating}</span>
                </motion.div>
              </div>

              <WellnessJourney />
              <FinanceSection />
            </div>

            {/* RIGHT Column — VIP Profile + Preferences */}
            <div className="space-y-5">
              <VIPProfile />
              <ClientPreferences />
            </div>
          </div>
        </main>
      </div>
    </AuthenticatedLayout>
  );
}