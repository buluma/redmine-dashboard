import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/src/lib/session";
import { requireRole } from "@/src/lib/rbac";
import { prisma } from "@/src/lib/db";

export const runtime = "nodejs";

export default async function WebhookDeliveriesPage() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/");
  }

  // Check role
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !["ADMIN", "EDITOR"].includes(user.role)) {
    redirect("/");
  }

  // Fetch deliveries with subscription info
  const deliveries = await prisma.webhookDelivery.findMany({
    include: {
      subscription: {
        select: { name: true, url: true, active: true },
      },
    },
    orderBy: { deliveredAt: "desc" },
    take: 50,
  });

  // Fetch subscriptions for filter
  const subscriptions = await prisma.webhookSubscription.findMany({
    select: { id: true, name: true, active: true },
    orderBy: { name: "asc" },
  });

  // Calculate stats
  const totalDeliveries = deliveries.length;
  const successful = deliveries.filter(d => d.responseStatus && d.responseStatus >= 200 && d.responseStatus < 300).length;
  const failed = deliveries.filter(d => !d.responseStatus || d.responseStatus >= 400).length;
  const avgDuration = deliveries.reduce((sum, d) => sum + (d.durationMs || 0), 0) / totalDeliveries;

  return (
    <main className="dashboard reports-v2">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">Webhooks</p>
            <h1>Delivery Logs</h1>
            <p className="muted">Monitor webhook delivery history and troubleshoot failed deliveries.</p>
          </div>
          <div className="hero-actions">
            <Link href="/webhooks" className="secondary-button">
              ← Subscriptions
            </Link>
          </div>
        </div>
      </header>

      {/* Stats Grid */}
      <section className="metrics-grid">
        <article className="card metric-card">
          <p className="metric-label">Total Deliveries</p>
          <p className="metric-value">{totalDeliveries}</p>
        </article>
        <article className="card metric-card metric-primary">
          <p className="metric-label">Successful</p>
          <p className="metric-value">{successful}</p>
        </article>
        <article className="card metric-card" style={{ background: failed > 0 ? "var(--danger-soft)" : undefined }}>
          <p className="metric-label">Failed</p>
          <p className="metric-value">{failed}</p>
        </article>
        <article className="card metric-card">
          <p className="metric-label">Avg Duration</p>
          <p className="metric-value">{Math.round(avgDuration)}ms</p>
        </article>
      </section>

      {/* Deliveries Table */}
      <section className="card">
        <h2>Recent Deliveries</h2>
        <table className="issue-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Subscription</th>
              <th>Event</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">No deliveries yet</td>
              </tr>
            ) : (
              deliveries.map((d) => {
                const statusOk = d.responseStatus && d.responseStatus >= 200 && d.responseStatus < 300;
                return (
                  <tr key={d.id}>
                    <td className="issue-updated">
                      {new Date(d.deliveredAt).toLocaleString()}
                    </td>
                    <td>
                      {d.subscription?.name || "Unknown"}
                      <br />
                      <span className="muted" style={{ fontSize: "0.75rem" }}>
                        {d.subscription?.url}
                      </span>
                    </td>
                    <td>
                      <span className="status-chip">{d.event}</span>
                    </td>
                    <td>
                      {d.responseStatus ? (
                        <span className={`status-chip ${statusOk ? "open" : "closed"}`}>
                          {d.responseStatus}
                        </span>
                      ) : (
                        <span className="status-chip closed">Pending</span>
                      )}
                    </td>
                    <td>{d.durationMs ? `${d.durationMs}ms` : "—"}</td>
                    <td className="issue-subject" style={{ maxWidth: "200px" }}>
                      {d.error || d.responseBody?.slice(0, 50) || "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      <style>{`
        .muted {
          color: var(--text-soft);
          font-size: 0.8rem;
        }
        .empty-state {
          text-align: center;
          padding: 2rem;
          color: var(--text-soft);
        }
      `}</style>
    </main>
  );
}