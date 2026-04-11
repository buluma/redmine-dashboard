import { describe, expect, it } from "vitest";
import {
  commentSchema,
  connectSchema,
  githubLinkCreateSchema,
  mobilePairConnectSchema,
  relationCreateSchema,
  statusUpdateSchema,
  timeLogSchema,
} from "@/src/lib/schemas";

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

  it("rejects time log comments over Redmine limit", () => {
    expect(() =>
      timeLogSchema.parse({
        hours: 1,
        activityId: 1,
        comment: "x".repeat(256),
        spentOn: "2026-02-25",
      }),
    ).toThrow();
  });

  it("accepts github link payload with repository and issue", () => {
    const out = githubLinkCreateSchema.parse({
      repositoryFullName: "acme/platform",
      githubIssueNumber: 123,
    });
    expect(out.repositoryFullName).toBe("acme/platform");
    expect(out.githubIssueNumber).toBe(123);
  });

  it("rejects github link payload when issue and pr numbers are both provided", () => {
    expect(() =>
      githubLinkCreateSchema.parse({
        repositoryFullName: "acme/platform",
        githubIssueNumber: 12,
        githubPrNumber: 34,
      }),
    ).toThrow();
  });

  it("accepts mobile pair payload with device name", () => {
    const out = mobilePairConnectSchema.parse({
      baseUrl: "https://redmine.example.com",
      apiKey: "abcdef123456",
      deviceName: "Pixel 9",
    });
    expect(out.deviceName).toBe("Pixel 9");
  });

  it("accepts documented Redmine relation types", () => {
    const out = relationCreateSchema.parse({
      issueToId: 456,
      relationType: "copied_from",
    });
    expect(out.relationType).toBe("copied_from");
  });
});
