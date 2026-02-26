const required = ["DATABASE_URL", "APP_ENCRYPTION_KEY", "SESSION_SECRET"] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  databaseUrl: process.env.DATABASE_URL!,
  encryptionKey: process.env.APP_ENCRYPTION_KEY!,
  sessionSecret: process.env.SESSION_SECRET!,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 60000),
  leaderLockTtlMs: Number(process.env.LEADER_LOCK_TTL_MS ?? 90000),
  syncJobStaleMs: Number(process.env.SYNC_JOB_STALE_MS ?? 10 * 60 * 1000),
  redmineBaseUrl: process.env.REDMINE_BASE_URL,
  redmineApiKey: process.env.REDMINE_API_KEY,
  mobileApiEnabled: process.env.MOBILE_API_ENABLED !== "false",
};
