import { NextRequest, NextResponse } from "next/server";

// Single auth policy for all /api/external/* routes. Every route must go
// through these helpers so key parsing and validation cannot drift per route.
// Policy is fail-closed: with no EXTERNAL_API_KEYS configured, no key is valid.

export function getExternalApiKey(request: NextRequest): string | null {
  const headerKey = request.headers.get("x-api-key");
  if (headerKey) return headerKey;
  // Query-param fallback for simpler integrations. Unit tests pass a plain
  // Request with nextUrl attached, hence the URL fallback.
  const searchParams =
    (request as { nextUrl?: URL }).nextUrl?.searchParams ?? new URL(request.url).searchParams;
  return searchParams.get("api_key");
}

export function validateExternalApiKey(key: string): boolean {
  const validKeys = (process.env.EXTERNAL_API_KEYS || "").split(",").filter(Boolean);
  return validKeys.includes(key);
}

// Returns a 401 response to short-circuit with, or null when the request
// carries a valid key.
export function requireExternalApiKey(request: NextRequest): NextResponse | null {
  const apiKey = getExternalApiKey(request);
  if (!apiKey || !validateExternalApiKey(apiKey)) {
    return NextResponse.json({ error: "Valid API key required" }, { status: 401 });
  }
  return null;
}
