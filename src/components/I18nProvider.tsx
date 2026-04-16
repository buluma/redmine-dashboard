"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Messages = Record<string, Record<string, any>>;

const translations: Messages = {};

// Preload all messages
const loadAllMessages = async () => {
  const locales = ["en", "es", "de", "fr", "ja", "zh", "ru", "uk", "af", "tl", "pl", "vi"];
  for (const locale of locales) {
    try {
      translations[locale] = (await import(`../../messages/${locale}.json`)).default;
    } catch {
      translations[locale] = translations.en;
    }
  }
};

// Load on init
loadAllMessages();

type I18nContextType = {
  locale: string;
  setLocale: (l: string) => void;
  t: (key: string, fallback?: string) => string;
};

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState("en");
  const [, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("converge-locale") || "en";
    setLocale(stored);
    setReady(true);
  }, []);

  const handleSetLocale = (l: string) => {
    setLocale(l);
    localStorage.setItem("converge-locale", l);
  };

  const t = (key: string, fallback?: string): string => {
    const keys = key.split(".");
    let value: any = translations[locale] || translations.en;
    for (const k of keys) {
      value = value?.[k];
    }
    return value || fallback || key;
  };

  // Always render children - i18n loads async
  return (
    <I18nContext.Provider value={{ locale, setLocale: handleSetLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}