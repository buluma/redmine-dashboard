import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireCurrentUser();

    // Fetch MBU logs
    const mbuLogs = await prisma.mbuLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    // Fetch server side rules logs
    const serverSideRulesLogs = await prisma.serverSideRulesLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    // Fetch traces
    const traces = await prisma.trace.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    // Compute stats
    const mbuErrors = mbuLogs.filter((l) => l.logLevel === "ERROR" || l.logLevel === "WARN");
    const ssrErrors = serverSideRulesLogs.filter((l) => l.logLevel === "ERROR" || l.logLevel === "WARN");
    const traceErrors = traces.filter((l) => l.logLevel === "ERROR" || l.logLevel === "WARN");

    // Normalize for client
    const normalizeMbu = (logs: typeof mbuLogs) =>
      logs.map((l) => ({
        id: l.id,
        createdAt: l.createdAt.toISOString(),
        logLevel: l.logLevel,
        backtrace: l.backtrace || "",
        traceType: l.scriptName || "mbu",
        traceId: l.id,
        environment: l.environment,
        host: l.host,
        extra: l.extra as Record<string, string | number | boolean | null> | undefined,
      }));

    const normalizeSsr = (logs: typeof serverSideRulesLogs) =>
      logs.map((l) => ({
        id: l.id,
        createdAt: l.createdAt.toISOString(),
        logLevel: l.logLevel,
        backtrace: l.backtrace || "",
        traceType: l.scriptName || "ssr",
        traceId: l.id,
        environment: l.environment,
        host: l.host,
        extra: l.extra as Record<string, string | number | boolean | null> | undefined,
      }));

    const normalizeTrace = (logs: typeof traces) =>
      logs.map((l) => ({
        id: l.id,
        createdAt: l.createdAt.toISOString(),
        logLevel: l.logLevel,
        backtrace: l.message || l.backtrace || "",
        traceType: l.traceType || "trace",
        traceId: l.traceId || l.id,
        environment: l.environment,
        host: l.host,
        extra: l.extra as Record<string, string | number | boolean | null> | undefined,
      }));

    // Errors & warnings across all tables
    type ErrorEntry = {
      _source: string;
      id: string;
      level: string;
      message: string;
      createdAt: string;
    };

    const allErrors: ErrorEntry[] = [
      ...mbuErrors.map((l) => ({
        _source: "mbu_logs",
        id: l.id,
        level: l.logLevel,
        message: l.backtrace || "",
        createdAt: l.createdAt.toISOString(),
      })),
      ...ssrErrors.map((l) => ({
        _source: "server_side_rules_log",
        id: l.id,
        level: l.logLevel,
        message: l.backtrace || "",
        createdAt: l.createdAt.toISOString(),
      })),
      ...traceErrors.map((l) => ({
        _source: "traces",
        id: l.id,
        level: l.logLevel,
        message: l.message || l.backtrace || "",
        createdAt: l.createdAt.toISOString(),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Get unique hosts
    const hostsSet = new Set<string>();
    for (const l of mbuLogs) {
      if (l.host) hostsSet.add(l.host);
    }
    for (const l of serverSideRulesLogs) {
      if (l.host) hostsSet.add(l.host);
    }
    for (const l of traces) {
      if (l.host) hostsSet.add(l.host);
    }
    const allHosts = Array.from(hostsSet);

    return NextResponse.json({
      mbuLogs: normalizeMbu(mbuLogs),
      serverSideRulesLogs: normalizeSsr(serverSideRulesLogs),
      traces: normalizeTrace(traces),
      totalLogs: mbuLogs.length + serverSideRulesLogs.length + traces.length,
      errors: allErrors.slice(0, 50),
      mbuStats: { total: mbuLogs.length, errors: mbuErrors.length },
      ssrStats: { total: serverSideRulesLogs.length, errors: ssrErrors.length },
      traceStats: { total: traces.length, errors: traceErrors.length },
      allHosts,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
