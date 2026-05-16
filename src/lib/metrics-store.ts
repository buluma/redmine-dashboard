/**
 * Module-level singleton for in-process request/error counters.
 * Works in a persistent Next.js server (Docker). Not suitable for
 * serverless/multi-process deployments — use Redis there instead.
 */

interface EndpointStats {
  requests: number;
  errors: number;
}

const _startedAt = Date.now();
let _requests = 0;
let _errors = 0;
const _endpoints = new Map<string, EndpointStats>();

export function recordRequest(endpoint: string, isError = false) {
  _requests++;
  if (isError) _errors++;
  const s = _endpoints.get(endpoint) ?? { requests: 0, errors: 0 };
  s.requests++;
  if (isError) s.errors++;
  _endpoints.set(endpoint, s);
}

export function getMetrics() {
  return {
    startedAt: _startedAt,
    uptimeSeconds: Math.floor((Date.now() - _startedAt) / 1000),
    requests: _requests,
    errors: _errors,
    endpoints: Object.fromEntries(_endpoints),
  };
}
