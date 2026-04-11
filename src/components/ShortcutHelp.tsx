"use client";

interface Shortcut {
  key: string;
  description: string;
  category: string;
}

const shortcuts: Shortcut[] = [
  // Navigation
  { key: "j", description: "Select next issue", category: "Navigation" },
  { key: "k", description: "Select previous issue", category: "Navigation" },
  { key: "Enter", description: "Open selected issue", category: "Navigation" },
  { key: "Escape", description: "Close modal / deselect", category: "Navigation" },
  
  // Actions
  { key: "r", description: "Force refresh data", category: "Actions" },
  { key: "f", description: "Reset all filters", category: "Actions" },
  { key: "/", description: "Focus search input", category: "Actions" },
  { key: "g", description: "Go to top of list", category: "Actions" },
  
  // Selection
  { key: "x", description: "Toggle selection on focused issue", category: "Selection" },
  { key: "Shift+j", description: "Add next to selection", category: "Selection" },
  { key: "Shift+k", description: "Add previous to selection", category: "Selection" },
  { key: "*", description: "Select all visible issues", category: "Selection" },
  
  // View
  { key: "?", description: "Show this help", category: "View" },
  { key: "t", description: "Toggle theme (dark/light)", category: "View" },
  { key: "s", description: "Toggle sync status", category: "View" },
];

interface ShortcutHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutHelp({ isOpen, onClose }: ShortcutHelpProps) {
  if (!isOpen) return null;

  const categories = [...new Set(shortcuts.map((s) => s.category))];

  return (
    <div className="shortcut-overlay" onClick={onClose}>
      <div className="shortcut-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcut-header">
          <h2>⌨️ Keyboard Shortcuts</h2>
          <button type="button" onClick={onClose} className="shortcut-close">
            ✕
          </button>
        </div>

        <div className="shortcut-content">
          {categories.map((category) => (
            <div key={category} className="shortcut-category">
              <h3>{category}</h3>
              <div className="shortcut-list">
                {shortcuts
                  .filter((s) => s.category === category)
                  .map((shortcut) => (
                    <div key={shortcut.key} className="shortcut-item">
                      <kbd>{shortcut.key}</kbd>
                      <span>{shortcut.description}</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="shortcut-footer">
          <p>Press <kbd>?</kbd> or <kbd>Escape</kbd> to close</p>
        </div>
      </div>
    </div>
  );
}

// Floating hint that shows on first load
export function ShortcutHint() {
  return (
    <div className="shortcut-hint">
      Press <kbd>?</kbd> for keyboard shortcuts
    </div>
  );
}
