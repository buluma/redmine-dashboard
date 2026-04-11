import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "http";
import { fetch } from "undici";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

describe("Health API", () => {
  it("should return healthy status", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("healthy");
    expect(data.timestamp).toBeDefined();
  });
});

describe("AI Status API", () => {
  it("should return AI status", async () => {
    const res = await fetch(`${BASE_URL}/api/ai/status`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.available).toBeDefined();
  });
});

describe("Bootstrap API", () => {
  it("should return bootstrap info without auth", async () => {
    const res = await fetch(`${BASE_URL}/api/redmine/bootstrap`);
    const data = await res.json();

    // Should return either 401 or bootstrap info
    expect([200, 401]).toContain(res.status);
  });
});