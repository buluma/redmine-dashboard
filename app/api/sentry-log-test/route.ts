import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  if (process.env.ENABLE_SENTRY_TEST_ROUTES !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  Sentry.logger.info("User triggered test log", { log_source: "sentry_test" });

  return NextResponse.json({
    ok: true,
    message: "Sentry test log emitted",
    log_source: "sentry_test",
  });
}
