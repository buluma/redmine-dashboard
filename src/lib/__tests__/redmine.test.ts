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
});
