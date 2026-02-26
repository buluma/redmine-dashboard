import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  Sentry.logger.info("User triggered test log", { log_source: "sentry_test" });

  return NextResponse.json({
    ok: true,
    message: "Sentry test log emitted",
    log_source: "sentry_test",
  });
}
