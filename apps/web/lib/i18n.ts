'use client'

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from '../locales/en.json';
import pt from '../locales/pt.json';
import { loadDateLocale } from './format';

const LOCALE_LOADERS: Record<string, () => Promise<{ default: any }>> = {
  fr: () => import('../locales/fr.json'),
  de: () => import('../locales/de.json'),
  es: () => import('../locales/es.json'),
  ar: () => import('../locales/ar.json'),
  ja: () => import('../locales/ja.json'),
  pt: () => import('../locales/pt.json'),
  ru: () => import('../locales/ru.json'),
  zh: () => import('../locales/zh.json'),
  hi: () => import('../locales/hi.json'),
  ko: () => import('../locales/ko.json'),
  it: () => import('../locales/it.json'),
  tr: () => import('../locales/tr.json'),
  vi: () => import('../locales/vi.json'),
  id: () => import('../locales/id.json'),
  pl: () => import('../locales/pl.json'),
  uk: () => import('../locales/uk.json'),
  nl: () => import('../locales/nl.json'),
  th: () => import('../locales/th.json'),
  bn: () => import('../locales/bn.json'),
  fa: () => import('../locales/fa.json'),
  sk: () => import('../locales/sk.json'),
};

// Discipulei (N04, Brazil-only): Portuguese is the default language, so it is
// bundled alongside English (the last-resort fallback). Every other locale is
// lazy-loaded on demand. `pt` stays in LOCALE_LOADERS so the registry test
// keeps passing; loadLocale() skips it because the bundle is already present.
const resources = {
  en: { common: en },
  pt: { common: pt },
};

/**
 * Detection cache keys. Renamed from upstream's `i18nextLng` / `i18next` so
 * values cached before Portuguese became the default (usually `en-US`, taken
 * from the browser) are ignored. MIRRORED in public/dir-init.js and
 * lib/direction.ts — update all three together.
 */
export const LANGUAGE_STORAGE_KEY = 'discipulei_lng'
export const LANGUAGE_USER_PICKED_KEY = 'discipulei_lng_userPicked'

async function loadLocale(lng: string) {
  const code = lng.split('-')[0]
  if (code === 'en' || !LOCALE_LOADERS[code]) return;
  if (i18n.hasResourceBundle(code, 'common')) return;

  try {
    const mod = await LOCALE_LOADERS[code]();
    i18n.addResourceBundle(code, 'common', mod.default, true, true);
  } catch (e) {
    console.warn(`Failed to load locale: ${lng}`, e);
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // No explicit choice (nothing cached, no ?lng=) resolves to Portuguese.
    fallbackLng: ['pt', 'en'],
    ns: ['common'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
    detection: {
      // No 'navigator': a browser set to English must still get Portuguese.
      // No 'path'/'subdomain': without supportedLngs they would turn the first
      // URL segment (e.g. "signup", "orgs") into a "language".
      order: ['localStorage', 'cookie', 'querystring'],
      caches: ['localStorage', 'cookie'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      lookupCookie: LANGUAGE_STORAGE_KEY,
    },
    react: {
      useSuspense: false,
      // Re-render when a lazily loaded bundle lands. Without this, a language
      // detected at startup (e.g. "pt-BR") set i18n.language — so the switcher
      // showed "PT" — while the tree kept rendering the English fallback,
      // because addResourceBundle() fires no languageChanged event.
      bindI18nStore: 'added',
    }
  });

// Load the detected language if it's not English — export the promise
// so I18nProvider can wait for resources before rendering.
// The date locale rides along: dayjs keeps its own registry, and without this
// every "2 hours ago" renders in English no matter the language.
export const initialLocaleReady = Promise.all([
  loadLocale(i18n.language.split('-')[0]),
  loadDateLocale(i18n.language),
]).then(() => undefined);

/**
 * Switch language safely — preloads the bundle before switching
 * so the UI never flashes English as a fallback.
 */
export async function changeLanguage(lng: string) {
  await Promise.all([loadLocale(lng), loadDateLocale(lng)])
  return i18n.changeLanguage(lng)
}

export default i18n;
