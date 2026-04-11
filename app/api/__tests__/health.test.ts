import { describe, it, expect } from "vitest";
import { fetch } from "undici";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

describe("AI Status API", () => {
  it("should return AI status", async () => {
    const res = await fetch(`${BASE_URL}/api/ai/status`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect((data as { available?: unknown }).available).toBeDefined();
  });
});

describe("Bootstrap API", () => {
  it("should return bootstrap info without auth", async () => {
    const res = await fetch(`${BASE_URL}/api/redmine/bootstrap`);

    // Should return either 401 or bootstrap info
    expect([200, 401]).toContain(res.status);
  });
});
