import { Redis } from "@upstash/redis";
import { logEvent } from "./log";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Track Redis connection health
let redisHealthy = false;
let redisHealthChecked = false;

const redis = new Redis({
  url: REDIS_URL,
  token: REDIS_TOKEN,
});

/**
 * Check Redis connectivity at startup
 * Returns true if Redis is available, false otherwise
 * 
 * Set env var REQUIRE_REDIS=true to fail fast if Redis is unavailable
 */
export async function checkRedisHealth(): Promise<boolean> {
  if (redisHealthChecked) {
    return redisHealthy;
  }
  
  try {
    // Try a simple ping
    const result = await redis.ping();
    redisHealthy = result === "PONG";
    
    logEvent("redis.health_check", { 
      healthy: redisHealthy,
      url: REDIS_URL ? "configured" : "missing"
    });
    
    if (!redisHealthy && process.env.REQUIRE_REDIS === "true") {
      throw new Error("Redis health check failed but REQUIRED_REDIS=true");
    }
  } catch (error) {
    redisHealthy = false;
    logEvent("redis.health_check.failed", { 
      error: error instanceof Error ? error.message : "Unknown error",
      required: process.env.REQUIRE_REDIS === "true"
    }, "error");
    
    if (process.env.REQUIRE_REDIS === "true") {
      console.error("[Redis] ❌ FATAL: Redis is required but unavailable!");
      console.error("[Redis] Set REQUIRE_REDIS=false to allow startup without Redis");
      throw error;
    }
    
    console.warn("[Redis] ⚠️ Redis unavailable - rate limiting disabled");
    console.warn("[Redis] Set REQUIRE_REDIS=true to fail fast on startup");
  }
  
  redisHealthChecked = true;
  return redisHealthy;
}

/** Check if Redis is currently healthy */
export function isRedisHealthy(): boolean {
  return redisHealthy;
}

/** Get Redis instance (may be unhealthy) */
export function getRedis() {
  return redis;
}

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (!redisHealthy) {
      logEvent("cache.skip", { reason: "redis_unavailable", key }, "debug");
      return null;
    }
    try {
      const data = await redis.get(key);
      return data as T | null;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    if (!redisHealthy) {
      logEvent("cache.skip", { reason: "redis_unavailable", key }, "debug");
      return;
    }
    try {
      await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
    } catch {
      // Silently fail - cache is optional
    }
  },

  async delete(key: string): Promise<void> {
    if (!redisHealthy) return;
    try {
      await redis.del(key);
    } catch {
      // Silently fail
    }
  },

  async invalidatePattern(pattern: string): Promise<void> {
    if (!redisHealthy) return;
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch {
      // Silently fail
    }
  },
};

export default redis;