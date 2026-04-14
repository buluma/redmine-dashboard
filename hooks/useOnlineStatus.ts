"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks online status using both navigator.onLine and a lightweight ping.
 * navigator.onLine alone is unreliable (VPNs, virtual NICs, Chromium quirks).
 * The ping confirms actual connectivity to the app server.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  const checkingRef = useRef(false);

  const verifyConnectivity = async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("/api/health", {
        method: "HEAD",
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);
      setOnline(res.ok);
    } catch {
      setOnline(false);
    } finally {
      checkingRef.current = false;
    }
  };

  useEffect(() => {
    // Initial check
    void verifyConnectivity();

    const onOnline = () => void verifyConnectivity();
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Re-verify every 30s to catch silent disconnects
    const interval = setInterval(() => {
      if (!online) void verifyConnectivity();
    }, 30000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return online;
}
