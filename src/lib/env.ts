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

function csvFromEnv(key: string): string[] {
  const raw = process.env[key];
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function syncIssueScopeFromEnv(): "assigned" | "open" | "all" {
  const value = (process.env.REDMINE_SYNC_ISSUE_SCOPE ?? "assigned").trim().toLowerCase();
  if (value === "assigned" || value === "open" || value === "all") {
    return value;
  }
  return "assigned";
}

const isProduction = process.env.NODE_ENV === "production";

export const env = {
  databaseUrl: process.env.DATABASE_URL!,
  encryptionKey: process.env.APP_ENCRYPTION_KEY!,
  sessionSecret: process.env.SESSION_SECRET!,
  pollIntervalMs: numberFromEnv("POLL_INTERVAL_MS", 300000),
  leaderLockTtlMs: numberFromEnv("LEADER_LOCK_TTL_MS", 90000),
  syncJobStaleMs: numberFromEnv("SYNC_JOB_STALE_MS", 10 * 60 * 1000),
  enableSyncPoller: boolFromEnv("ENABLE_SYNC_POLLER", isProduction),
  memoryLogging: boolFromEnv("MEMORY_LOGGING", false),
  memoryLogIntervalMs: numberFromEnv("MEMORY_LOG_INTERVAL_MS", 60000),
  redmineBaseUrl: process.env.REDMINE_BASE_URL,
  redmineApiKey: process.env.REDMINE_API_KEY,
  redmineAllowedBaseUrls: csvFromEnv("REDMINE_ALLOWED_BASE_URLS"),
  redmineInsecureTlsHosts: csvFromEnv("REDMINE_INSECURE_TLS_HOSTS"),
  redmineSyncIssueScope: syncIssueScopeFromEnv(),
  mobileApiEnabled: boolFromEnv("MOBILE_API_ENABLED", true),
  // Ollama AI Configuration
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  ollamaChatModel: process.env.OLLAMA_CHAT_MODEL || "qwen3.5:cloud",
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text-v2-moe:latest",
  ollamaTimeoutMs: numberFromEnv("OLLAMA_TIMEOUT_MS", 120000),
  ollamaStream: boolFromEnv("OLLAMA_STREAM", true),
  ollamaChatModelFallback: process.env.OLLAMA_CHAT_MODEL_FALLBACK || "gpt-oss:20b-cloud",
  ollamaEmbedModelFallback: process.env.OLLAMA_EMBED_MODEL_FALLBACK || "nomic-embed-text:latest",
  enableAiFeatures: boolFromEnv("ENABLE_AI_FEATURES", true),
  aiSummarizeEnabled: boolFromEnv("AI_SUMMARIZE_ENABLED", true),
  aiSearchEnabled: boolFromEnv("AI_SEARCH_ENABLED", true),
  aiCategorizeEnabled: boolFromEnv("AI_CATEGORIZE_ENABLED", true),
  // LLM Provider Configuration
  llmProvider: (process.env.LLM_PROVIDER as "ollama" | "openai" | "anthropic" | "openrouter") || "ollama",
  // OpenAI Configuration (alternative to Ollama)
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiChatModel: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
  // Anthropic Configuration (alternative to Ollama)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  anthropicChatModel: process.env.ANTHROPIC_CHAT_MODEL || "claude-3-5-haiku-20250620",
  // OpenRouter Configuration (alternative to Ollama) - https://openrouter.ai/docs/quickstart
  openrouterApiKey: process.env.OPENROUTER_API_KEY,
  openrouterChatModel: process.env.OPENROUTER_CHAT_MODEL || "anthropic/claude-3.5-haiku",
  openrouterChatModelFallback: process.env.OPENROUTER_CHAT_MODEL_FALLBACK || "openrouter/free",
  // Slack Configuration
  slackBotToken: process.env.SLACK_BOT_TOKEN,
  slackDefaultChannelId: process.env.SLACK_DEFAULT_CHANNEL_ID,
  slackMonitorChannelIds: csvFromEnv("SLACK_MONITOR_CHANNEL_IDS"),
  // Slack Notifier Configuration
  slackNotifyEnabled: boolFromEnv("SLACK_NOTIFY_ENABLED", false),
  slackNotifyChannelId: process.env.SLACK_NOTIFY_CHANNEL_ID,
  slackNotifyOnCreate: boolFromEnv("SLACK_NOTIFY_ON_CREATE", true),
  slackNotifyOnUpdate: boolFromEnv("SLACK_NOTIFY_ON_UPDATE", true),
  slackNotifyOnStatusChange: boolFromEnv("SLACK_NOTIFY_ON_STATUS_CHANGE", true),
  slackNotifyOnAssignment: boolFromEnv("SLACK_NOTIFY_ON_ASSIGNMENT", true),
  slackNotifyFormat: (process.env.SLACK_NOTIFY_FORMAT as "compact" | "detailed") || "compact",
  slackRefreshIntervalMs: numberFromEnv("SLACK_REFRESH_INTERVAL_MS", 30000),
};
