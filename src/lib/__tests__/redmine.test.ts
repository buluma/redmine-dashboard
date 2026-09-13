import { afterEach, describe, expect, it, vi } from "vitest";
import { RedmineClient, RedmineError, redmineMessageFromError, redmineStatusFromError } from "@/src/lib/redmine";

describe("RedmineClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads files as octet-stream and preserves MIME type for issue attachment payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ upload: { token: "upload-token" } }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RedmineClient("https://redmine.example.com/", "apikey");
    const upload = await client.uploadFile({
      filename: "screenshot.png",
      contentType: "image/png",
      bytes: new Uint8Array([1, 2, 3]).buffer,
    });
    await client.addIssueAttachment({
      issueId: 123,
      token: upload.token,
      filename: "screenshot.png",
      contentType: "image/png",
      description: "Screenshot",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://redmine.example.com/uploads.json?filename=screenshot.png",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/octet-stream",
          "X-Redmine-API-Key": "apikey",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://redmine.example.com/issues/123.json",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          issue: {
            uploads: [
              {
                token: "upload-token",
                filename: "screenshot.png",
                description: "Screenshot",
                content_type: "image/png",
              },
            ],
          },
        }),
      }),
    );
  });

  it("includes custom_fields in updateIssue payload when provided", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RedmineClient("https://redmine.example.com", "apikey");
    await client.updateIssue(42, {
      subject: "Updated subject",
      customFields: [
        { id: 5, value: "foo" },
        { id: 9, value: "bar" },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://redmine.example.com/issues/42.json",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          issue: {
            subject: "Updated subject",
            custom_fields: [
              { id: 5, value: "foo" },
              { id: 9, value: "bar" },
            ],
          },
        }),
      }),
    );
  });

  it("PUTs hours to /time_entries/{id}.json for updateTimeEntry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RedmineClient("https://redmine.example.com", "apikey");
    await client.updateTimeEntry(693688, { hours: 3.1 });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://redmine.example.com/time_entries/693688.json",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ time_entry: { hours: 3.1 } }),
      }),
    );
  });

  it("surfaces a RedmineError from updateTimeEntry when the issue rejects the edit (e.g. closed)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errors: ["Issue is closed"] }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const client = new RedmineClient("https://redmine.example.com", "apikey");
    await expect(client.updateTimeEntry(693688, { hours: 3.1 })).rejects.toMatchObject({
      name: "RedmineError",
      status: 403,
      errors: ["Issue is closed"],
    });
  });

  it("throws typed Redmine errors without exposing upstream body in the Error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errors: ["Hours is invalid"] }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const client = new RedmineClient("https://redmine.example.com", "apikey");
    await expect(
      client.addTimeEntry({
        issueId: 123,
        hours: 99,
        activityId: 9,
        spentOn: "2026-04-11",
      }),
    ).rejects.toMatchObject({
      name: "RedmineError",
      status: 422,
      errors: ["Hours is invalid"],
      message: "Redmine request failed (422)",
    });

    const error = new RedmineError(422, '{"errors":["Hours is invalid"]}', ["Hours is invalid"]);
    expect(redmineStatusFromError(error)).toBe(422);
    expect(redmineMessageFromError(error, "Unable to save time entry")).toBe("Hours is invalid");
  });

  it("includes category_id and custom_fields in createIssue payload when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ issue: { id: 555 } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new RedmineClient("https://redmine.example.com", "apikey");
    const result = await client.createIssue({
      subject: "Week 29 DRC Support",
      projectId: 42,
      trackerId: 3,
      priorityId: 2,
      categoryId: 7,
      customFields: [{ id: 20, value: "Major" }],
      parentIssueId: 113554,
      startDate: "2026-07-13",
      dueDate: "2026-07-19",
    });

    expect(result).toEqual({ id: 555, url: "https://redmine.example.com/issues/555" });
    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body.issue.category_id).toBe(7);
    expect(body.issue.custom_fields).toEqual([{ id: 20, value: "Major" }]);
    expect(body.issue.parent_issue_id).toBe(113554);
    expect(body.issue.start_date).toBe("2026-07-13");
    expect(body.issue.due_date).toBe("2026-07-19");
  });

  it("omits category_id and custom_fields from createIssue payload when not provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ issue: { id: 556 } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new RedmineClient("https://redmine.example.com", "apikey");
    await client.createIssue({ subject: "Plain ticket" });

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body.issue).not.toHaveProperty("category_id");
    expect(body.issue).not.toHaveProperty("custom_fields");
    expect(body.issue).not.toHaveProperty("parent_issue_id");
  });

  describe("listIssuesByIds", () => {
    it("queries by explicit issue_id with no assigned_to filter, so a reassigned issue still comes back", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ issues: [{ id: 116762 }], total_count: 1, offset: 0, limit: 100 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const client = new RedmineClient("https://redmine.example.com", "apikey");
      const result = await client.listIssuesByIds([116762]);

      expect(result).toEqual([{ id: 116762 }]);
      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("issue_id=116762");
      expect(String(url)).toContain("status_id=*");
      expect(String(url)).not.toContain("assigned_to_id");
    });

    it("returns an empty list without calling fetch when given no ids", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const client = new RedmineClient("https://redmine.example.com", "apikey");
      const result = await client.listIssuesByIds([]);

      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("chunks large id lists into multiple requests", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ issues: [{ id: 1 }], total_count: 1, offset: 0, limit: 100 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ issues: [{ id: 101 }], total_count: 1, offset: 0, limit: 100 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      vi.stubGlobal("fetch", fetchMock);

      const client = new RedmineClient("https://redmine.example.com", "apikey");
      const ids = Array.from({ length: 101 }, (_, i) => i + 1);
      const result = await client.listIssuesByIds(ids);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result).toEqual([{ id: 1 }, { id: 101 }]);
    });
  });

  describe("request retry/backoff", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("retries a 429 with backoff and succeeds on the next attempt", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ user: { id: 1, login: "me" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      vi.stubGlobal("fetch", fetchMock);
      vi.useFakeTimers();

      const client = new RedmineClient("https://redmine.example.com", "apikey");
      const resultPromise = client.getCurrentUser();
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ id: 1, login: "me" });
    });

    it("retries a 500 with backoff and succeeds on the next attempt", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("server error", { status: 500 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ user: { id: 1, login: "me" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      vi.stubGlobal("fetch", fetchMock);
      vi.useFakeTimers();

      const client = new RedmineClient("https://redmine.example.com", "apikey");
      const resultPromise = client.getCurrentUser();
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("throws RedmineError with no retry on a non-retryable 4xx", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
      vi.stubGlobal("fetch", fetchMock);

      const client = new RedmineClient("https://redmine.example.com", "apikey");
      await expect(client.getCurrentUser()).rejects.toThrow(RedmineError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("gives up after exhausting all retries on a persistent 429", async () => {
      const fetchMock = vi.fn().mockImplementation(() => new Response("rate limited", { status: 429 }));
      vi.stubGlobal("fetch", fetchMock);
      vi.useFakeTimers();

      const client = new RedmineClient("https://redmine.example.com", "apikey");
      const resultPromise = client.getCurrentUser();
      const assertion = expect(resultPromise).rejects.toThrow(RedmineError);
      await vi.runAllTimersAsync();
      await assertion;

      // maxAttempts is 3 in RedmineClient.request — three tries, no more.
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("retries on an aborted (timed-out) request and succeeds on the next attempt", async () => {
      let call = 0;
      const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        call += 1;
        if (call === 1) {
          return new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              const err = new Error("This operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          });
        }
        return Promise.resolve(
          new Response(JSON.stringify({ user: { id: 1, login: "me" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      });
      vi.stubGlobal("fetch", fetchMock);
      vi.useFakeTimers();

      const client = new RedmineClient("https://redmine.example.com", "apikey");
      const resultPromise = client.getCurrentUser();
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ id: 1, login: "me" });
    });
  });
});
