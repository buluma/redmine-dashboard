"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks online status using navigator.onLine with a connectivity ping
 * to confirm. Defaults to online — only shows banner when BOTH checks fail.
 *
 * navigator.onLine alone is unreliable (VPNs, virtual NICs, Chromium quirks).
 */
export function useOnlineStatus(): boolean {
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [pingOnline, setPingOnline] = useState(true);
  const checkingRef = useRef(false);

  const verifyPing = async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch("/api/health", {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      setPingOnline(res.ok);
    } catch {
      setPingOnline(false);
    } finally {
      checkingRef.current = false;
    }
  };

  useEffect(() => {
    // Initial ping
    void verifyPing();

    const onOnline = () => {
      setBrowserOnline(true);
      void verifyPing();
    };
    const onOffline = () => {
      setBrowserOnline(false);
      setPingOnline(false);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Consider online if EITHER check passes — avoids false negatives
  return browserOnline || pingOnline;
}
