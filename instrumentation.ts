import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Suppress EPIPE errors on stdout/stderr to prevent unhandled errors when
    // Next.js's dev server request logging tries to write to a closed pipe.
    const suppressEpipe = (err: NodeJS.ErrnoException) => {
      if (err.code !== "EPIPE") throw err;
    };
    process.stdout.on("error", suppressEpipe);
    process.stderr.on("error", suppressEpipe);

    const [memoryMod, pollerMod, logPollerMod] = await Promise.all([
      import("./src/lib/memory"),
      import("./src/lib/poller"),
      import("./src/lib/streamline-log-poller"),
    ]);
    await import("./sentry.server.config");
    memoryMod.ensureMemoryLoggerStarted();
    pollerMod.ensurePollerStarted();
    logPollerMod.ensureStreamlineLogPollerStarted();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
