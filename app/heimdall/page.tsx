import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db";
import { getSessionUserId } from "@/src/lib/session";
import { HeimdallDashboardView } from "./heimdall-dashboard-view";

export const runtime = "nodejs";

const ERROR_TEXT_TERMS = ["error", "exception", "failed", "warn"];

const textErrorWhere = (field: "backtrace" | "errorDescr" | "scriptName") => ({
  OR: ERROR_TEXT_TERMS.map((term) => ({ [field]: { contains: term } })),
});

const mbuErrorWhere = {
  OR: [
    { logLevel: { in: ["ERROR", "WARN"] } },
    textErrorWhere("backtrace"),
  ],
};

const traceErrorWhere = {
  OR: [
    { logLevel: { in: ["ERROR", "WARN"] } },
    textErrorWhere("backtrace"),
  ],
};

const ssrErrorWhere = {
  OR: [
    { isError: true },
    { status: { contains: "error" } },
    { status: { contains: "fail" } },
    textErrorWhere("errorDescr"),
    textErrorWhere("scriptName"),
  ],
};

export default async function HeimdallPage() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    redirect("/");
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  // Determine the most recent date with data
  const [mbuDateRange, ssrDateRange, traceDateRange] = await Promise.all([
    prisma.mbuLog.aggregate({ _max: { createdAt: true } }),
    prisma.serverSideRulesLog.aggregate({ _max: { createdAt: true } }),
    prisma.trace.aggregate({ _max: { createdAt: true } }),
  ]);

  const maxDates: Date[] = [];
  for (const range of [mbuDateRange, ssrDateRange, traceDateRange]) {
    if (range._max.createdAt) maxDates.push(range._max.createdAt);
  }

  const globalMax = maxDates.length > 0
    ? new Date(Math.max(...maxDates.map(d => d.getTime())))
    : new Date();

  // Build up to 7 daily buckets going backwards from the most recent data
  const trendDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(globalMax.getTime());
    date.setDate(date.getDate() - i);
    trendDates.unshift(date.toISOString().split("T")[0]);
  }
  const trendStart = new Date(`${trendDates[0]}T00:00:00.000Z`);

  const [
    mbuLogCount,
    ssrLogCount,
    traceCount,
    mbuErrorCount,
    ssrErrorCount,
    traceErrorCount,
    mbuHosts,
    ssrHosts,
    traceHosts,
    mbuTrendRows,
    ssrTrendRows,
    traceTrendRows,
    mbuByLevelRows,
    ssrByStatusRows,
    traceByLevelRows,
    topScriptRows,
    mbuErrorRows,
    ssrErrorRows,
    traceErrorRows,
    mbuLogs,
    serverSideRulesLogs,
    traces,
  ] = await Promise.all([
    prisma.mbuLog.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.serverSideRulesLog.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.trace.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.mbuLog.count({ where: { createdAt: { gte: thirtyDaysAgo }, ...mbuErrorWhere } }),
    prisma.serverSideRulesLog.count({ where: { createdAt: { gte: thirtyDaysAgo }, ...ssrErrorWhere } }),
    prisma.trace.count({ where: { createdAt: { gte: thirtyDaysAgo }, ...traceErrorWhere } }),
    prisma.mbuLog.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      distinct: ["host"],
      select: { host: true },
    }),
    prisma.serverSideRulesLog.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      distinct: ["host"],
      select: { host: true },
    }),
    prisma.trace.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      distinct: ["host"],
      select: { host: true },
    }),
    prisma.mbuLog.findMany({
      where: { createdAt: { gte: trendStart } },
      select: { createdAt: true },
    }),
    prisma.serverSideRulesLog.findMany({
      where: { createdAt: { gte: trendStart } },
      select: { createdAt: true },
    }),
    prisma.trace.findMany({
      where: { createdAt: { gte: trendStart } },
      select: { createdAt: true },
    }),
    prisma.mbuLog.groupBy({
      by: ["logLevel"],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: { _all: true },
      orderBy: { _count: { logLevel: "desc" } },
    }),
    prisma.serverSideRulesLog.groupBy({
      by: ["status"],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: { _all: true },
      orderBy: { _count: { status: "desc" } },
    }),
    prisma.trace.groupBy({
      by: ["logLevel"],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: { _all: true },
      orderBy: { _count: { logLevel: "desc" } },
    }),
    prisma.serverSideRulesLog.groupBy({
      by: ["scriptName"],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: { _all: true },
      orderBy: { _count: { scriptName: "desc" } },
      take: 8,
    }),
    prisma.mbuLog.findMany({
      where: { createdAt: { gte: thirtyDaysAgo }, ...mbuErrorWhere },
      orderBy: { createdAt: "desc" },
    }),
    prisma.serverSideRulesLog.findMany({
      where: { createdAt: { gte: thirtyDaysAgo }, ...ssrErrorWhere },
      orderBy: { createdAt: "desc" },
    }),
    prisma.trace.findMany({
      where: { createdAt: { gte: thirtyDaysAgo }, ...traceErrorWhere },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mbuLog.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.serverSideRulesLog.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.trace.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
  ]);

  const totalLogs = mbuLogCount + ssrLogCount + traceCount;
  const errorCount = mbuErrorCount + ssrErrorCount + traceErrorCount;

  const allHosts = Array.from(new Set([
    ...mbuHosts.map((l) => l.host),
    ...ssrHosts.map((l) => l.host),
    ...traceHosts.map((l) => l.host),
  ])).sort();

  // Bucket trend data into daily counts (up to 7 days)
  const getDateKey = (date: Date) => date.toISOString().split("T")[0];

  const mbuTrendMap = new Map<string, number>();
  const ssrTrendMap = new Map<string, number>();
  const traceTrendMap = new Map<string, number>();

  const addLogsToTrendMap = (logs: { createdAt: Date }[], trendMap: Map<string, number>) => {
    for (const log of logs) {
      const date = getDateKey(log.createdAt);
      trendMap.set(date, (trendMap.get(date) ?? 0) + 1);
    }
  };

  addLogsToTrendMap(mbuTrendRows, mbuTrendMap);
  addLogsToTrendMap(ssrTrendRows, ssrTrendMap);
  addLogsToTrendMap(traceTrendRows, traceTrendMap);

  const mbuTrend = trendDates.map(d => mbuTrendMap.get(d) ?? 0);
  const ssrTrend = trendDates.map(d => ssrTrendMap.get(d) ?? 0);
  const traceTrend = trendDates.map(d => traceTrendMap.get(d) ?? 0);

  const allErrors = [
    ...mbuErrorRows.map((l) => ({
      _source: "mbu_logs",
      id: l.id.toString(),
      level: l.logLevel,
      message: l.backtrace,
      createdAt: l.createdAt.toISOString(),
    })),
    ...ssrErrorRows.map((l) => ({
      _source: "server_side_rules_log",
      id: l.id.toString(),
      level: "ERROR",
      message: `${l.scriptName} — ${l.errorDescr || l.status}`,
      createdAt: l.createdAt.toISOString(),
    })),
    ...traceErrorRows.map((l) => ({
      _source: "traces",
      id: l.id.toString(),
      level: l.logLevel,
      message: l.backtrace,
      createdAt: l.createdAt.toISOString(),
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <HeimdallDashboardView
      totalLogs={totalLogs}
      errorCount={errorCount}
      hostCount={allHosts.length}
      mbuLogCount={mbuLogCount}
      ssrLogCount={ssrLogCount}
      traceCount={traceCount}
      mbuErrorCount={mbuErrorCount}
      ssrErrorCount={ssrErrorCount}
      traceErrorCount={traceErrorCount}
      mbuLogs={mbuLogs.map(l => ({ 
        ...l, 
        id: l.id.toString(), 
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
        ingestedAt: l.ingestedAt.toISOString()
      }))}
      ssrLogs={serverSideRulesLogs.map(l => ({ 
        ...l, 
        id: l.id.toString(), 
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
        ingestedAt: l.ingestedAt.toISOString(),
        duration: l.duration.toNumber(),
        dbRequestsTime: l.dbRequestsTime?.toNumber() ?? null,
        threadId: l.threadId?.toString() ?? null
      }))}
      traces={traces.map(l => ({ 
        ...l, 
        id: l.id.toString(), 
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
        ingestedAt: l.ingestedAt.toISOString(),
        traceId: l.traceId.toString()
      }))}
      trendDates={trendDates}
      mbuTrend={mbuTrend}
      ssrTrend={ssrTrend}
      traceTrend={traceTrend}
      mbuByLevel={mbuByLevelRows.map((row) => [row.logLevel, row._count._all])}
      ssrByStatus={ssrByStatusRows.map((row) => [row.status, row._count._all])}
      traceByLevel={traceByLevelRows.map((row) => [row.logLevel, row._count._all])}
      topScripts={topScriptRows.map((row) => [row.scriptName, row._count._all])}
      allErrors={allErrors}
    />
  );
}
