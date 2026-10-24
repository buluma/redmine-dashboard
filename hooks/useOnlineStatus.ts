"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

function subscribe(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); };
}
const browserSnapshot = () => navigator.onLine;
const serverSnapshot = () => true;

/** Either browser connectivity or a successful health probe avoids a false offline banner. */
export function useOnlineStatus(): boolean {
  const browserOnline = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  const [pingOnline, setPingOnline] = useState(true);

  useEffect(() => {
    let controller: AbortController | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const verify = async () => {
      controller?.abort();
      clearTimeout(timeout);
      const request = new AbortController();
      controller = request;
      timeout = setTimeout(() => request.abort(), 5000);
      try {
        const res = await fetch("/api/health", { signal: request.signal });
        if (!disposed && controller === request && !request.signal.aborted) setPingOnline(res.ok);
      } catch {
        if (!disposed && controller === request) setPingOnline(false);
      } finally {
        if (controller === request) clearTimeout(timeout);
      }
    };
    const offline = () => {
      controller?.abort();
      controller = null;
      clearTimeout(timeout);
      setPingOnline(false);
    };
    void verify();
    window.addEventListener("online", verify);
    window.addEventListener("offline", offline);
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(timeout);
      window.removeEventListener("online", verify);
      window.removeEventListener("offline", offline);
    };
  }, []);
  return browserOnline || pingOnline;
}
