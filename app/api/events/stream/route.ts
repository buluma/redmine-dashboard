import type { User } from "@prisma/client";

import { requireCurrentUser } from "@/src/lib/auth";
import { subscribe, type ConvergeEvent } from "@/src/lib/event-bus";
import { trackFailure, trackInfo } from "@/src/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Heartbeat keeps proxies and the EventSource alive even when no events flow.
const HEARTBEAT_MS = 25_000;

export async function GET(request: Request) {
  let user: User;
  try {
    user = await requireCurrentUser();
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return new Response("Unauthorized", { status: 401 });
    }
    trackFailure({
      event: "events.stream.auth.failed",
      error,
      metricName: "events_stream_auth_failed",
    });
    return new Response("Server error", { status: 500 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      function safeEnqueue(chunk: Uint8Array) {
        try {
          controller.enqueue(chunk);
        } catch {
          // Controller closed — let the cleanup path run.
        }
      }

      function send(event: ConvergeEvent) {
        // Filter to events relevant to this user. Sync ticks are global.
        if ("userId" in event && event.userId !== user.id) return;
        const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        safeEnqueue(encoder.encode(payload));
      }

      // Initial hello so the client knows the channel is open.
      safeEnqueue(encoder.encode(`event: hello\ndata: {"ts":${Date.now()}}\n\n`));

      unsubscribe = subscribe(send);

      heartbeatTimer = setInterval(() => {
        safeEnqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
      }, HEARTBEAT_MS);

      trackInfo("events.stream.opened", { userId: user.id });
    },
    cancel() {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      unsubscribe?.();
      trackInfo("events.stream.closed", { userId: user.id });
    },
  });

  request.signal.addEventListener("abort", () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    unsubscribe?.();
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
