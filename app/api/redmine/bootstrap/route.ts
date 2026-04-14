import { prisma } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { jsonError } from "@/src/lib/http";
import { logEvent } from "@/src/lib/log";
import { connectRedmineAccount } from "@/src/lib/redmine-connect";
import { setSessionCookie } from "@/src/lib/session";
import { runSyncJob } from "@/src/lib/sync";

function configuredFromEnv(): boolean {
  return Boolean(env.redmineBaseUrl && env.redmineApiKey);
}

export async function GET() {
  const configured = configuredFromEnv();
  try {
    const activeCredentials = await prisma.userRedmineCredential.count({ where: { isActive: true } });
    const canBootstrap = configured && activeCredentials === 0;

    return Response.json({
      configured,
      canBootstrap,
      activeCredentials,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check bootstrap state";
    return Response.json(
      {
        configured,
        canBootstrap: false,
        activeCredentials: 0,
        degraded: true,
        error: message,
      },
      { status: 503 },
    );
  }
}

export async function POST() {
  try {
    logEvent("redmine.bootstrap.requested");
    if (!configuredFromEnv()) {
      logEvent("redmine.bootstrap.missing_env", undefined, "warn");
      return jsonError("Missing REDMINE_BASE_URL or REDMINE_API_KEY in environment", 400);
    }

    const activeCredentials = await prisma.userRedmineCredential.count({ where: { isActive: true } });
    if (activeCredentials > 0) {
      logEvent("redmine.bootstrap.blocked_existing_credentials", { activeCredentials }, "warn");
      return jsonError("Bootstrap is only available on first run", 409);
    }

    const user = await connectRedmineAccount(env.redmineBaseUrl!, env.redmineApiKey!);
    await setSessionCookie(user.id);
    const job = await runSyncJob(user.id, "full_manual");
    logEvent("redmine.bootstrap.succeeded", { userId: user.id, syncJobId: job.jobId });

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
    const message = error instanceof Error ? error.message : "Failed to bootstrap from environment";
    logEvent("redmine.bootstrap.failed", { error: message }, "error");
    return jsonError(message, 400);
  }
}
