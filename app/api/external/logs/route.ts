import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { trackFailure } from "@/src/lib/telemetry";

export const runtime = "nodejs";

// GET /api/external/logs/digest
// Returns mbu_logs and server_side_rules_log counts, recent errors, last ingested.
// Requires: X-API-Key header matching EXTERNAL_API_KEYS env var.
//
// Query params:
//   - env: filter by environment (default: all)
//   - errorLimit: max error records returned (default 5, max 20)

function getApiKey(request: NextRequest): string | null {
  const headerKey = request.headers.get("x-api-key");
  if (headerKey) return headerKey;
  const sp = (request as any).nextUrl?.searchParams ?? new URL(request.url).searchParams;
  return sp.get("api_key");
}

function validateApiKey(key: string): boolean {
  const validKeys = (process.env.EXTERNAL_API_KEYS || "").split(",").filter(Boolean);
  return validKeys.includes(key);
}

export async function GET(request: NextRequest) {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 401 });
  }
  const validKeys = (process.env.EXTERNAL_API_KEYS || "").split(",").filter(Boolean);
  if (validKeys.length > 0 && !validateApiKey(apiKey)) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const searchParams = (request as any).nextUrl?.searchParams ?? new URL(request.url).searchParams;
  const env = searchParams.get("env") || undefined;
  const errorLimit = Math.min(parseInt(searchParams.get("errorLimit") || "5"), 20);

  try {
    const mbuWhere = env ? { environment: env } : {};
    const ssrWhere = env ? { environment: env } : {};

    const [
      mbuTotal,
      mbuByLevel,
      mbuRecentErrors,
      mbuLastIngested,
      ssrTotal,
      ssrByStatus,
      ssrRecentErrors,
      ssrLastIngested,
    ] = await Promise.all([
      prisma.mbuLog.count({ where: mbuWhere }),
      prisma.mbuLog.groupBy({ by: ["logLevel"], where: mbuWhere, _count: { id: true } }),
      prisma.mbuLog.findMany({
        where: { ...mbuWhere, logLevel: "ERROR" },
        orderBy: { createdAt: "desc" },
        take: errorLimit,
        select: { id: true, logLevel: true, traceType: true, backtrace: true, createdAt: true, host: true, environment: true },
      }),
      prisma.mbuLog.findFirst({ where: mbuWhere, orderBy: { ingestedAt: "desc" }, select: { ingestedAt: true } }),
      prisma.serverSideRulesLog.count({ where: ssrWhere }),
      prisma.serverSideRulesLog.groupBy({ by: ["status"], where: ssrWhere, _count: { id: true } }),
      prisma.serverSideRulesLog.findMany({
        where: { ...ssrWhere, isError: true },
        orderBy: { createdAt: "desc" },
        take: errorLimit,
        select: { id: true, scriptName: true, status: true, duration: true, errorDescr: true, createdAt: true, host: true, environment: true },
      }),
      prisma.serverSideRulesLog.findFirst({ where: ssrWhere, orderBy: { ingestedAt: "desc" }, select: { ingestedAt: true } }),
    ]);

    return NextResponse.json({
      mbu_logs: {
        total: mbuTotal,
        by_level: Object.fromEntries(mbuByLevel.map((r) => [r.logLevel, r._count.id])),
        recent_errors: mbuRecentErrors.map((r) => ({
          id: r.id.toString(),
          log_level: r.logLevel,
          trace_type: r.traceType,
          backtrace: r.backtrace?.slice(0, 500),
          created_at: r.createdAt.toISOString(),
          host: r.host,
          environment: r.environment,
        })),
        last_ingested_at: mbuLastIngested?.ingestedAt?.toISOString() ?? null,
      },
      server_side_rules_log: {
        total: ssrTotal,
        by_status: Object.fromEntries(ssrByStatus.map((r) => [r.status, r._count.id])),
        recent_errors: ssrRecentErrors.map((r) => ({
          id: r.id.toString(),
          script_name: r.scriptName,
          status: r.status,
          duration_s: r.duration ? Number(r.duration) : null,
          error_descr: r.errorDescr?.slice(0, 500),
          created_at: r.createdAt.toISOString(),
          host: r.host,
          environment: r.environment,
        })),
        last_ingested_at: ssrLastIngested?.ingestedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    trackFailure({ event: "external.logs.digest.failed", error, metricName: "external_logs_digest_failed" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
