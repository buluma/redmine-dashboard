import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGithubLinkActions } from "@/src/hooks/useGithubLinkActions";

const t = (key: string) => key;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("useGithubLinkActions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs the payload, reloads, and reports the translated success message", async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const onError = vi.fn();
    let capturedBody: unknown;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toBe("/api/issues/issue-1/github-links");
      expect(init?.method).toBe("POST");
      capturedBody = JSON.parse(String(init?.body));
      return json({ link: {} });
    });

    const { result } = renderHook(() =>
      useGithubLinkActions({ issueId: "issue-1", onChanged, onSuccess, onError, t }),
    );

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.submitGithubLink({ repositoryFullName: "buluma/redmine-dashboard" } as never);
    });

    expect(returned).toBe(true);
    expect(capturedBody).toEqual({ repositoryFullName: "buluma/redmine-dashboard" });
    expect(onChanged).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith("issues.messages.githubLinked");
  });

  it("returns false and reports the error without reloading when the API rejects the link", async () => {
    const onChanged = vi.fn();
    const onSuccess = vi.fn();
    const onError = vi.fn();
    vi.spyOn(global, "fetch").mockResolvedValue(json({ error: "Already linked" }, 409));

    const { result } = renderHook(() =>
      useGithubLinkActions({ issueId: "issue-1", onChanged, onSuccess, onError, t }),
    );

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.submitGithubLink({ repositoryFullName: "x/y" } as never);
    });

    expect(returned).toBe(false);
    expect(onError).toHaveBeenCalledWith("Already linked");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("DELETEs the link by id, reloads, and reports the translated removal message", async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const onError = vi.fn();
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toBe("/api/issues/issue-1/github-links/link-9");
      expect(init?.method).toBe("DELETE");
      return json({ ok: true });
    });

    const { result } = renderHook(() =>
      useGithubLinkActions({ issueId: "issue-1", onChanged, onSuccess, onError, t }),
    );

    await act(async () => {
      await result.current.deleteGithubLink("link-9");
    });

    expect(onChanged).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith("issues.messages.githubRemoved");
  });

  it("tracks busy across the request", async () => {
    let resolveFetch!: (value: Response) => void;
    vi.spyOn(global, "fetch").mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }) as Promise<Response>,
    );

    const { result } = renderHook(() =>
      useGithubLinkActions({ issueId: "issue-1", onChanged: vi.fn(), onSuccess: vi.fn(), onError: vi.fn(), t }),
    );

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.submitGithubLink({ repositoryFullName: "x/y" } as never);
    });
    expect(result.current.busy).toBe(true);

    await act(async () => {
      resolveFetch(json({ link: {} }));
      await pending;
    });
    expect(result.current.busy).toBe(false);
  });
});
