import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

import { processSyncQueue } from "../lib/sync-queue";

declare let self: ServiceWorkerGlobalScope;
declare let clients: Clients;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// I'll need to use a dynamic import or ensure processSyncQueue is SW-safe
// Background Sync support
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-queue") {
    console.log("[SW] Background sync triggered: sync-queue");
    event.waitUntil(
      processSyncQueue()
        .then((data) => {
          console.log("[SW] Background sync complete:", data);
        })
        .catch((err) => {
          console.error("[SW] Background sync failed:", err);
        })
    );
  }
});

// Push Notification support
self.addEventListener("push", (event) => {
  if (!(self.Notification && self.Notification.permission === "granted")) {
    return;
  }

  const data = event.data?.json() ?? {};
  const { title, body, icon, badge, data: extraData } = data.notification || {};

  event.waitUntil(
    self.registration.showNotification(title || "Redmine Update", {
      body: body || "You have a new update in your dashboard.",
      icon: icon || "/icons/icon-192x192.png",
      badge: badge || "/icons/badge-72x72.png",
      data: extraData || {},
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
