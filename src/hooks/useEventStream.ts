"use client";

import { useEffect, useRef } from "react";

export type ConvergeEventName =
  | "issue.updated"
  | "issue.created"
  | "sync.tick.completed"
  | "hello";

export interface UseEventStreamOptions {
  /** When false, the EventSource is not opened at all. */
  enabled?: boolean;
  /** Map of event-name → handler. Handlers receive the parsed JSON payload. */
  handlers: Partial<Record<ConvergeEventName, (data: unknown) => void>>;
  /** Called whenever the connection drops; client decides whether to retry. */
  onError?: () => void;
}

/**
 * Subscribe to /api/events/stream over Server-Sent Events.
 *
 * Falls back silently when EventSource is not available (SSR, very old
 * browsers). The component should keep its polling loop running as a
 * backstop — this hook is an optimisation, not a replacement.
 *
 * Handler identity is held in a ref so callers don't need to memoise the
 * `handlers` object; the EventSource only reopens when `enabled` flips.
 */
export function useEventStream({ enabled = true, handlers, onError }: UseEventStreamOptions) {
  const handlersRef = useRef(handlers);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    handlersRef.current = handlers;
    onErrorRef.current = onError;
  }, [handlers, onError]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    const source = new EventSource("/api/events/stream", { withCredentials: true });

    const names: ConvergeEventName[] = [
      "issue.updated",
      "issue.created",
      "sync.tick.completed",
      "hello",
    ];

    const wired: Array<() => void> = [];
    for (const name of names) {
      const listener = (event: MessageEvent) => {
        const handler = handlersRef.current[name];
        if (!handler) return;
        try {
          handler(JSON.parse(event.data));
        } catch {
          // Malformed payload — ignore.
        }
      };
      source.addEventListener(name, listener as EventListener);
      wired.push(() => source.removeEventListener(name, listener as EventListener));
    }

    source.onerror = () => {
      onErrorRef.current?.();
    };

    return () => {
      for (const off of wired) off();
      source.close();
    };
  }, [enabled]);
}
