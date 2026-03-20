import { motion } from 'framer-motion';
import { Shield, MapPin, Heart, Droplets, Volume2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function VIPProfile() {
  const { t } = useLanguage();

  const locations = [
    { label: t.vip.home, sub: 'Palm Jumeirah' },
    { label: t.vip.office, sub: 'DIFC' },
    { label: t.vip.hotel, sub: 'Burj Al Arab' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="glass-card p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-gold" />
        <h3 className="font-display text-base font-semibold">{t.vip.title}</h3>
      </div>

      <div className="mb-4">
        <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">{t.vip.medicalNotes}</label>
        <div className="bg-secondary/50 rounded-xl p-3 text-sm text-foreground/80">
          No nut-based oils. Mild lower back sensitivity.
        </div>
      </div>

      <div className="mb-4">
        <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">{t.vip.savedLocations}</label>
        <div className="flex gap-2">
          {locations.map((loc) => (
            <div key={loc.label} className="flex-1 bg-secondary/50 rounded-xl p-3 text-center">
              <MapPin className="w-4 h-4 text-gold mx-auto mb-1" />
              <p className="text-xs font-medium">{loc.label}</p>
              <p className="text-[10px] text-muted-foreground">{loc.sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground uppercase tracking-wider mb-3 block">{t.vip.massagePreferences}</label>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Heart className="w-3.5 h-3.5 text-gold" />
              <span className="text-sm">{t.vip.pressureLevel}</span>
            </div>
            <div className="flex gap-1">
              {[t.vip.light, t.vip.medium, t.vip.firm].map((level, i) => (
                <span
                  key={level}
                  className={`text-xs px-3 py-1 rounded-full transition-colors ${
                    i === 2 ? 'gold-gradient text-primary-foreground font-medium' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {level}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets className="w-3.5 h-3.5 text-gold" />
              <span className="text-sm">{t.vip.oilType}</span>
            </div>
            <span className="text-sm text-gold font-medium">Argan</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="w-3.5 h-3.5 text-gold" />
              <span className="text-sm">{t.vip.silenceMode}</span>
            </div>
            <div className="w-10 h-5 rounded-full gold-gradient flex items-center justify-end px-0.5">
              <div className="w-4 h-4 bg-primary-foreground rounded-full shadow-sm" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

