import { createMobileToken } from "@/src/lib/mobile-auth";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { jsonError, parseJson } from "@/src/lib/http";
import { logEvent } from "@/src/lib/log";
import { connectRedmineAccount } from "@/src/lib/redmine-connect";
import { isRateLimited } from "@/src/lib/rate-limit";
import { mobilePairConnectSchema } from "@/src/lib/schemas";
import { runSyncJob } from "@/src/lib/sync";

export async function POST(request: Request) {
  try {
    assertMobileApiEnabled();
    const payload = await parseJson(request, mobilePairConnectSchema);
    logEvent("mobile.pair.requested", { baseUrl: payload.baseUrl, deviceName: payload.deviceName ?? null });
    const limiter = isRateLimited({
      key: `mobile-pair:${payload.baseUrl}`,
      max: 5,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      return jsonError("Pairing is rate-limited. Please wait a minute.", 429);
    }

    const user = await connectRedmineAccount(payload.baseUrl, payload.apiKey);
    const token = await createMobileToken(user.id, payload.deviceName);
    const job = await runSyncJob(user.id, "full_manual");
    logEvent("mobile.pair.succeeded", { userId: user.id, tokenRecordId: token.tokenRecordId, syncJobId: job.jobId });

    return Response.json({
      token: token.token,
      expiresAt: token.expiresAt,
      user: {
        id: user.id,
        username: user.emailOrUsername,
        displayName: user.displayName,
      },
      syncJobId: job.jobId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to pair mobile device";
    const status =
      message === "Mobile API is disabled"
        ? 404
        : /TLS certificate validation failed|Network error reaching Redmine/i.test(message)
          ? 502
          : 400;
    logEvent("mobile.pair.failed", { status, error: message }, "error");
    return jsonError(message, status);
  }
}
