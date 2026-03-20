import { motion } from 'framer-motion';
import { FileText, RotateCcw, Sparkles } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const bookings = [
  { id: 1, service: 'Royal Hammam Ritual', serviceAr: 'طقس الحمام الملكي', therapist: 'Layla K.', date: 'Today', time: '3:00 PM', status: 'upcoming', price: 'AED 850' },
  { id: 2, service: 'Deep Tissue Massage', serviceAr: 'تدليك الأنسجة العميقة', therapist: 'Maria S.', date: 'Feb 20', time: '7:00 PM', status: 'completed', price: 'AED 650' },
  { id: 3, service: 'Couples Aromatherapy', serviceAr: 'علاج عطري للأزواج', therapist: 'Amina R.', date: 'Feb 14', time: '6:00 PM', status: 'completed', price: 'AED 1,200' },
];

export default function BookingHistory() {
  const { t, locale } = useLanguage();

  const statusLabels = {
    completed: t.bookings.completed,
    upcoming: t.bookings.upcoming,
    cancelled: t.bookings.cancelled,
  };

  const statusColors = {
    completed: 'text-emerald-400',
    upcoming: 'text-gold',
    cancelled: 'text-destructive',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-base font-semibold">{t.bookings.title}</h3>
        <span className="text-xs text-muted-foreground">{t.bookings.viewAll}</span>
      </div>

      <div className="space-y-0">
        {bookings.map((booking, index) => (
          <div key={booking.id} className="relative ps-6 pb-5 last:pb-0">
            {index < bookings.length - 1 && (
              <div className="absolute start-[7px] top-3 w-px h-full bg-border" />
            )}
            <div
              className={`absolute start-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 ${
                booking.status === 'upcoming'
                  ? 'border-gold bg-gold/20'
                  : 'border-muted-foreground/30 bg-secondary'
              }`}
            />

            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{locale === 'ar' ? booking.serviceAr : booking.service}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {booking.therapist} • {booking.date}, {booking.time}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <Sparkles className="w-3 h-3 text-gold" />
                  <span className={`text-xs font-medium ${statusColors[booking.status]}`}>
                    {statusLabels[booking.status]}
                  </span>
                </div>
              </div>
              <div className="text-end">
                <span className="text-sm font-semibold gold-text">{booking.price}</span>
                <div className="flex gap-2 mt-2">
                  {booking.status === 'completed' && (
                    <>
                      <button className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors">
                        <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

