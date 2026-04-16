import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db";
import { getSessionUserId } from "@/src/lib/session";
import { requirePermission } from "@/src/lib/rbac";
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
  const auditLogs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Calculate stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = new Date(today);

  const stats = {
    total: auditLogs.length,
    creates: auditLogs.filter(l => l.action === "CREATE").length,
    updates: auditLogs.filter(l => l.action === "UPDATE").length,
    deletes: auditLogs.filter(l => l.action === "DELETE").length,
    today: auditLogs.filter(l => l.createdAt >= todayStart).length,
    uniqueUsers: new Set(auditLogs.filter(l => l.userId).map(l => l.userId)).size,
  };

  return (
    <AuditLogsView 
      auditLogs={auditLogs.map(l => ({ ...l, id: l.id.toString(), createdAt: l.createdAt.toISOString() }))}
      stats={stats}
    />
  );
}
