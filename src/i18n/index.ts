import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import de from './de.json';

const resources = {
  en: { translation: en },
  de: { translation: de },
};

// Detect browser language
function detectBrowserLanguage(): string {
  const browserLang = navigator.language.split('-')[0];
  return Object.keys(resources).includes(browserLang) ? browserLang : 'en';
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: detectBrowserLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export const supportedLanguages = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
] as const;

export type SupportedLanguage = typeof supportedLanguages[number]['code'];

export async function changeLanguage(lang: SupportedLanguage): Promise<void> {
  await i18n.changeLanguage(lang);
}

export default i18n;
