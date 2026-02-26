import { env } from "@/src/lib/env";
import { logEvent } from "@/src/lib/log";

declare global {
  var __memory_logger_started__: boolean | undefined;
}

export function ensureMemoryLoggerStarted(): void {
  if (!env.memoryLogging || global.__memory_logger_started__) {
    return;
  }

  global.__memory_logger_started__ = true;

  const emitMemoryUsage = () => {
    const usage = process.memoryUsage();
    logEvent("runtime.memory.usage", {
      rss: usage.rss,
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
      external: usage.external,
    });
  };

  emitMemoryUsage();
  const interval = setInterval(emitMemoryUsage, env.memoryLogIntervalMs);
  if (interval.unref) {
    interval.unref();
  }
}
