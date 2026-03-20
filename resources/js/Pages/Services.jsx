import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { router } from '@inertiajs/react';
import { useLanguage } from '@/contexts/LanguageContext';
import ServiceCard from '@/Components/Customer/ServiceCard';
import { servicesData } from '@/data/services';

export default function Services() {
  const { t, locale } = useLanguage();
  const [activeCategory, setActiveCategory] = useState('all');

  const categories = [
    { key: 'all', label: t.services.categories.all },
    { key: 'massage', label: t.services.categories.massage },
    { key: 'facials', label: t.services.categories.facials },
    { key: 'homeRituals', label: t.services.categories.homeRituals },
  ];

  const filtered = activeCategory === 'all'
    ? servicesData
    : servicesData.filter((s) => s.category === activeCategory);

  const handleBook = (service) => {
    // In Laravel, use router.visit with data
    router.visit('/bookings');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 glass-card-strong rounded-none border-x-0 border-t-0 px-5 pt-[env(safe-area-inset-top)] pb-4">
        <div className="pt-3 max-w-6xl mx-auto">
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-xl font-bold"
          >
            {t.services.title}
          </motion.h1>
          <p className="text-xs text-muted-foreground mt-1">{t.services.subtitle}</p>
        </div>
      </header>

      <main className="px-4 pt-5 max-w-6xl mx-auto">
        {/* Category Filters */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeCategory === cat.key
                  ? 'gold-gradient text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence mode="wait">
            {filtered.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                onBook={handleBook}
                bookLabel={t.services.bookNow}
                durationLabel={t.services.duration}
                locale={locale}
              />
            ))}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
