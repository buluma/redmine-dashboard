// This file configures the initialization of Sentry on the client.
// The config here is used whenever a user loads a page in their browser.
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

const tracesSampleRate = numberFromEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", isProduction ? 0.1 : 0);
const profileSampleRate = numberFromEnv("NEXT_PUBLIC_SENTRY_PROFILE_SAMPLE_RATE", 0);
const enableLogs = boolFromEnv("NEXT_PUBLIC_SENTRY_ENABLE_LOGS", false);
const enableConsoleLogging = boolFromEnv("NEXT_PUBLIC_SENTRY_ENABLE_CONSOLE_LOGGING", false);
const sendDefaultPii = boolFromEnv("NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII", false);

const integrations = [Sentry.browserTracingIntegration()];
if (profileSampleRate > 0) {
  integrations.push(Sentry.browserProfilingIntegration());
}
if (enableConsoleLogging) {
  integrations.push(Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }));
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  integrations,
  tracesSampleRate,
  profileSessionSampleRate: profileSampleRate,
  enableLogs,
  sendDefaultPii,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
