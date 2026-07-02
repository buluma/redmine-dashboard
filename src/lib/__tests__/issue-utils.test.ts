import { describe, expect, it } from "vitest";
import { issueDisplayId } from "@/src/lib/issue-utils";

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
