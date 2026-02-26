import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ ensureMemoryLoggerStarted }, { ensurePollerStarted }] = await Promise.all([
      import("./src/lib/memory"),
      import("./src/lib/poller"),
    ]);
    await import("./sentry.server.config");
    ensureMemoryLoggerStarted();
    ensurePollerStarted();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
