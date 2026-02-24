import { createContext, useContext, useState } from 'react';
import ko from '../i18n/ko';
import en from '../i18n/en';

const translations = { ko, en };
const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('lang') || 'ko'; } catch { return 'ko'; }
  });

  function changeLang(newLang) {
    setLang(newLang);
    try { localStorage.setItem('lang', newLang); } catch {}
  }

  function t(key) {
    const keys = key.split('.');
    let result = translations[lang];
    for (const k of keys) {
      if (result == null) return key;
      result = result[k];
    }
    return result ?? key;
  }

  function tc(category) {
    return translations[lang]?.categoryMap?.[category] ?? category;
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLang, t, tc }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
