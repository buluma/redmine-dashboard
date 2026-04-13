"use client";

import { useEffect, useRef } from "react";

let initialized = false;

export function useErrorLogger() {
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;

    const originalError = console.error;
    const originalWarn = console.warn;

    const sendLog = async (level: "error" | "warn", message: string, stack?: string) => {
      if (level === "error" && typeof window !== "undefined") {
        try {
          await navigator.sendBeacon(
            "/api/logs",
            JSON.stringify({
              message: message.slice(0, 10000),
              level,
              source: "client",
              url: window.location.href,
              stack: stack?.slice(0, 10000),
              userAgent: navigator.userAgent,
            }),
          );
        } catch {
          // Best effort, ignore
        }
      }
    };

    if (!initialized) {
      initialized = true;

      // Capture unhandled errors
      window.addEventListener("error", (event) => {
        const msg = event.message ?? event.error?.message ?? "Unknown error";
        const stack = event.error?.stack ?? (event.filename ? `at ${event.filename}:${event.lineno}:${event.colno}` : undefined);
        void sendLog("error", msg, stack);
      });

      // Capture unhandled promise rejections
      window.addEventListener("unhandledrejection", (event) => {
        const msg = event.reason?.message ?? event.reason?.toString() ?? "Unhandled promise rejection";
        const stack = event.reason?.stack;
        void sendLog("error", msg, stack);
      });

      // Intercept console.error for React/runtime errors
      console.error = (...args: unknown[]) => {
        const msg = args.map((a) => String(a)).join(" ");
        const stack = new Error().stack;
        void sendLog("error", msg, stack);
        originalError.apply(console, args);
      };

      console.warn = (...args: unknown[]) => {
        const msg = args.map((a) => String(a)).join(" ");
        void sendLog("warn", msg);
        originalWarn.apply(console, args);
      };
    }

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);
}
