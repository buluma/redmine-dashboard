import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  if (process.env.ENABLE_SENTRY_TEST_ROUTES !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  Sentry.metrics.count("test_metric", 1);
  Sentry.metrics.distribution("api_response_time", 150, {
    unit: "millisecond",
  });

  return NextResponse.json({
    ok: true,
    message: "Sentry test metrics emitted",
    metrics: ["test_metric", "api_response_time"],
  });
}
