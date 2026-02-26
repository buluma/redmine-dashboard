import { requireMobileUser } from "@/src/lib/auth";
import { revokeMobileToken } from "@/src/lib/mobile-auth";
import { jsonError } from "@/src/lib/http";
import { logEvent } from "@/src/lib/log";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";

export async function DELETE(request: Request) {
  try {
    assertMobileApiEnabled();
    const { user, tokenRecordId } = await requireMobileUser(request);
    await revokeMobileToken(tokenRecordId);
    logEvent("mobile.token.revoked", {
      userId: user.id,
      tokenRecordId,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to revoke token";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
