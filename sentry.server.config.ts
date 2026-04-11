// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const isProduction = process.env.NODE_ENV === "production";

function boolFromEnv(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function numberFromEnv(key: string, fallback: number): number {
  const value = Number(process.env[key] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

const tracesSampleRate = numberFromEnv("SENTRY_TRACES_SAMPLE_RATE", isProduction ? 0.1 : 0);
const profileSampleRate = numberFromEnv("SENTRY_PROFILE_SAMPLE_RATE", 0);
const enableLogs = boolFromEnv("SENTRY_ENABLE_LOGS", false);
const enableConsoleLogging = boolFromEnv("SENTRY_ENABLE_CONSOLE_LOGGING", false);
const sendDefaultPii = boolFromEnv("SENTRY_SEND_DEFAULT_PII", false);

const integrations = [];
if (enableConsoleLogging) {
  integrations.push(Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }));
}
if (profileSampleRate > 0) {
  const { nodeProfilingIntegration } = require("@sentry/profiling-node") as typeof import("@sentry/profiling-node");
  integrations.push(nodeProfilingIntegration());
}

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  integrations,
  tracesSampleRate,
  profileSessionSampleRate: profileSampleRate,
  profileLifecycle: profileSampleRate > 0 ? "trace" : undefined,

  // Enable logs to be sent to Sentry
  enableLogs,

  sendDefaultPii,
});
