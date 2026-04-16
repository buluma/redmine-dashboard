"use client";

import { create } from "zustand";

type Locale = "en" | "es" | "de" | "fr" | "ja" | "zh";

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()((set) => ({
  locale: (typeof window !== "undefined" 
    ? (localStorage.getItem("converge-locale") as Locale) 
    : "en") || "en",
  setLocale: (locale) => {
    localStorage.setItem("converge-locale", locale);
    set({ locale });
  },
}));

export const localeNames: Record<Locale, string> = {
  en: "English",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  ja: "日本語",
  zh: "中文",
};

export const localeFlags: Record<Locale, string> = {
  en: "🇺🇸",
  es: "🇪🇸",
  de: "🇩🇪",
  fr: "🇫🇷",
  ja: "🇯🇵",
  zh: "🇨🇳",
};