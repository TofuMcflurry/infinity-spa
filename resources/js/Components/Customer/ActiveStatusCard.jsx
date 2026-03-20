import { motion } from 'framer-motion';
import { Phone, MapPin, Clock } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ActiveStatusCard() {
  const { t } = useLanguage();
  const progress = 65;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="glass-card-strong p-5 shimmer"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse-gold" />
          <span className="text-xs font-medium uppercase tracking-widest text-emerald-400">
            {t.status.liveTracking}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{t.status.eta} 12 {t.status.min}</span>
      </div>

      <h3 className="font-display text-lg font-semibold mb-1">{t.status.therapistOnWay}</h3>
      <p className="text-sm text-muted-foreground mb-4">Maria S. • Deep Tissue Massage • 90 min</p>

      <div className="relative h-1.5 bg-secondary rounded-full mb-4 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="absolute h-full rounded-full gold-gradient"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full gold-gradient border-2 border-background shadow-lg"
          style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground mb-5">
        <div className="flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          <span>{t.status.confirmed}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>{t.status.enRoute}</span>
        </div>
        <span className="text-muted-foreground/50">{t.status.arrived}</span>
      </div>

      <button className="btn-ghost-gold w-full flex items-center justify-center gap-2">
        <Phone className="w-4 h-4" />
        {t.status.callAdmin}
      </button>
    </motion.div>
  );
}

