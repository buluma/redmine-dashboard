// Minimal service worker for PWA installability
// No caching logic — just enables install prompt
// Full offline caching is handled client-side via IndexedDB

const CACHE_NAME = "converge-shell-v1";

self.addEventListener("install", (event) => {
  console.log("[SW] Installed");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Activated");
  event.waitUntil(clients.claim());
});

// Let the network handle everything — no fetch interception
// Offline UX is handled by client-side IndexedDB caching
