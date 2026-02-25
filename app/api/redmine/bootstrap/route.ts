import { prisma } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { jsonError } from "@/src/lib/http";
import { connectRedmineAccount } from "@/src/lib/redmine-connect";
import { setSessionCookie } from "@/src/lib/session";
import { runSyncJob } from "@/src/lib/sync";

function configuredFromEnv(): boolean {
  return Boolean(env.redmineBaseUrl && env.redmineApiKey);
}

export async function GET() {
  const configured = configuredFromEnv();
  const activeCredentials = await prisma.userRedmineCredential.count({ where: { isActive: true } });
  const canBootstrap = configured && activeCredentials === 0;

  return Response.json({
    configured,
    canBootstrap,
    activeCredentials,
  });
}

export async function POST() {
  try {
    if (!configuredFromEnv()) {
      return jsonError("Missing REDMINE_BASE_URL or REDMINE_API_KEY in environment", 400);
    }

    const activeCredentials = await prisma.userRedmineCredential.count({ where: { isActive: true } });
    if (activeCredentials > 0) {
      return jsonError("Bootstrap is only available on first run", 409);
    }

    const user = await connectRedmineAccount(env.redmineBaseUrl!, env.redmineApiKey!);
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
    const message = error instanceof Error ? error.message : "Failed to bootstrap from environment";
    return jsonError(message, 400);
  }
}
