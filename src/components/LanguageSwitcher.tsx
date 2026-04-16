"use client";

import { useState, useEffect } from "react";

type Locale = "en" | "es" | "de" | "fr" | "ja" | "zh" | "ru" | "uk" | "af";

const languages = [
  { code: "en" as const, label: "English", flag: "🇺🇸" },
  { code: "es" as const, label: "Español", flag: "🇪🇸" },
  { code: "de" as const, label: "Deutsch", flag: "🇩🇪" },
  { code: "fr" as const, label: "Français", flag: "🇫🇷" },
  { code: "ja" as const, label: "日本語", flag: "🇯🇵" },
  { code: "zh" as const, label: "中文", flag: "🇨🇳" },
  { code: "ru" as const, label: "Русский", flag: "🇷🇺" },
  { code: "uk" as const, label: "Українська", flag: "🇺🇦" },
  { code: "af" as const, label: "Afrikaans", flag: "🇿🇦" },
];

export function LanguageSwitcher() {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    const stored = localStorage.getItem("converge-locale") as Locale;
    if (stored) setLocale(stored);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value as Locale;
    setLocale(newLocale);
    localStorage.setItem("converge-locale", newLocale);
  };

  return (
    <div className="language-switcher-wrapper">
      <select value={locale} onChange={handleChange} className="language-select" aria-label="Select language">
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.label}
          </option>
        ))}
      </select>
      <style>{`
        .language-switcher-wrapper {
          padding: 0.5rem 1rem;
        }
        .language-select {
          width: 100%;
          padding: 0.375rem 0.5rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--surface-1);
          color: var(--text);
          font-size: 0.8rem;
          cursor: pointer;
        }
        .language-select:hover {
          border-color: var(--accent);
        }
      `}</style>
    </div>
  );
}