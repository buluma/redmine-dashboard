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
});
