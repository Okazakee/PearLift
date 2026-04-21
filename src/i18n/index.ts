import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import bg from './locales/bg.json';
import cs from './locales/cs.json';
import da from './locales/da.json';
import de from './locales/de.json';
import el from './locales/el.json';
import en from './locales/en.json';
import es from './locales/es.json';
import et from './locales/et.json';
import fi from './locales/fi.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import hr from './locales/hr.json';
import hu from './locales/hu.json';
import id from './locales/id.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import lt from './locales/lt.json';
import lv from './locales/lv.json';
import nl from './locales/nl.json';
import no from './locales/no.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';
import ro from './locales/ro.json';
import ru from './locales/ru.json';
import sk from './locales/sk.json';
import sl from './locales/sl.json';
import sv from './locales/sv.json';
import th from './locales/th.json';
import tr from './locales/tr.json';
import vi from './locales/vi.json';
import zh from './locales/zh.json';

i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: { translation: en },
    de: { translation: de },
    fr: { translation: fr },
    es: { translation: es },
    it: { translation: it },
    pt: { translation: pt },
    nl: { translation: nl },
    pl: { translation: pl },
    sv: { translation: sv },
    da: { translation: da },
    fi: { translation: fi },
    no: { translation: no },
    cs: { translation: cs },
    hu: { translation: hu },
    ro: { translation: ro },
    el: { translation: el },
    bg: { translation: bg },
    hr: { translation: hr },
    sk: { translation: sk },
    sl: { translation: sl },
    et: { translation: et },
    lv: { translation: lv },
    lt: { translation: lt },
    zh: { translation: zh },
    ar: { translation: ar },
    hi: { translation: hi },
    ru: { translation: ru },
    ja: { translation: ja },
    ko: { translation: ko },
    tr: { translation: tr },
    vi: { translation: vi },
    th: { translation: th },
    id: { translation: id },
  },
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
