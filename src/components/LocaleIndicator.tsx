"use client";

import { useI18n } from "./I18nProvider";

const langNames: Record<string, string> = {
  en: "English",
  es: "Español",
  de: "Deutsch", 
  fr: "Français",
  ja: "日本語",
  zh: "中文",
  ru: "Русский",
  uk: "Українська",
  af: "Afrikaans",
  tl: "Tagalog",
  pl: "Polski",
  vi: "Tiếng Việt",
};

export function LocaleIndicator() {
  const { locale, t } = useI18n();
  
  return (
    <div style={{
      position: "fixed",
      bottom: "10px",
      right: "10px",
      background: "var(--accent)",
      color: "white",
      padding: "4px 10px",
      borderRadius: "4px",
      fontSize: "0.75rem",
      zIndex: 9999,
      opacity: 0.8,
    }}>
      🌐 {langNames[locale] || locale}
    </div>
  );
}