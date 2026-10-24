"use client";

import { useCallback, useMemo, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";

const changedEvent = "nrcc:preference-changed";
const memory = new Map<string, string>();

function read(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

/** Reads never persist defaults: hydration cannot overwrite an existing preference. */
export function useStoredString(key: string, fallback: string): [string, Dispatch<SetStateAction<string>>] {
  const subscribe = useCallback((notify: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) { memory.delete(key); notify(); }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(changedEvent, notify);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(changedEvent, notify);
    };
  }, [key]);
  const snapshot = useCallback(() => read(key) ?? fallback, [key, fallback]);
  const serverSnapshot = useCallback(() => fallback, [fallback]);
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const setValue = useCallback<Dispatch<SetStateAction<string>>>((updater) => {
    const next = typeof updater === "function" ? updater(read(key) ?? fallback) : updater;
    try { window.localStorage.setItem(key, next); memory.delete(key); }
    catch { memory.set(key, next); }
    window.dispatchEvent(new Event(changedEvent));
  }, [key, fallback]);
  return [value, setValue];
}

function parseSet<T extends string>(raw: string, fallback: readonly T[], accepts: (value: string) => value is T): Set<T> {
  try {
    const values: unknown = JSON.parse(raw);
    if (Array.isArray(values)) return new Set(values.filter((value): value is T => typeof value === "string" && accepts(value)));
  } catch { /* Malformed preferences use defaults without rewriting storage. */ }
  return new Set(fallback);
}

export function useStoredStringSet<T extends string>(key: string, fallback: readonly T[], accepts: (value: string) => value is T): [Set<T>, Dispatch<SetStateAction<Set<T>>>] {
  const [raw, setRaw] = useStoredString(key, JSON.stringify(fallback));
  const value = useMemo(() => parseSet(raw, fallback, accepts), [raw, fallback, accepts]);
  const setValue = useCallback<Dispatch<SetStateAction<Set<T>>>>((updater) => {
    setRaw(current => JSON.stringify(Array.from(typeof updater === "function" ? updater(parseSet(current, fallback, accepts)) : updater)));
  }, [setRaw, fallback, accepts]);
  return [value, setValue];
}
