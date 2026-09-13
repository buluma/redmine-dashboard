import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useIssueEditDraft } from "@/src/hooks/useIssueEditDraft";
import type { Issue } from "@/src/hooks/useIssueDetail";

const t = (key: string) => key;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function baseIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    redmineIssueId: 42,
    redmineBaseUrl: "https://redmine.example.test",
    source: "redmine",
    localIssueNumber: null,
    subject: "Test issue",
    description: "desc",
    projectName: null,
    parentIssueId: null,
    parentIssueLabel: null,
    tracker: "Bug",
    priority: "Normal",
    priorityId: 4,
    statusId: 1,
    statusName: "New",
    assignedToName: null,
    authorName: null,
    categoryId: null,
    categoryName: null,
    startDate: null,
    estimatedHours: null,
    spentHours: null,
    customFieldsJson: null,
    breadcrumbs: [],
    updatedOnRemote: "2026-09-13T00:00:00.000Z",
    lastActivityAt: null,
    lastActivityType: null,
    dueDate: null,
    doneRatio: 0,
    githubLinks: [],
    journals: [],
    timeEntries: [],
    attachments: [],
    relations: [],
    allowedStatuses: [],
    children: [],
    ...overrides,
  };
}

describe("useIssueEditDraft", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("seeds the draft from the issue on startEditMode", () => {
    const onSaved = vi.fn();
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useIssueEditDraft({ onSaved, onSuccess, onError, t }));

    act(() => result.current.startEditMode(baseIssue({ priorityId: 4, dueDate: "2026-09-20T00:00:00.000Z" })));

    expect(result.current.editMode).toBe(true);
    expect(result.current.editDraft).toMatchObject({ subject: "Test issue", priorityId: "4", dueDate: "2026-09-20" });
  });

  it("PUTs to the real Redmine edit endpoint for a non-local issue, then reloads", async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const onError = vi.fn();
    let capturedUrl: string | undefined;
    let capturedMethod: string | undefined;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      capturedUrl = String(input);
      capturedMethod = init?.method;
      return json({ issue: {} });
    });

    const { result } = renderHook(() => useIssueEditDraft({ onSaved, onSuccess, onError, t }));
    const issue = baseIssue();
    act(() => result.current.startEditMode(issue));

    await act(async () => {
      await result.current.saveEdit(issue);
    });

    expect(capturedUrl).toBe("/api/issues/issue-1/edit");
    expect(capturedMethod).toBe("PUT");
    expect(onSaved).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith("issues.messages.redmineUpdated");
    expect(result.current.editMode).toBe(false);
  });

  it("PATCHes the local API for a local-only issue instead of the Redmine edit endpoint", async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const onError = vi.fn();
    let capturedUrl: string | undefined;
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      capturedUrl = String(input);
      return json({ issue: {} });
    });

    const { result } = renderHook(() => useIssueEditDraft({ onSaved, onSuccess, onError, t }));
    const issue = baseIssue({ redmineIssueId: null, source: "local" });
    act(() => result.current.startEditMode(issue));

    await act(async () => {
      await result.current.saveEdit(issue);
    });

    expect(capturedUrl).toBe("/api/issues/local/issue-1");
    expect(onSuccess).toHaveBeenCalledWith("issues.messages.personalUpdated");
  });

  it("reports the server error and keeps editing on a failed save", async () => {
    const onSaved = vi.fn();
    const onSuccess = vi.fn();
    const onError = vi.fn();
    vi.spyOn(global, "fetch").mockResolvedValue(json({ error: "Validation failed" }, 400));

    const { result } = renderHook(() => useIssueEditDraft({ onSaved, onSuccess, onError, t }));
    const issue = baseIssue();
    act(() => result.current.startEditMode(issue));

    await act(async () => {
      await result.current.saveEdit(issue);
    });

    expect(onError).toHaveBeenCalledWith("Validation failed");
    expect(onSaved).not.toHaveBeenCalled();
    expect(result.current.editMode).toBe(true);
  });

  it("updateCustomField merges into the existing customFields map without touching others", () => {
    const onSaved = vi.fn();
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useIssueEditDraft({ onSaved, onSuccess, onError, t }));
    act(() => result.current.startEditMode(baseIssue({
      customFieldsJson: [{ id: 1, name: "A", value: "one" }, { id: 2, name: "B", value: "two" }],
    })));

    act(() => result.current.updateCustomField("2", "changed"));

    expect(result.current.editDraft?.customFields).toEqual({ "1": "one", "2": "changed" });
  });

  it("cancelEditMode clears the draft", () => {
    const onSaved = vi.fn();
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useIssueEditDraft({ onSaved, onSuccess, onError, t }));
    act(() => result.current.startEditMode(baseIssue()));

    act(() => result.current.cancelEditMode());

    expect(result.current.editMode).toBe(false);
    expect(result.current.editDraft).toBeNull();
  });
});
