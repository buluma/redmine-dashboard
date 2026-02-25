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
