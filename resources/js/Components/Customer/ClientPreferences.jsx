import { motion } from 'framer-motion';
import { Heart, Droplets, AlertTriangle, Pencil, Check } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState } from 'react';

const pressureOptions = [
  { en: 'Light', ar: 'خفيف' },
  { en: 'Medium', ar: 'متوسط' },
  { en: 'Firm', ar: 'قوي' },
];

const oilOptions = [
  { en: 'Lavender', ar: 'لافندر' },
  { en: 'Eucalyptus', ar: 'أوكالبتوس' },
  { en: 'Argan', ar: 'أرغان' },
  { en: 'Coconut', ar: 'جوز الهند' },
];

export default function ClientPreferences() {
  const { locale } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [prefs, setPrefs] = useState({
    pressure: 'Firm',
    oil: 'Lavender',
    allergies: 'Nut-based oils',
  });
  const [draft, setDraft] = useState(prefs);

  const handleSave = () => {
    setPrefs(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(prefs);
    setEditing(false);
  };

  const getLocalizedPressure = (val) => {
    const opt = pressureOptions.find((o) => o.en === val);
    return locale === 'ar' && opt ? opt.ar : val;
  };

  const getLocalizedOil = (val) => {
    const opt = oilOptions.find((o) => o.en === val);
    return locale === 'ar' && opt ? opt.ar : val;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="glass-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-base font-semibold">
          {locale === 'ar' ? 'تفضيلاتي' : 'My Preferences'}
        </h3>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5 text-gold" />
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="px-3 py-1 rounded-lg bg-secondary text-xs text-muted-foreground hover:bg-secondary/80 transition-colors"
            >
              {locale === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gold/20 text-xs text-gold font-medium hover:bg-gold/30 transition-colors"
            >
              <Check className="w-3 h-3" />
              {locale === 'ar' ? 'حفظ' : 'Save'}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {/* Pressure */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="w-3.5 h-3.5 text-gold" />
            <span className="text-sm text-muted-foreground">
              {locale === 'ar' ? 'الضغط المفضل' : 'Preferred Pressure'}
            </span>
          </div>
          {editing ? (
            <div className="flex gap-1">
              {pressureOptions.map((opt) => (
                <button
                  key={opt.en}
                  onClick={() => setDraft({ ...draft, pressure: opt.en })}
                  className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                    draft.pressure === opt.en
                      ? 'gold-gradient text-primary-foreground font-medium'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                  }`}
                >
                  {locale === 'ar' ? opt.ar : opt.en}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-sm font-medium text-gold">
              {getLocalizedPressure(prefs.pressure)}
            </span>
          )}
        </div>

        {/* Oil */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Droplets className="w-3.5 h-3.5 text-gold" />
            <span className="text-sm text-muted-foreground">
              {locale === 'ar' ? 'الزيت المفضل' : 'Favorite Oil'}
            </span>
          </div>
          {editing ? (
            <select
              value={draft.oil}
              onChange={(e) => setDraft({ ...draft, oil: e.target.value })}
              className="bg-secondary text-sm text-foreground rounded-lg px-2.5 py-1 border border-glass-border focus:outline-none focus:ring-1 focus:ring-gold"
            >
              {oilOptions.map((opt) => (
                <option key={opt.en} value={opt.en}>
                  {locale === 'ar' ? opt.ar : opt.en}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm font-medium text-gold">
              {getLocalizedOil(prefs.oil)}
            </span>
          )}
        </div>

        {/* Allergies */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-gold" />
            <span className="text-sm text-muted-foreground">
              {locale === 'ar' ? 'الحساسية' : 'Allergies'}
            </span>
          </div>
          {editing ? (
            <input
              type="text"
              value={draft.allergies}
              onChange={(e) => setDraft({ ...draft, allergies: e.target.value.slice(0, 100) })}
              className="bg-secondary text-sm text-foreground rounded-lg px-2.5 py-1 border border-glass-border focus:outline-none focus:ring-1 focus:ring-gold w-40 text-right"
              maxLength={100}
            />
          ) : (
            <span className="text-sm font-medium text-gold">{prefs.allergies}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

