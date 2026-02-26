import { jsonError, parseJson } from "@/src/lib/http";
import { logEvent } from "@/src/lib/log";
import { connectRedmineAccount } from "@/src/lib/redmine-connect";
import { connectSchema } from "@/src/lib/schemas";
import { setSessionCookie } from "@/src/lib/session";
import { runSyncJob } from "@/src/lib/sync";

export async function POST(request: Request) {
  try {
    const body = await parseJson(request, connectSchema);
    logEvent("redmine.connect.requested", { baseUrl: body.baseUrl });
    const user = await connectRedmineAccount(body.baseUrl, body.apiKey);

    await setSessionCookie(user.id);
    const job = await runSyncJob(user.id, "full_manual");
    logEvent("redmine.connect.succeeded", { userId: user.id, syncJobId: job.jobId });

    return Response.json({
      ok: true,
      user: {
        id: user.id,
        username: user.emailOrUsername,
        displayName: user.displayName,
      },
      syncJobId: job.jobId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to connect Redmine";
    const status = /TLS certificate validation failed|Network error reaching Redmine/i.test(message) ? 502 : 400;
    logEvent("redmine.connect.failed", { error: message }, "error");
    return jsonError(message, status);
  }
}
