import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { getSessionUserId } from "@/src/lib/session";
import { requirePermission } from "@/src/lib/rbac";

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
    return (
      <main className="dashboard">
        <section className="card">
          <h1>Access Denied</h1>
          <p className="muted">You don't have permission to view audit logs.</p>
          <a href="/" className="secondary-button">Back to Dashboard</a>
        </section>
      </main>
    );
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
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">Operations</p>
            <h1>Audit Logs</h1>
            <p className="muted">
              Compliance and security audit trail
            </p>
          </div>
          <div className="hero-actions">
            <a href="/ops" className="secondary-button">
              ← Back to Ops
            </a>
          </div>
        </div>
      </header>

      {/* Stats Grid */}
      <section className="ops-grid">
        <article className="card">
          <h2>Activity (24h)</h2>
          <div className="ops-kv">
            <p><strong>Today:</strong> {stats.today} events</p>
            <p><strong>Creates:</strong> {stats.creates}</p>
            <p><strong>Updates:</strong> {stats.updates}</p>
            <p><strong>Deletes:</strong> {stats.deletes}</p>
          </div>
        </article>

        <article className="card">
          <h2>Overview</h2>
          <div className="ops-kv">
            <p><strong>Showing:</strong> {auditLogs.length} events</p>
            <p><strong>Unique Users:</strong> {stats.uniqueUsers}</p>
          </div>
        </article>
      </section>

      {/* Audit Logs Table */}
      <section className="card">
        <div className="table-toolbar">
          <h2>Recent Audit Events</h2>
        </div>
        <div className="drill-table-wrap">
          <table className="issues-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>ID</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">No audit logs yet.</td>
                </tr>
              )}
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td>{log.userEmail ?? log.userId ?? "-"}</td>
                  <td>
                    <span className={`status-chip ${getActionClass(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td>{log.entityType}</td>
                  <td className="muted">{log.entityId ?? "-"}</td>
                  <td className="muted">{log.ipAddress ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Log Details (expandable) */}
      {auditLogs.some(l => l.changes || l.metadata) && (
        <section className="card">
          <h2>Log Details</h2>
          <div className="drill-table-wrap">
            <table className="issues-table">
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Changes</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.filter(l => l.changes || l.metadata).map((log) => (
                  <tr key={`detail-${log.id}`}>
                    <td>{log.entityType} #{log.entityId}</td>
                    <td>
                      {log.changes ? (
                        <pre className="code-block">
                          {JSON.stringify(log.changes, null, 2).slice(0, 200)}
                        </pre>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td>
                      {log.metadata ? (
                        <pre className="code-block">
                          {JSON.stringify(log.metadata, null, 2).slice(0, 100)}
                        </pre>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActionClass(action: string): string {
  switch (action) {
    case "CREATE": return "sync-success";
    case "UPDATE": return "status-chip"; // Blue-ish
    case "DELETE": return "sync-failed";
    default: return "";
  }
}