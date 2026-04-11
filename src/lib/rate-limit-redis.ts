import { Redis } from "@upstash/redis";

interface RateLimitResult {
  limited: boolean;
  remaining: number;
  resetIn: number;
}

export function isRateLimited({
  key,
  max,
  windowMs,
}: {
  key: string;
  max: number;
  windowMs: number;
}): RateLimitResult {
  const windowSec = Math.floor(windowMs / 1000);

  try {
    const redis = Redis.fromEnv();
    // Use pipeline for atomic operations
    const result = redis
      .multi()
      .incr(key)
      .ttl(key)
      .exec();

    if (!result) {
      return { limited: false, remaining: max, resetIn: windowMs };
    }

    const current = Array.isArray(result) ? result[0] : result;
    const ttlValue = Array.isArray(result) ? result[1] : 0;
    const count = typeof current === "number" ? current : 1;

    if (count === 1) {
      redis.expire(key, windowSec);
    }

    const remaining = Math.max(0, max - count);
    const ttl = typeof ttlValue === "number" ? ttlValue : windowSec;
    const resetIn = ttl > 0 ? ttl * 1000 : windowMs;

    return {
      limited: count > max,
      remaining,
      resetIn,
    };
  } catch {
    // If Redis fails, allow the request
    return { limited: false, remaining: max, resetIn: windowMs };
  }
}