import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translations } from '@/i18n/translations';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    return localStorage.getItem('locale') || 'en';
  });

  const setLocale = useCallback((l) => {
    setLocaleState(l);
    localStorage.setItem('locale', l);
  }, []);

  const isRTL = locale === 'ar';

  useEffect(() => {
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t: translations[locale], isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
