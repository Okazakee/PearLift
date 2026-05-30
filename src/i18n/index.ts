import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getSystemLanguage } from '@/i18n/systemLanguage';
import en from './locales/en.json';

export const SUPPORTED_I18N_LANGUAGE_CODES = [
  'en',
  'de',
  'fr',
  'es',
  'it',
  'pt',
  'nl',
  'pl',
  'sv',
  'da',
  'fi',
  'no',
  'cs',
  'hu',
  'ro',
  'el',
  'bg',
  'hr',
  'sk',
  'sl',
  'et',
  'lv',
  'lt',
  'zh',
  'ar',
  'hi',
  'ru',
  'ja',
  'ko',
  'tr',
  'vi',
  'th',
  'id',
] as const;

i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: { translation: en },
  },
  interpolation: {
    escapeValue: false,
  },
});

const detected = getSystemLanguage(SUPPORTED_I18N_LANGUAGE_CODES, 'en');

function loadAndSwitch(
  code: string,
  module: Promise<{ default: Record<string, unknown> }>,
) {
  module.then((m) => {
    i18n.addResourceBundle(code, 'translation', m.default);
    i18n.changeLanguage(code);
  });
}

if (detected !== 'en') {
  switch (detected) {
    case 'de':
      loadAndSwitch('de', import('./locales/de.json'));
      break;
    case 'fr':
      loadAndSwitch('fr', import('./locales/fr.json'));
      break;
    case 'es':
      loadAndSwitch('es', import('./locales/es.json'));
      break;
    case 'it':
      loadAndSwitch('it', import('./locales/it.json'));
      break;
    case 'pt':
      loadAndSwitch('pt', import('./locales/pt.json'));
      break;
    case 'nl':
      loadAndSwitch('nl', import('./locales/nl.json'));
      break;
    case 'pl':
      loadAndSwitch('pl', import('./locales/pl.json'));
      break;
    case 'sv':
      loadAndSwitch('sv', import('./locales/sv.json'));
      break;
    case 'da':
      loadAndSwitch('da', import('./locales/da.json'));
      break;
    case 'fi':
      loadAndSwitch('fi', import('./locales/fi.json'));
      break;
    case 'no':
      loadAndSwitch('no', import('./locales/no.json'));
      break;
    case 'cs':
      loadAndSwitch('cs', import('./locales/cs.json'));
      break;
    case 'hu':
      loadAndSwitch('hu', import('./locales/hu.json'));
      break;
    case 'ro':
      loadAndSwitch('ro', import('./locales/ro.json'));
      break;
    case 'el':
      loadAndSwitch('el', import('./locales/el.json'));
      break;
    case 'bg':
      loadAndSwitch('bg', import('./locales/bg.json'));
      break;
    case 'hr':
      loadAndSwitch('hr', import('./locales/hr.json'));
      break;
    case 'sk':
      loadAndSwitch('sk', import('./locales/sk.json'));
      break;
    case 'sl':
      loadAndSwitch('sl', import('./locales/sl.json'));
      break;
    case 'et':
      loadAndSwitch('et', import('./locales/et.json'));
      break;
    case 'lv':
      loadAndSwitch('lv', import('./locales/lv.json'));
      break;
    case 'lt':
      loadAndSwitch('lt', import('./locales/lt.json'));
      break;
    case 'zh':
      loadAndSwitch('zh', import('./locales/zh.json'));
      break;
    case 'ar':
      loadAndSwitch('ar', import('./locales/ar.json'));
      break;
    case 'hi':
      loadAndSwitch('hi', import('./locales/hi.json'));
      break;
    case 'ru':
      loadAndSwitch('ru', import('./locales/ru.json'));
      break;
    case 'ja':
      loadAndSwitch('ja', import('./locales/ja.json'));
      break;
    case 'ko':
      loadAndSwitch('ko', import('./locales/ko.json'));
      break;
    case 'tr':
      loadAndSwitch('tr', import('./locales/tr.json'));
      break;
    case 'vi':
      loadAndSwitch('vi', import('./locales/vi.json'));
      break;
    case 'th':
      loadAndSwitch('th', import('./locales/th.json'));
      break;
    case 'id':
      loadAndSwitch('id', import('./locales/id.json'));
      break;
  }
}

export default i18n;
