import { jsonError, parseJson } from "@/src/lib/http";
import { connectRedmineAccount } from "@/src/lib/redmine-connect";
import { connectSchema } from "@/src/lib/schemas";
import { setSessionCookie } from "@/src/lib/session";
import { runSyncJob } from "@/src/lib/sync";

export async function POST(request: Request) {
  try {
    const body = await parseJson(request, connectSchema);
    const user = await connectRedmineAccount(body.baseUrl, body.apiKey);

    await setSessionCookie(user.id);
    const job = await runSyncJob(user.id, "full_manual");

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
    return jsonError(message, 400);
  }
}
