import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from '../locales/es.json';
import en from '../locales/en.json';

// Detect language from localStorage or browser
function getInitialLocale(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('arena_admin_lang');
    if (saved && (saved === 'es' || saved === 'en')) return saved;
    if (navigator.language.startsWith('es')) return 'es';
  }
  return 'es';
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    lng: getInitialLocale(),
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false,
    },
  });

export function setLocale(lang: string): void {
  i18n.changeLanguage(lang);
  localStorage.setItem('arena_admin_lang', lang);
}

export function getCurrentLocale(): string {
  return i18n.language || 'es';
}

export default i18n;
