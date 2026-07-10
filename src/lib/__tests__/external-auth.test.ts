import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  getExternalApiKey,
  validateExternalApiKey,
  requireExternalApiKey,
} from "@/src/lib/external-auth";

function makeRequest(url: string, headers?: Record<string, string>): NextRequest {
  const req = new Request(url, { headers }) as unknown as NextRequest;
  (req as unknown as { nextUrl: URL }).nextUrl = new URL(url);
  return req;
}

beforeEach(() => {
  vi.stubEnv("EXTERNAL_API_KEYS", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getExternalApiKey", () => {
  it("reads the x-api-key header", () => {
    const req = makeRequest("http://localhost/api/external/sync", { "x-api-key": "abc" });
    expect(getExternalApiKey(req)).toBe("abc");
  });

  it("falls back to the api_key query param", () => {
    const req = makeRequest("http://localhost/api/external/sync?api_key=qp");
    expect(getExternalApiKey(req)).toBe("qp");
  });

  it("prefers the header over the query param", () => {
    const req = makeRequest("http://localhost/api/external/sync?api_key=qp", {
      "x-api-key": "hdr",
    });
    expect(getExternalApiKey(req)).toBe("hdr");
  });

  it("returns null when no key is supplied", () => {
    const req = makeRequest("http://localhost/api/external/sync");
    expect(getExternalApiKey(req)).toBeNull();
  });
});

describe("validateExternalApiKey", () => {
  it("accepts a key listed in EXTERNAL_API_KEYS", () => {
    vi.stubEnv("EXTERNAL_API_KEYS", "key-a,key-b");
    expect(validateExternalApiKey("key-b")).toBe(true);
  });

  it("rejects a key not in the list", () => {
    vi.stubEnv("EXTERNAL_API_KEYS", "key-a,key-b");
    expect(validateExternalApiKey("intruder")).toBe(false);
  });

  it("fails closed: rejects every key when EXTERNAL_API_KEYS is unset", () => {
    vi.stubEnv("EXTERNAL_API_KEYS", "");
    expect(validateExternalApiKey("anything")).toBe(false);
  });

  it("ignores empty segments in the comma list", () => {
    vi.stubEnv("EXTERNAL_API_KEYS", "key-a,,key-b,");
    expect(validateExternalApiKey("")).toBe(false);
    expect(validateExternalApiKey("key-a")).toBe(true);
  });
});

describe("requireExternalApiKey", () => {
  it("returns null for a valid key", () => {
    vi.stubEnv("EXTERNAL_API_KEYS", "key-a");
    const req = makeRequest("http://localhost/api/external/sync", { "x-api-key": "key-a" });
    expect(requireExternalApiKey(req)).toBeNull();
  });

  it("returns 401 when the key is missing", () => {
    vi.stubEnv("EXTERNAL_API_KEYS", "key-a");
    const req = makeRequest("http://localhost/api/external/sync");
    expect(requireExternalApiKey(req)?.status).toBe(401);
  });

  it("returns 401 for an invalid key", () => {
    vi.stubEnv("EXTERNAL_API_KEYS", "key-a");
    const req = makeRequest("http://localhost/api/external/sync", { "x-api-key": "nope" });
    expect(requireExternalApiKey(req)?.status).toBe(401);
  });

  it("fails closed: returns 401 for any key when no keys are configured", () => {
    vi.stubEnv("EXTERNAL_API_KEYS", "");
    const req = makeRequest("http://localhost/api/external/sync", { "x-api-key": "anything" });
    expect(requireExternalApiKey(req)?.status).toBe(401);
  });
});
