import { describe, expect, it } from "vitest";
import { issueDisplayId, issueNumericId, issueRouteId } from "@/src/lib/issue-utils";

describe("issueNumericId", () => {
  it("returns a positive integer Redmine id unchanged", () => {
    expect(issueNumericId(42)).toBe(42);
  });

  it("returns null for null (local tickets)", () => {
    expect(issueNumericId(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(issueNumericId(undefined)).toBeNull();
  });

  it("returns null for zero and negative ids", () => {
    expect(issueNumericId(0)).toBeNull();
    expect(issueNumericId(-7)).toBeNull();
  });

  it("returns null for non-integer values", () => {
    expect(issueNumericId(1.5)).toBeNull();
    expect(issueNumericId(Number.NaN)).toBeNull();
  });
});

describe("issueRouteId", () => {
  it("routes Redmine tickets by their numeric id", () => {
    expect(issueRouteId({ id: "cuid123", redmineIssueId: 42 })).toBe("42");
  });

  it("falls back to the local DB id for local tickets", () => {
    expect(issueRouteId({ id: "cuid123", redmineIssueId: null })).toBe("cuid123");
  });
});

describe("issueDisplayId", () => {
  it("renders Redmine tickets as #<id>", () => {
    expect(issueDisplayId({ redmineIssueId: 42, localIssueNumber: null })).toBe("#42");
  });

  it("renders local tickets as L-<n>, matching the external API convention", () => {
    expect(issueDisplayId({ redmineIssueId: null, localIssueNumber: 5 })).toBe("L-5");
  });

  it("prefers the Redmine id when both are present", () => {
    expect(issueDisplayId({ redmineIssueId: 42, localIssueNumber: 5 })).toBe("#42");
  });

  it("falls back to # when neither id exists", () => {
    expect(issueDisplayId({ redmineIssueId: null, localIssueNumber: null })).toBe("#");
  });
});
