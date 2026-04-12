import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

const redis = Redis.fromEnv();

interface CacheOptions {
  ttl?: number; // seconds
  key?: string;
}

export async function withCache(
  request: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: CacheOptions = {},
): Promise<NextResponse> {
  const { ttl = 60, key } = options;

  // Skip cache for non-GET requests
  if (request.method !== "GET") {
    return handler(request);
  }

  // Build cache key from URL
  const cacheKey = key || `api-cache:${request.nextUrl.pathname}:${request.nextUrl.search}`;

  try {
    // Try to get from cache
    const cached = await redis.get<string>(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      return NextResponse.json(data, {
        headers: {
          "x-cache": "HIT",
          "x-cache-key": cacheKey,
        },
      });
    }
  } catch {
    // Cache miss, continue to handler
  }

  // Call handler
  const response = await handler(request);

  // Cache successful responses
  if (response.ok) {
    try {
      const data = await response.json();
      await redis.set(cacheKey, JSON.stringify(data), { ex: ttl });
    } catch {
      // Silently fail caching
    }
  }

  return response;
}

export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Silently fail
  }
}
