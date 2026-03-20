import { motion } from 'framer-motion';
import { Clock, RotateCcw, Sparkles, User } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { router } from '@inertiajs/react';
import { useState } from 'react';

const pastSessions = [
  { id: 1, service: 'Deep Tissue Massage', serviceAr: 'تدليك الأنسجة العميقة', therapist: 'Maria S.', date: 'Feb 20, 2025', duration: '90 min' },
  { id: 2, service: 'Couples Aromatherapy', serviceAr: 'علاج عطري للأزواج', therapist: 'Amina R.', date: 'Feb 14, 2025', duration: '120 min' },
  { id: 3, service: 'Royal Hammam Ritual', serviceAr: 'طقس الحمام الملكي', therapist: 'Layla K.', date: 'Jan 30, 2025', duration: '90 min' },
  { id: 4, service: 'Hot Stone Therapy', serviceAr: 'العلاج بالأحجار الساخنة', therapist: 'Sara M.', date: 'Jan 15, 2025', duration: '60 min' },
];

export default function WellnessJourney() {
  const { t, locale } = useLanguage();
  const [rebookingId, setRebookingId] = useState(null);

  const handleRebook = (session) => {
    setRebookingId(session.id);
    setTimeout(() => {
      setRebookingId(null);
      router.visit('/bookings');
    }, 800);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="glass-card p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-gold" />
        <h3 className="font-display text-base font-semibold">
          {locale === 'ar' ? 'رحلة العافية' : 'My Wellness Journey'}
        </h3>
      </div>

      <div className="space-y-0">
        {pastSessions.map((session, index) => (
          <div key={session.id} className="relative pl-6 pb-4 last:pb-0">
            {index < pastSessions.length - 1 && (
              <div className="absolute left-[7px] top-3 w-px h-full bg-border" />
            )}
            <div className="absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 border-muted-foreground/30 bg-secondary" />

            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {locale === 'ar' ? session.serviceAr : session.service}
                </p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <User className="w-3 h-3" />
                  <span>{session.therapist}</span>
                  <span>•</span>
                  <Clock className="w-3 h-3" />
                  <span>{session.duration}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{session.date}</p>
              </div>
              <button
                onClick={() => handleRebook(session)}
                disabled={rebookingId === session.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold/10 hover:bg-gold/20 transition-colors text-xs font-medium text-gold shrink-0 disabled:opacity-50"
              >
                <RotateCcw className={`w-3 h-3 ${rebookingId === session.id ? 'animate-spin' : ''}`} />
                {rebookingId === session.id
                  ? (locale === 'ar' ? 'جارٍ...' : 'Rebooking...')
                  : (locale === 'ar' ? 'إعادة حجز' : 'Quick Rebook')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

