"use client";

import { useTheme } from "./ThemeProvider";
import { useI18n } from "./I18nProvider";

type ThemeMode = "light" | "dark" | "system";

const ICONS: Record<ThemeMode, string> = {
  light: "☀",
  dark: "☾",
  system: "◑",
};

const CYCLE: Record<ThemeMode, ThemeMode> = {
  system: "light",
  light: "dark",
  dark: "system",
};

type Props = { collapsed?: boolean };

export function ThemeToggle({ collapsed = false }: Props) {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  function cycleMode() {
    setTheme(CYCLE[theme]);
  }

  if (collapsed) {
    return (
      <button
        type="button"
        className="theme-toggle"
        onClick={cycleMode}
        aria-label={`Theme: ${theme}`}
        title={`Theme: ${theme}`}
      >
        <span className="theme-toggle-icon">{ICONS[theme]}</span>
      </button>
    );
  }

  return (
    <div className="theme-toggle theme-toggle-select">
      <span className="theme-toggle-icon">{ICONS[theme]}</span>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemeMode)}
        aria-label="Theme"
        className="theme-toggle-select-input"
      >
        <option value="system">{t("theme.system")}</option>
        <option value="light">{t("theme.light")}</option>
        <option value="dark">{t("theme.dark")}</option>
      </select>
    </div>
  );
}
