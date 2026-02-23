import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { zh } from '../locales/zh';
import { en } from '../locales/en';

export type Locale = 'zh' | 'en';

type LocaleMessages = typeof zh;

const translations: Record<Locale, LocaleMessages> = { zh, en: en as unknown as LocaleMessages };

const STORAGE_KEY = 'asset-manage-locale';

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: <K extends keyof LocaleMessages>(key: K, ...args: any[]) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
      return saved === 'zh' || saved === 'en' ? saved : 'zh';
    } catch {
      return 'zh';
    }
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
    } catch {}
  }, []);

  const t = useCallback(<K extends keyof LocaleMessages>(key: K, ...args: any[]): string => {
    const messages = translations[locale];
    const value = messages[key];
    if (typeof value === 'function') {
      return (value as (...a: any[]) => string)(...args);
    }
    return value as string;
  }, [locale]);

  const value: I18nContextType = { locale, setLocale, t };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export function useT() {
  return useI18n().t;
}
