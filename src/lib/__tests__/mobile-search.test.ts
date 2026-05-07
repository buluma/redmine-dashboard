import { describe, expect, it } from "vitest";
import { buildMobileSearchWhere } from "@/src/lib/mobile-search";

describe("buildMobileSearchWhere", () => {
  it("returns empty filter for blank query", () => {
    const result = buildMobileSearchWhere("u1", "");
    expect(result).toEqual({ userId: "u1" });
  });

  it("returns empty filter for short query (< 2 chars)", () => {
    const result = buildMobileSearchWhere("u1", "x");
    expect(result).toEqual({ userId: "u1" });
  });

  it("builds OR LIKE filter for query >= 2 chars", () => {
    const result = buildMobileSearchWhere("u1", "login bug");
    expect(result).toMatchObject({
      userId: "u1",
      OR: expect.arrayContaining([
        { subject: { contains: "login bug" } },
        { description: { contains: "login bug" } },
        { projectName: { contains: "login bug" } },
        { assignedToName: { contains: "login bug" } },
      ]),
    });
  });

  it("trims whitespace from query", () => {
    const result = buildMobileSearchWhere("u1", "  crash  ");
    expect(result).toMatchObject({
      userId: "u1",
      OR: expect.arrayContaining([{ subject: { contains: "crash" } }]),
    });
  });
});
