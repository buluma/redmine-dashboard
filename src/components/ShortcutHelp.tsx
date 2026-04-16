"use client";

import { useI18n } from "./I18nProvider";

interface Shortcut {
  key: string;
  descriptionKey: string;
  category: string;
}

const shortcuts: Shortcut[] = [
  // Navigation
  { key: "j", descriptionKey: "shortcuts.keys.j_desc", category: "Navigation" },
  { key: "k", descriptionKey: "shortcuts.keys.k_desc", category: "Navigation" },
  { key: "Enter", descriptionKey: "shortcuts.keys.Enter_desc", category: "Navigation" },
  { key: "Escape", descriptionKey: "shortcuts.keys.Escape_desc", category: "Navigation" },
  
  // Actions
  { key: "a", descriptionKey: "shortcuts.keys.a_desc", category: "Actions" },
  { key: "r", descriptionKey: "shortcuts.keys.r_desc", category: "Actions" },
  { key: "f", descriptionKey: "shortcuts.keys.f_desc", category: "Actions" },
  { key: "/", descriptionKey: "shortcuts.keys.slash_desc", category: "Actions" },
  { key: "g", descriptionKey: "shortcuts.keys.g_desc", category: "Actions" },
  
  // Selection
  { key: "x", descriptionKey: "shortcuts.keys.x_desc", category: "Selection" },
  { key: "Shift+j", descriptionKey: "shortcuts.keys.ShiftJ_desc", category: "Selection" },
  { key: "Shift+k", descriptionKey: "shortcuts.keys.ShiftK_desc", category: "Selection" },
  { key: "*", descriptionKey: "shortcuts.keys.Asterisk_desc", category: "Selection" },
  
  // Panels
  { key: "Alt+1", descriptionKey: "shortcuts.keys.Alt1_desc", category: "Panels" },
  { key: "Alt+2", descriptionKey: "shortcuts.keys.Alt2_desc", category: "Panels" },
  { key: "Alt+3", descriptionKey: "shortcuts.keys.Alt3_desc", category: "Panels" },
  { key: "Alt+4", descriptionKey: "shortcuts.keys.Alt4_desc", category: "Panels" },
  
  // View
  { key: "?", descriptionKey: "shortcuts.keys.Question_desc", category: "View" },
  { key: "t", descriptionKey: "shortcuts.keys.t_desc", category: "View" },
  { key: "s", descriptionKey: "shortcuts.keys.s_desc", category: "View" },
];

interface ShortcutHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutHelp({ isOpen, onClose }: ShortcutHelpProps) {
  const { t } = useI18n();
  
  if (!isOpen) return null;

  const categories = [...new Set(shortcuts.map((s) => s.category))];

  return (
    <div className="shortcut-overlay" onClick={onClose}>
      <div className="shortcut-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcut-header">
          <h2>{t("shortcuts.title")}</h2>
          <button type="button" onClick={onClose} className="shortcut-close">
            ✕
          </button>
        </div>

        <div className="shortcut-content">
          {categories.map((category) => (
            <div key={category} className="shortcut-category">
              <h3>{t(`shortcuts.categories.${category}`)}</h3>
              <div className="shortcut-list">
                {shortcuts
                  .filter((s) => s.category === category)
                  .map((shortcut) => (
                    <div key={shortcut.key} className="shortcut-item">
                      <kbd>{shortcut.key}</kbd>
                      <span>{t(shortcut.descriptionKey)}</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="shortcut-footer">
          <p>
            Press <kbd>?</kbd> or <kbd>Escape</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}

// Floating hint that shows on first load
export function ShortcutHint() {
  return (
    <div className="shortcut-hint">
      Press <kbd>?</kbd> to show shortcuts
    </div>
  );
}
