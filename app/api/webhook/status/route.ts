import { NextResponse } from "next/server";
import { requireRole } from "@/src/lib/rbac";
import { getWebhookStatus } from "@/src/lib/outgoing-webhook";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Require admin or editor role
    await requireRole("ADMIN", "EDITOR");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = getWebhookStatus();
  return NextResponse.json(status);
}