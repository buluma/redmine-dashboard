import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db";
import { getSessionUserId } from "@/src/lib/session";
import { hasPermission, requirePermission } from "@/src/lib/rbac";
import { AuditLogsView } from "./audit-logs-view";
import { AuditLogsAccessDenied } from "./access-denied";

export const runtime = "nodejs";

export default async function AuditLogsPage() {
  // Graceful auth: redirect to login if no session
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/");
  }

  // Check permission - require audit:view
  try {
    await requirePermission("audit:view");
  } catch {
    return <AuditLogsAccessDenied />;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    redirect("/");
  }

  // Fetch audit logs with pagination
  const canViewAllAuditLogs = await hasPermission(userId, "ops:view");
  const isAdmin = await hasPermission(userId, "users:manage");
  const auditLogs = await prisma.auditLog.findMany({
    where: canViewAllAuditLogs ? undefined : { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const visibleAuditLogs = auditLogs.map((log) => {
    if (isAdmin || log.entityType !== "InternalNote" || !log.changes || typeof log.changes !== "object" || Array.isArray(log.changes)) {
      return log;
    }

    // Editors can inspect the global audit trail, but only administrators can
    // read note bodies. The notes API limits those bodies to their owner.
    const { content: _privateContent, ...changes } = log.changes as Record<string, unknown>;
    return { ...log, changes };
  });

  // Calculate stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = new Date(today);

  const stats = {
    total: visibleAuditLogs.length,
    creates: visibleAuditLogs.filter(l => l.action === "CREATE").length,
    updates: visibleAuditLogs.filter(l => l.action === "UPDATE").length,
    deletes: visibleAuditLogs.filter(l => l.action === "DELETE").length,
    today: visibleAuditLogs.filter(l => l.createdAt >= todayStart).length,
    uniqueUsers: new Set(visibleAuditLogs.filter(l => l.userId).map(l => l.userId)).size,
  };

  return (
    <AuditLogsView 
      auditLogs={visibleAuditLogs.map(l => ({ ...l, id: l.id.toString(), createdAt: l.createdAt.toISOString() }))}
      stats={stats}
    />
  );
}
