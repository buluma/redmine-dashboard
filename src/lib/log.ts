/**
 * Structured Logging for Converge
 * 
 * Supports multiple output formats and can integrate with:
 * - Loki (Grafana)
 * - Datadog
 * - CloudWatch
 * - JSON stdout for container log aggregation
 * 
 * Usage:
 *   import { logEvent, logInfo, logError, logWarn } from '@/src/lib/log';
 * 
 *   logEvent('user.login', { userId: '123', provider: 'redmine' });
 *   logError('sync.failed', { error: err.message, issueCount: 50 });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  ts: string;
  level: LogLevel;
  event: string;
  message?: string;
  context?: LogContext;
  // Standard fields for log aggregators
  service?: string;
  environment?: string;
  hostname?: string;
  traceId?: string;
  userId?: string;
}

// Environment configuration
const LOG_FORMAT = process.env.LOG_FORMAT || "json"; // "json" | "pretty" | "simple"
const LOG_LEVEL = process.env.LOG_LEVEL || "info";   // "debug" | "info" | "warn" | "error"
const LOG_SERVICE = process.env.LOG_SERVICE || "converge";
const LOG_ENVIRONMENT = process.env.NODE_ENV || "development";

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return levelPriority[level] >= levelPriority[LOG_LEVEL as LogLevel] || LOG_LEVEL === "debug";
}

function normalize(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function buildLogEntry(
  event: string,
  data: LogContext = {},
  level: LogLevel = "info"
): LogEntry {
  return {
    ts: new Date().toISOString(),
    level,
    event,
    message: data.message as string || event,
    context: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, normalize(v)])
    ),
    service: LOG_SERVICE,
    environment: LOG_ENVIRONMENT,
    hostname: process.env.HOSTNAME,
  };
}

function formatLogEntry(entry: LogEntry): string {
  if (LOG_FORMAT === "pretty") {
    // Human-readable format for local dev
    const color = entry.level === "error" ? "\x1b[31m" :
                  entry.level === "warn" ? "\x1b[33m" :
                  entry.level === "info" ? "\x1b[36m" : "\x1b[90m";
    const reset = "\x1b[0m";
    return `${color}[${entry.ts}] ${entry.level.toUpperCase()}${reset} ${entry.event} ${entry.message || ""}`;
  }
  
  if (LOG_FORMAT === "simple") {
    // Simple text format
    return `[${entry.ts}] ${entry.level.toUpperCase()} ${entry.event} ${entry.message || ""}`;
  }
  
  // JSON format for container log aggregation (default)
  return JSON.stringify(entry);
}

function outputLog(entry: LogEntry): void {
  const line = formatLogEntry(entry);
  
  switch (entry.level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

/**
 * Main log event function
 * 
 * @param event - Event name (e.g., 'issue.sync.completed')
 * @param data - Additional context data
 * @param level - Log level
 */
export function logEvent(
  event: string,
  data: LogContext = {},
  level: LogLevel = "info"
): void {
  if (!shouldLog(level)) return;
  
  const entry = buildLogEntry(event, data, level);
  outputLog(entry);
}

/**
 * Convenience functions for each log level
 */
export const logDebug = (event: string, data?: LogContext) => 
  logEvent(event, data, "debug");

export const logInfo = (event: string, data?: LogContext) => 
  logEvent(event, data, "info");

export const logWarn = (event: string, data?: LogContext) => 
  logEvent(event, data, "warn");

export const logError = (event: string, data?: LogContext) => 
  logEvent(event, data, "error");

/**
 * Create a logger with preset context
 * 
 * Usage:
 *   const auditLog = createLogger('audit');
 *   auditLog('user.login', { userId: '123' });
 */
export function createLogger(prefix: string) {
  return {
    debug: (event: string, data?: LogContext) => 
      logEvent(`${prefix}.${event}`, data, "debug"),
    info: (event: string, data?: LogContext) => 
      logEvent(`${prefix}.${event}`, data, "info"),
    warn: (event: string, data?: LogContext) => 
      logEvent(`${prefix}.${event}`, data, "warn"),
    error: (event: string, data?: LogContext) => 
      logEvent(`${prefix}.${event}`, data, "error"),
  };
}

// Export for type checking
export type { LogLevel, LogContext, LogEntry };
