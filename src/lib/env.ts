const required = ["DATABASE_URL", "APP_ENCRYPTION_KEY", "SESSION_SECRET"] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

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

const isProduction = process.env.NODE_ENV === "production";

export const env = {
  databaseUrl: process.env.DATABASE_URL!,
  encryptionKey: process.env.APP_ENCRYPTION_KEY!,
  sessionSecret: process.env.SESSION_SECRET!,
  pollIntervalMs: numberFromEnv("POLL_INTERVAL_MS", isProduction ? 120000 : 60000),
  leaderLockTtlMs: numberFromEnv("LEADER_LOCK_TTL_MS", 90000),
  syncJobStaleMs: numberFromEnv("SYNC_JOB_STALE_MS", 10 * 60 * 1000),
  enableSyncPoller: boolFromEnv("ENABLE_SYNC_POLLER", isProduction),
  memoryLogging: boolFromEnv("MEMORY_LOGGING", false),
  memoryLogIntervalMs: numberFromEnv("MEMORY_LOG_INTERVAL_MS", 60000),
  redmineBaseUrl: process.env.REDMINE_BASE_URL,
  redmineApiKey: process.env.REDMINE_API_KEY,
  mobileApiEnabled: boolFromEnv("MOBILE_API_ENABLED", true),
};
