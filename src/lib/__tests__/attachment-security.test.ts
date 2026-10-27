import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RedmineClient } from "@/src/lib/redmine";

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No server port");
  return address.port;
}

describe("attachment download destination", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves valid absolute and path-only URLs under the configured server", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("image"));
    vi.stubGlobal("fetch", fetchMock);
    const client = new RedmineClient("https://redmine.example.test/redmine", "secret");

    await client.downloadAttachment("/attachments/download/1/file.png");
    await client.downloadAttachment("https://redmine.example.test/redmine/attachments/download/1/file.png");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://redmine.example.test/redmine/attachments/download/1/file.png",
      expect.objectContaining({ redirect: "error", headers: { "X-Redmine-API-Key": "secret" } }),
    );
  });

  it.each([
    "https://other.example.test/redmine/attachments/1",
    "http://redmine.example.test/redmine/attachments/1",
    "https://redmine.example.test.evil.test/redmine/attachments/1",
    "https://user@redmine.example.test/redmine/attachments/1",
    "https://redmine.example.test/other/attachments/1",
    "https://redmine.example.test/redmine%2f..%2fother/attachments/1",
  ])("rejects a destination outside the configured server: %s", async (url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new RedmineClient("https://redmine.example.test/redmine", "secret");

    await expect(client.downloadAttachment(url)).rejects.toThrow("Attachment URL does not match");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send the key to a redirect target", async () => {
    let targetRequests = 0;
    const target = createServer((_request, response) => {
      targetRequests += 1;
      response.end("unexpected");
    });
    const targetPort = await listen(target);
    const source = createServer((_request, response) => {
      response.writeHead(302, { location: `http://127.0.0.1:${targetPort}/stolen` });
      response.end();
    });
    const sourcePort = await listen(source);
    try {
      const client = new RedmineClient(`http://127.0.0.1:${sourcePort}`, "secret");
      await expect(client.downloadAttachment("/attachment")).rejects.toThrow();
      expect(targetRequests).toBe(0);
    } finally {
      await Promise.all([
        new Promise<void>((resolve, reject) => source.close((error) => error ? reject(error) : resolve())),
        new Promise<void>((resolve, reject) => target.close((error) => error ? reject(error) : resolve())),
      ]);
    }
  });
});
