import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db";
import { getSessionUserId } from "@/src/lib/session";
import { HeimdallDashboardView } from "./heimdall-dashboard-view";

export const runtime = "nodejs";

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
  
  const mbuLogs = await prisma.mbuLog.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const serverSideRulesLogs = await prisma.serverSideRulesLog.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const traces = await prisma.trace.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const totalLogs = mbuLogs.length + serverSideRulesLogs.length + traces.length;

  const allHosts = Array.from(new Set([
    ...mbuLogs.map((l) => l.host),
    ...serverSideRulesLogs.map((l) => l.host),
    ...traces.map((l) => l.host),
  ])).sort();

  const getDateKey = (date: Date) => date.toISOString().split('T')[0];
  const mbuTrendMap = new Map<string, number>();
  const ssrTrendMap = new Map<string, number>();
  const traceTrendMap = new Map<string, number>();
  
  const addLogsToTrendMap = (logs: any[], trendMap: Map<string, number>) => {
    for (const log of logs) {
      const date = getDateKey(log.createdAt);
      trendMap.set(date, (trendMap.get(date) ?? 0) + 1);
    }
  };
  
  addLogsToTrendMap(mbuLogs, mbuTrendMap);
  addLogsToTrendMap(serverSideRulesLogs, ssrTrendMap);
  addLogsToTrendMap(traces, traceTrendMap);
  
  const trendDates = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    trendDates.push(getDateKey(date));
  }

  const mbuByLevel = new Map<string, number>();
  for (const log of mbuLogs) {
    mbuByLevel.set(log.logLevel, (mbuByLevel.get(log.logLevel) ?? 0) + 1);
  }

  const ssrByStatus = new Map<string, number>();
  const ssrErrors = serverSideRulesLogs.filter((l) => l.isError);
  const ssrByScript = new Map<string, number>();
  for (const log of serverSideRulesLogs) {
    ssrByStatus.set(log.status, (ssrByStatus.get(log.status) ?? 0) + 1);
    ssrByScript.set(log.scriptName, (ssrByScript.get(log.scriptName) ?? 0) + 1);
  }
  const topScripts = Array.from(ssrByScript.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const traceByLevel = new Map<string, number>();
  for (const log of traces) {
    traceByLevel.set(log.logLevel, (traceByLevel.get(log.logLevel) ?? 0) + 1);
  }

  const mbuErrors = mbuLogs.filter((l) => l.logLevel === "ERROR" || l.logLevel === "WARN");
  const traceErrors = traces.filter((l) => l.logLevel === "ERROR" || l.logLevel === "WARN");

  const allErrors = [
    ...mbuErrors.map((l) => ({
      _source: "mbu_logs",
      id: l.id.toString(),
      level: l.logLevel,
      message: l.backtrace,
      createdAt: l.createdAt.toISOString(),
    })),
    ...ssrErrors.map((l) => ({
      _source: "server_side_rules_log",
      id: l.id.toString(),
      level: "ERROR",
      message: `${l.scriptName} — ${l.errorDescr || l.status}`,
      createdAt: l.createdAt.toISOString(),
    })),
    ...traceErrors.map((l) => ({
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
      errorCount={allErrors.length}
      hostCount={allHosts.length}
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
      mbuTrend={trendDates.map(d => mbuTrendMap.get(d) ?? 0)}
      ssrTrend={trendDates.map(d => ssrTrendMap.get(d) ?? 0)}
      traceTrend={trendDates.map(d => traceTrendMap.get(d) ?? 0)}
      mbuByLevel={Array.from(mbuByLevel.entries()).sort((a,b) => b[1]-a[1])}
      ssrByStatus={Array.from(ssrByStatus.entries()).sort((a,b) => b[1]-a[1])}
      traceByLevel={Array.from(traceByLevel.entries()).sort((a,b) => b[1]-a[1])}
      topScripts={topScripts}
      allErrors={allErrors}
    />
  );
}
