import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";

export async function GET(request: Request) {
  try {
    assertMobileApiEnabled();
    const { user, tokenRecordId } = await requireMobileUser(request);
    const token = await prisma.mobileApiToken.findUnique({
      where: { id: tokenRecordId },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return Response.json({
      user: {
        id: user.id,
        username: user.emailOrUsername,
        displayName: user.displayName,
      },
      token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load profile";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
