import "@testing-library/jest-dom";

// Node 25+ ships a built-in localStorage that lacks .clear() and conflicts
// with jsdom's implementation. Provide a minimal Storage polyfill when the
// runtime's localStorage is incomplete.
if (typeof window !== "undefined" && typeof window.localStorage.clear !== "function") {
  const store = new Map<string, string>();
  const storage: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(window, "localStorage", { value: storage, writable: true });
}
