import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useIssueDetail, type Issue } from "@/src/hooks/useIssueDetail";

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
    description: null,
    projectName: null,
    parentIssueId: null,
    parentIssueLabel: null,
    tracker: null,
    priority: null,
    priorityId: null,
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

describe("useIssueDetail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the issue on mount and stops loading", async () => {
    const issue = baseIssue();
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/issues/issue-1") return json({ issue });
      if (url === "/api/ai/status") return json({ available: false });
      if (url === "/api/issues/42/status") return json({ allowedStatuses: [] });
      if (url === "/api/internal/activities") return json({ activities: [] });
      if (url === "/api/internal/users") return json({ users: [] });
      if (url === "/api/internal/priorities") return json({ priorities: [] });
      if (url === "/api/internal/custom-fields") return json({ customFields: [] });
      if (url === "/api/issues/42/favorite") return json({ favorited: false });
      return json({});
    });

    const { result } = renderHook(() => useIssueDetail("issue-1", t));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.issue?.id).toBe("issue-1");
    expect(result.current.error).toBeNull();
  });

  it("sets an error and stops loading when the fetch fails", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/issues/issue-1") return json({ error: "Not found" }, 404);
      return json({});
    });

    const { result } = renderHook(() => useIssueDetail("issue-1", t));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Not found");
    expect(result.current.issue).toBeNull();
  });

  it("reloadIssue re-fetches with fresh=1 and replaces the issue", async () => {
    const issue = baseIssue();
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/issues/issue-1") return json({ issue });
      if (url === "/api/issues/issue-1?fresh=1") return json({ issue: { ...issue, subject: "Updated" } });
      return json({});
    });

    const { result } = renderHook(() => useIssueDetail("issue-1", t));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reloadIssue();
    });

    expect(result.current.issue?.subject).toBe("Updated");
    expect(fetchSpy).toHaveBeenCalledWith("/api/issues/issue-1?fresh=1", expect.objectContaining({ cache: "no-store" }));
  });

  it("refreshIssueFromRedmine posts to /refresh then reloads, tracking refreshBusy", async () => {
    const issue = baseIssue();
    let refreshCalled = false;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/issues/issue-1") return json({ issue });
      if (url === "/api/issues/issue-1/refresh" && init?.method === "POST") {
        refreshCalled = true;
        return json({ ok: true });
      }
      if (url === "/api/issues/issue-1?fresh=1") return json({ issue: { ...issue, subject: "Refreshed" } });
      return json({});
    });

    const { result } = renderHook(() => useIssueDetail("issue-1", t));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refreshIssueFromRedmine();
    });

    expect(refreshCalled).toBe(true);
    expect(result.current.issue?.subject).toBe("Refreshed");
    expect(result.current.refreshBusy).toBe(false);
  });

  it("toggleFavorite POSTs when not favorited and flips the flag", async () => {
    const issue = baseIssue({ source: "local" }); // skip the auto favorite-status fetch effect
    let method: string | undefined;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/issues/issue-1") return json({ issue });
      if (url === "/api/issues/42/favorite") {
        method = init?.method ?? "GET";
        return json({ ok: true });
      }
      return json({});
    });

    const { result } = renderHook(() => useIssueDetail("issue-1", t));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggleFavorite();
    });

    expect(method).toBe("POST");
    expect(result.current.isFavorited).toBe(true);
  });

  it("refreshes attachments when the description references one the cache doesn't have", async () => {
    const issue = baseIssue({
      source: "local",
      description: "See ![shot](/api/issues/_ATTACHMENT_/shot.png)",
      attachments: [],
    });
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/issues/issue-1") return json({ issue });
      if (url === "/api/issues/42/attachments?refresh=1") {
        return json({ items: [{ id: "a1", redmineAttachmentId: 1, filename: "shot.png", filesize: 1, contentType: null, author: null, createdOnRemote: null }] });
      }
      return json({});
    });

    const { result } = renderHook(() => useIssueDetail("issue-1", t));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await waitFor(() => expect(result.current.issue?.attachments).toHaveLength(1));
    expect(result.current.issue?.attachments[0].filename).toBe("shot.png");
  });
});

it('clears the previous issue immediately and rejects late responses on navigation', async () => {
  const pending = new Map<string, (value: Response) => void>();
  vi.spyOn(global, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url === '/api/issues/first' || url === '/api/issues/second') return new Promise(resolve => pending.set(url, resolve));
    return json({});
  });
  const { result, rerender } = renderHook(({ id }) => useIssueDetail(id, t), { initialProps: { id: 'first' } });
  rerender({ id: 'second' });
  expect(result.current.issue).toBeNull();
  expect(result.current.loading).toBe(true);
  await act(async () => pending.get('/api/issues/second')!(json({ issue: baseIssue({ id: 'second' }) })));
  await act(async () => pending.get('/api/issues/first')!(json({ issue: baseIssue({ id: 'first' }) })));
  expect(result.current.issue?.id).toBe('second');
});
