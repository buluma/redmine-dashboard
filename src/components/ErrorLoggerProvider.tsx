"use client";

import { useErrorLogger } from "@/src/lib/error-logger";

export function ErrorLoggerProvider({ children }: { children: React.ReactNode }) {
  useErrorLogger();
  return <>{children}</>;
}
