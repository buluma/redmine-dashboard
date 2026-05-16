import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { trackFailure } from "@/src/lib/telemetry";
import { checkRedisHealth, isRedisHealthy } from "./redis";

// In-memory rate limiting (original implementation)
const buckets = new Map<string, number[]>();

function prune(values: number[], windowMs: number, now: number): number[] {
  return values.filter((ts) => now - ts < windowMs);
}

export function isRateLimited(input: {
  key: string;
  max: number;
  windowMs: number;
}): { limited: boolean; remaining: number; resetInMs: number } {
  const now = Date.now();
  const current = prune(buckets.get(input.key) ?? [], input.windowMs, now);

  if (current.length >= input.max) {
    const oldest = current[0] ?? now;
    return {
      limited: true,
      remaining: 0,
      resetInMs: Math.max(0, input.windowMs - (now - oldest)),
    };
  }

  current.push(now);
  buckets.set(input.key, current);

  return {
    limited: false,
    remaining: Math.max(0, input.max - current.length),
    resetInMs: input.windowMs,
  };
}

export function clearRateLimitState(): void {
  buckets.clear();
}

// Database-backed rate limiting for distributed deployments
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyType: "user" | "ip";
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
}

// Default configs for different endpoint types
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  // Strict limits for mutations
  "POST /api/issues/*/status": { windowMs: 60000, maxRequests: 20, keyType: "user" },
  "POST /api/issues/*/assign": { windowMs: 60000, maxRequests: 20, keyType: "user" },
  "POST /api/issues/*/comment": { windowMs: 60000, maxRequests: 30, keyType: "user" },
  "POST /api/internal/notes": { windowMs: 60000, maxRequests: 30, keyType: "user" },
  
  // Moderate limits for reads
  "GET /api/issues/*": { windowMs: 60000, maxRequests: 100, keyType: "user" },
  "GET /api/*": { windowMs: 60000, maxRequests: 200, keyType: "user" },
  
  // Mobile API limits (stricter)
  "POST /api/mobile/*": { windowMs: 60000, maxRequests: 60, keyType: "user" },
  "GET /api/mobile/*": { windowMs: 60000, maxRequests: 120, keyType: "user" },
  
  // Auth endpoints (strict)
  "POST /api/auth/*": { windowMs: 300000, maxRequests: 10, keyType: "ip" },
  
  // Default fallback
  default: { windowMs: 60000, maxRequests: 100, keyType: "user" },
};

function matchEndpoint(pattern: string, method: string, path: string): boolean {
  const patternMethod = pattern.split(" ")[0];
  const patternPath = pattern.split(" ")[1];
  
  if (patternMethod !== method && patternMethod !== "*") {
    return false;
  }
  
  // Convert pattern to regex
  const regexPattern = patternPath
    .replace(/\*/g, "[^/]*")
    .replace(/\//g, "\\/");
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

function getConfig(method: string, path: string): RateLimitConfig {
  for (const pattern of Object.keys(RATE_LIMIT_CONFIGS)) {
    if (matchEndpoint(pattern, method, path)) {
      return RATE_LIMIT_CONFIGS[pattern];
    }
  }
  return RATE_LIMIT_CONFIGS.default;
}

function extractKey(keyType: "user" | "ip", userId?: string | null, ip?: string | null): string | null {
  if (keyType === "user" && userId) {
    return userId;
  }
  if (keyType === "ip" && ip) {
    return ip;
  }
  return userId ?? ip ?? null;
}

export async function checkRateLimit(
  request: Request,
  userId?: string | null
): Promise<RateLimitResult> {
  const method = request.method;
  const path = new URL(request.url).pathname;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() 
    ?? request.headers.get("x-real-ip") 
    ?? "unknown";
  
  const config = getConfig(method, path);
  const key = extractKey(config.keyType, userId, ip);
  
  if (!key) {
    // Allow if we can't identify the client
    return { allowed: true, remaining: 999, resetAt: new Date(), limit: 999 };
  }

  const windowStart = new Date(Date.now() - config.windowMs);
  const endpoint = `${method} ${path}`;

  try {
    // Atomic check-and-update inside a transaction to avoid TOCTOU on window reset.
    // Two concurrent requests both seeing an expired window would otherwise both
    // reset to count=1 and both be allowed, defeating the limit.
    const record = await prisma.$transaction(async (tx) => {
      const existing = await tx.apiRateLimit.findUnique({
        where: { key_keyType_endpoint: { key, keyType: config.keyType, endpoint } },
      });

      if (!existing) {
        return tx.apiRateLimit.create({
          data: { key, keyType: config.keyType, endpoint, count: 1, windowStart: new Date() },
        });
      }

      if (existing.windowStart.getTime() < windowStart.getTime()) {
        return tx.apiRateLimit.update({
          where: { id: existing.id },
          data: { count: 1, windowStart: new Date() },
        });
      }

      return tx.apiRateLimit.update({
        where: { id: existing.id },
        data: { count: { increment: 1 } },
      });
    });

    const remaining = Math.max(0, config.maxRequests - record.count);
    const allowed = record.count <= config.maxRequests;

    return {
      allowed,
      remaining,
      resetAt: new Date(record.windowStart.getTime() + config.windowMs),
      limit: config.maxRequests,
    };
  } catch (error) {
    trackFailure({ event: "rate_limit.check.failed", error, metricName: "rate_limit_check_failed" });
    return { allowed: true, remaining: 999, resetAt: new Date(), limit: 999 };
  }
}

// Cleanup old rate limit records periodically
export async function cleanupRateLimitRecords(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
  
  const result = await prisma.apiRateLimit.deleteMany({
    where: {
      windowStart: { lt: cutoff },
    },
  });
  
  return result.count;
}

// Middleware helper to add rate limit headers to response
export function addRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", String(Math.floor(result.resetAt.getTime() / 1000)));
  
  if (!result.allowed) {
    response.headers.set("Retry-After", String(Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)));
  }
  
  return response;
}
