import { redirect } from "next/navigation";
import { getSessionUserId } from "@/src/lib/session";
import { requireRole } from "@/src/lib/rbac";
import { listSeries, listRecentInstances } from "@/src/lib/recurring-ticket-series";
import { RecurringTicketsAccessDenied } from "./access-denied";
import { RecurringTicketsClient } from "./recurring-tickets-client";

export const runtime = "nodejs";

export default async function RecurringTicketsPage() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/");
  }

  try {
    await requireRole("ADMIN");
  } catch {
    return <RecurringTicketsAccessDenied />;
  }

  const [series, instances] = await Promise.all([
    listSeries(userId),
    listRecentInstances(userId),
  ]);

  return (
    <RecurringTicketsClient
      initialSeries={JSON.parse(JSON.stringify(series))}
      initialInstances={JSON.parse(JSON.stringify(instances))}
    />
  );
}
