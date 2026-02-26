import { requireMobileUser } from "@/src/lib/auth";
import { createMobileToken, revokeMobileToken } from "@/src/lib/mobile-auth";
import { jsonError } from "@/src/lib/http";
import { logEvent } from "@/src/lib/log";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";

export async function POST(request: Request) {
  try {
    assertMobileApiEnabled();
    const { user, tokenRecordId } = await requireMobileUser(request);
    await revokeMobileToken(tokenRecordId);
    const next = await createMobileToken(user.id);
    logEvent("mobile.token.rotated", {
      userId: user.id,
      previousTokenRecordId: tokenRecordId,
      nextTokenRecordId: next.tokenRecordId,
    });

    return Response.json({
      token: next.token,
      expiresAt: next.expiresAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to rotate token";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
