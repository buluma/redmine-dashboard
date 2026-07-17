import { jsonError, parseJson } from "@/src/lib/http";
import { logEvent } from "@/src/lib/log";
import { isRateLimited, rateLimitHeaders } from "@/src/lib/rate-limit";
import { connectRedmineAccount } from "@/src/lib/redmine-connect";
import { connectSchema } from "@/src/lib/schemas";
import { setSessionCookie } from "@/src/lib/session";
import { runSyncJob } from "@/src/lib/sync";

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: Request) {
  try {
    // Login accepts a Redmine base URL + API key. Throttle per IP so the
    // endpoint can't be used to brute-force / spray API keys against Redmine.
    const limiter = isRateLimited({ key: `redmine-connect:${clientIp(request)}`, max: 10, windowMs: 60_000 });
    if (limiter.limited) {
      logEvent("redmine.connect.rate_limited", { ip: clientIp(request) }, "warn");
      return jsonError("Too many connection attempts. Please wait a minute.", 429, rateLimitHeaders(limiter));
    }

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
