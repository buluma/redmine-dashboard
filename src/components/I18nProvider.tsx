"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import enMessagesRaw from "../../messages/en.json";

// Handle potential .default wrapping from different bundler behaviors
const enMessages = (enMessagesRaw as any).default || enMessagesRaw;

type Messages = Record<string, Record<string, any>>;

const translations: Messages = {
  en: enMessages
};

// Preload all other messages
const loadAllMessages = async () => {
  const locales = ["ru", "uk", "af"];
  for (const locale of locales) {
    try {
      const msg = await import(`../../messages/${locale}.json`);
      translations[locale] = msg.default || msg;
    } catch (err) {
      console.error(`Failed to load locale: ${locale}`, err);
      translations[locale] = translations.en;
    }
  }
};

// Load on init - only in browser to avoid SSR issues with dynamic imports if possible, 
// though Next.js handles it.
if (typeof window !== "undefined") {
  loadAllMessages();
}

type I18nContextType = {
  locale: string;
  setLocale: (l: string) => void;
  t: (key: string, variables?: Record<string, string | number> | string, fallback?: string) => string;
  formatDate: (date: Date | string, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (n: number, options?: Intl.NumberFormatOptions) => string;
};

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
  formatDate: (date) => new Date(date).toLocaleDateString(),
  formatNumber: (n) => n.toLocaleString(),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("converge-locale") || "en";
    setLocale(stored);
    document.documentElement.lang = stored;
    setMounted(true);
  }, []);

  const handleSetLocale = (l: string) => {
    setLocale(l);
    localStorage.setItem("converge-locale", l);
    document.documentElement.lang = l;
  };

  const t = useMemo(() => {
    return (key: string, variables?: Record<string, string | number> | string, fallback?: string): string => {
      const vars = typeof variables === "object" && variables !== null ? variables : undefined;
      const resolvedFallback = typeof variables === "string" ? variables : fallback;
      const keys = key.split(".");
      
      // Use current locale if available, else fallback to English
      let value: any = translations[locale] || translations.en;
      
      for (const k of keys) {
        value = value?.[k];
      }
      
      // If not found in current locale and current is not English, try English
      if (value === undefined && locale !== "en") {
        value = translations.en;
        for (const k of keys) {
          value = value?.[k];
        }
      }
      
      let res = value || resolvedFallback || key;
      if (typeof res === "string" && vars) {
        // Basic interpolation
        for (const [k, v] of Object.entries(vars)) {
          res = res.replace(new RegExp(`{${k}}`, "g"), String(v));
        }
      } else if (typeof res === "object" && res !== null && vars?.count !== undefined) {
        // Pluralization logic
        const count = Number(vars.count);
        if (typeof count === "number") {
          if (count === 1 && res.one !== undefined) {
            res = res.one;
          } else if (res.other !== undefined) {
            res = res.other;
          } else {
            // Fallback for cases where 'other' is missing but 'one' is not applicable
            res = res.one || key;
          }

          // Interpolate remaining variables after selecting plural form
          if (typeof res === "string") {
            for (const [k, v] of Object.entries(vars)) {
              if (k !== 'count') { // Avoid re-interpolating count if it's a variable itself
                res = res.replace(new RegExp(`{${k}}`, "g"), String(v));
              }
            }
          }
        }
      }
      return String(res);
    };
  }, [locale]);

  const formatDate = (date: Date | string, options?: Intl.DateTimeFormatOptions) => {
    if (!date) return "";
    const d = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return typeof date === "string" ? date : "";
    return d.toLocaleDateString(locale, options);
  };

  const formatNumber = (n: number, options?: Intl.NumberFormatOptions) => {
    if (typeof n !== "number") return "";
    return n.toLocaleString(locale, options);
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale: handleSetLocale, t, formatDate, formatNumber }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}