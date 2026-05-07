import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { z } from "zod";

const subscribeSchema = z.object({
  fcmToken: z.string().min(1),
  platform: z.enum(["android", "ios"]).default("android"),
});

export async function POST(request: Request) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const body = await parseJson(request, subscribeSchema);

    await prisma.mobilePushToken.upsert({
      where: { fcmToken: body.fcmToken },
      create: {
        userId: user.id,
        fcmToken: body.fcmToken,
        platform: body.platform,
      },
      update: {
        userId: user.id,
        platform: body.platform,
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    const status =
      message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}

export async function DELETE(request: Request) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);

    await prisma.mobilePushToken.deleteMany({ where: { userId: user.id } });

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unregistration failed";
    const status =
      message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
