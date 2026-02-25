import { prisma } from "@/src/lib/db";
import { encryptText } from "@/src/lib/crypto";
import { jsonError, parseJson } from "@/src/lib/http";
import { RedmineClient } from "@/src/lib/redmine";
import { connectSchema } from "@/src/lib/schemas";
import { setSessionCookie } from "@/src/lib/session";
import { runSyncJob } from "@/src/lib/sync";

function displayName(firstname: string, lastname: string): string {
  return `${firstname} ${lastname}`.trim();
}

export async function POST(request: Request) {
  try {
    const body = await parseJson(request, connectSchema);
    const client = new RedmineClient(body.baseUrl, body.apiKey);
    const currentUser = await client.getCurrentUser();

    const user = await prisma.user.upsert({
      where: { emailOrUsername: currentUser.login },
      update: {
        displayName: displayName(currentUser.firstname, currentUser.lastname),
      },
      create: {
        emailOrUsername: currentUser.login,
        displayName: displayName(currentUser.firstname, currentUser.lastname),
      },
    });

    const encrypted = encryptText(body.apiKey);

    await prisma.userRedmineCredential.upsert({
      where: { userId: user.id },
      update: {
        baseUrl: body.baseUrl.replace(/\/$/, ""),
        apiKeyEncrypted: encrypted.encrypted,
        apiKeyIv: encrypted.iv,
        isActive: true,
        lastValidatedAt: new Date(),
      },
      create: {
        userId: user.id,
        baseUrl: body.baseUrl.replace(/\/$/, ""),
        apiKeyEncrypted: encrypted.encrypted,
        apiKeyIv: encrypted.iv,
        isActive: true,
        lastValidatedAt: new Date(),
      },
    });

    await prisma.syncState.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

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
