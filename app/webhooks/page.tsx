import { redirect } from "next/navigation";
import { getSessionUserId } from "@/src/lib/session";
import { requirePermission } from "@/src/lib/rbac";
import { listSubscriptions } from "@/src/lib/webhook-subscription";
import { WebhooksClient } from "./webhooks-client";
import { WebhooksHeader, WebhooksAccessDenied } from "./webhooks-header";
import { WebhooksInfo } from "./webhooks-info";

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
    return <WebhooksAccessDenied />;
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
    lastDelivery: (() => {
      const lastSub = subscriptions.find(s => s.lastTriggeredAt);
      if (!lastSub?.lastTriggeredAt) return "Never";
      const date = lastSub.lastTriggeredAt instanceof Date
        ? lastSub.lastTriggeredAt
        : new Date(lastSub.lastTriggeredAt);
      return formatDateTime(date);
    })()
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
      <WebhooksHeader />
      <WebhooksInfo stats={stats} eventCounts={eventCounts} />
      <WebhooksClient subscriptions={JSON.parse(JSON.stringify(subscriptions))} />
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
