import { redirect } from "next/navigation";
import { getSessionUserId } from "@/src/lib/session";
import { requirePermission } from "@/src/lib/rbac";
import { listSubscriptions } from "@/src/lib/webhook-subscription";
import { WebhooksClient } from "./webhooks-client";

export const runtime = "nodejs";

export default async function WebhooksPage() {
  // Graceful auth: redirect to login if no session
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/");
  }

  // Check permission - require admin or editor
  try {
    await requirePermission("users:manage");
  } catch {
    return (
      <main className="dashboard">
        <section className="card">
          <h1>Access Denied</h1>
          <p className="muted">You don't have permission to manage webhooks.</p>
          <a href="/" className="secondary-button">Back to Dashboard</a>
        </section>
      </main>
    );
  }

  const subscriptions = await listSubscriptions();

  // Calculate stats
  const stats = {
    total: subscriptions.length,
    active: subscriptions.filter(s => s.active).length,
    inactive: subscriptions.filter(s => !s.active).length,
    withSecret: subscriptions.filter(s => s.secret).length,
    totalDeliveries: subscriptions.reduce((sum, s) => sum + (s.lastTriggeredAt ? 1 : 0), 0),
    failures: subscriptions.reduce((sum, s) => sum + s.failureCount, 0),
  };

  // Event type breakdown
  const eventCounts = subscriptions.reduce((acc, sub) => {
    sub.events.forEach(event => {
      acc[event] = (acc[event] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">Integrations</p>
            <h1>Webhook Subscriptions</h1>
            <p className="muted">
              Manage external endpoints that receive ticket events
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
          <h2>Subscriptions</h2>
          <div className="ops-kv">
            <p><strong>Total:</strong> {stats.total}</p>
            <p><strong>Active:</strong> {stats.active}</p>
            <p><strong>Inactive:</strong> {stats.inactive}</p>
            <p><strong>With Secret:</strong> {stats.withSecret}</p>
          </div>
        </article>

        <article className="card">
          <h2>Delivery Status</h2>
          <div className="ops-kv">
            <p><strong>Failures:</strong> {stats.failures > 0 ? <span className="sync-failed">{stats.failures}</span> : stats.failures}</p>
            <p><strong>Last Delivery:</strong> {
              (() => {
                const lastSub = subscriptions.find(s => s.lastTriggeredAt);
                if (!lastSub?.lastTriggeredAt) return "Never";
                const date = lastSub.lastTriggeredAt instanceof Date 
                  ? lastSub.lastTriggeredAt 
                  : new Date(lastSub.lastTriggeredAt);
                return formatDateTime(date);
              })()
            }</p>
          </div>
        </article>

        <article className="card">
          <h2>Event Types</h2>
          <div className="ops-kv">
            {Object.entries(eventCounts).map(([event, count]) => (
              <p key={event}><strong>{event}:</strong> {count}</p>
            ))}
            {Object.keys(eventCounts).length === 0 && (
              <p className="muted">No subscriptions yet</p>
            )}
          </div>
        </article>
      </section>

      {/* Webhooks Client (interactive part) */}
      <WebhooksClient subscriptions={JSON.parse(JSON.stringify(subscriptions))} />

      {/* Available Event Types Reference */}
      <section className="card">
        <h2>Available Event Types</h2>
        <div className="drill-table-wrap">
          <table className="issues-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>ticket.created</code></td>
                <td>New ticket created</td>
              </tr>
              <tr>
                <td><code>ticket.updated</code></td>
                <td>Ticket details changed</td>
              </tr>
              <tr>
                <td><code>ticket.status_changed</code></td>
                <td>Ticket status changed</td>
              </tr>
              <tr>
                <td><code>ticket.assigned</code></td>
                <td>Ticket assigned to user</td>
              </tr>
              <tr>
                <td><code>ticket.completed</code></td>
                <td>Ticket marked as completed</td>
              </tr>
              <tr>
                <td><code>ticket.deleted</code></td>
                <td>Ticket deleted (future)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}