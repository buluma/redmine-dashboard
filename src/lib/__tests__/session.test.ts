import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "@/src/lib/session";

describe("session tokens", () => {
  it("creates and verifies token", () => {
    const token = createSessionToken("user_123");
    const userId = verifySessionToken(token);
    expect(userId).toBe("user_123");
  });

  it("rejects malformed token", () => {
    expect(verifySessionToken("bad.token")).toBeNull();
  });
});
