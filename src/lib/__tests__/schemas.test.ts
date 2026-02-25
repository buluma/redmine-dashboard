import { describe, expect, it } from "vitest";
import { commentSchema, connectSchema, statusUpdateSchema, timeLogSchema } from "@/src/lib/schemas";

describe("validation schemas", () => {
  it("accepts valid connect input", () => {
    const out = connectSchema.parse({
      baseUrl: "https://redmine.example.com",
      apiKey: "abcdef123456",
    });
    expect(out.baseUrl).toBe("https://redmine.example.com");
  });

  it("rejects empty comment", () => {
    expect(() => commentSchema.parse({ comment: "   " })).toThrow();
  });

  it("rejects invalid status id", () => {
    expect(() => statusUpdateSchema.parse({ statusId: -1 })).toThrow();
  });

  it("accepts time log with required fields", () => {
    const out = timeLogSchema.parse({
      hours: 1.5,
      activityId: 9,
      comment: "Worked on fix",
      spentOn: "2026-02-25",
    });
    expect(out.hours).toBe(1.5);
  });
});
