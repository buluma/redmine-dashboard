import { prisma } from "@/src/lib/db";
import { requireCurrentUser } from "@/src/lib/auth";
import { jsonError } from "@/src/lib/http";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const { endpoint, keys } = body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return jsonError("Invalid subscription data", 400);
    }

    //Upsert subscription
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      update: {
        userId: user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Subscription failed";
    const status = message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get("endpoint");

    if (!endpoint) {
      return jsonError("Endpoint required", 400);
    }

    await prisma.pushSubscription.deleteMany({
      where: {
        userId: user.id,
        endpoint,
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unsubscription failed";
    const status = message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
