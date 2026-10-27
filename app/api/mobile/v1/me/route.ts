import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";

export async function GET(request: Request) {
  try {
    assertMobileApiEnabled();
    const { user, tokenRecordId } = await requireMobileUser(request);
    const [token, credential] = await Promise.all([
      prisma.mobileApiToken.findUnique({
        where: { id: tokenRecordId },
        select: {
          id: true,
          name: true,
          tokenPrefix: true,
          lastUsedAt: true,
          createdAt: true,
          expiresAt: true,
        },
      }),
      prisma.userRedmineCredential.findUnique({
        where: { userId: user.id },
        select: { baseUrl: true, isActive: true },
      }),
    ]);

    return Response.json({
      user: {
        id: user.id,
        username: user.emailOrUsername,
        displayName: user.displayName,
      },
      redmineBaseUrl: credential?.isActive ? credential.baseUrl : null,
      token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load profile";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
