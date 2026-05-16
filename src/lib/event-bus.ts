/**
 * In-process event bus for SSE delivery.
 *
 * Producers (sync poller, mutation routes) call `emitEvent`. Consumers
 * (the `/api/events/stream` SSE endpoint) call `subscribe` to receive
 * each emitted event until the response stream closes.
 *
 * Scope: single Next.js process. In a multi-instance deployment, a
 * shared transport (Redis Pub/Sub, Postgres LISTEN/NOTIFY) is required;
 * for the Pi homelab, in-process is sufficient.
 */

export type ConvergeEvent =
  | {
      type: "issue.updated";
      userId: string;
      redmineIssueId: number;
      issueId: string;
      changes?: {
        statusName?: { from: string | null; to: string | null };
        priorityName?: { from: string | null; to: string | null };
      };
      ts: number;
    }
  | {
      type: "issue.created";
      userId: string;
      redmineIssueId: number;
      issueId: string;
      ts: number;
    }
  | {
      type: "sync.tick.completed";
      durationMs: number;
      issueCount: number;
      ts: number;
    };

type Listener = (event: ConvergeEvent) => void;

type GlobalShape = { __converge_event_bus__?: Set<Listener> };

function listeners(): Set<Listener> {
  const g = globalThis as GlobalShape;
  if (!g.__converge_event_bus__) {
    g.__converge_event_bus__ = new Set<Listener>();
  }
  return g.__converge_event_bus__;
}

type EventInput =
  | (Omit<Extract<ConvergeEvent, { type: "issue.updated" }>, "ts"> & { ts?: number })
  | (Omit<Extract<ConvergeEvent, { type: "issue.created" }>, "ts"> & { ts?: number })
  | (Omit<Extract<ConvergeEvent, { type: "sync.tick.completed" }>, "ts"> & { ts?: number });

export function emitEvent(event: EventInput): void {
  const enriched = { ...event, ts: event.ts ?? Date.now() } as ConvergeEvent;
  for (const listener of listeners()) {
    try {
      listener(enriched);
    } catch {
      // A failed listener must not break the producer or other listeners.
    }
  }
}

export function subscribe(listener: Listener): () => void {
  listeners().add(listener);
  return () => {
    listeners().delete(listener);
  };
}

export function listenerCount(): number {
  return listeners().size;
}
