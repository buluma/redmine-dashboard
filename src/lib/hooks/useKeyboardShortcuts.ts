"use client";

import { useEffect, useCallback } from "react";

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          event.preventDefault();
          shortcut.handler();
          return;
        }
      }
    },
    [shortcuts],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

// Predefined shortcuts
export const defaultShortcuts: KeyboardShortcut[] = [
  { key: "r", handler: () => window.location.reload() },
  { key: "/", handler: () => document.getElementById("search")?.focus() },
  { key: "Escape", handler: () => document.activeElement instanceof HTMLElement && document.activeElement.blur() },
];

// Helper to show shortcut hints
export function getShortcutHint(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push("⌘");
  if (shortcut.shift) parts.push("⇧");
  parts.push(shortcut.key.toUpperCase());
  return parts.join("");
}