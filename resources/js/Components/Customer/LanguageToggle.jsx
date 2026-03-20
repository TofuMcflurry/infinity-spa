import { Globe } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function LanguageToggle() {
  const { locale, setLocale, t } = useLanguage();

  return (
    <button
      onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-sm"
    >
      <Globe className="w-4 h-4 text-gold" />
      <span className="text-foreground/80">{locale === 'en' ? t.language.ar : t.language.en}</span>
    </button>
  );
}

