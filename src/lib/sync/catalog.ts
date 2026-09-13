// Redmine's global status/activity/priority enumerations, cached locally so
// UI dropdowns and validation don't need a live Redmine round trip.

import { prisma } from "@/src/lib/db";
import { RedmineClient } from "@/src/lib/redmine";

export async function syncStatusCatalog(client: RedmineClient): Promise<void> {
  const statuses = await client.getIssueStatuses();
  for (const status of statuses) {
    await prisma.statusCatalog.upsert({
      where: { id: status.id },
      update: {
        name: status.name,
        isClosed: Boolean(status.is_closed),
      },
      create: {
        id: status.id,
        name: status.name,
        isClosed: Boolean(status.is_closed),
      },
    });
  }
}

export async function syncEnumerationCatalog(client: RedmineClient): Promise<void> {
  const [activities, priorities] = await Promise.all([
    client.getTimeEntryActivities(),
    client.getIssuePriorities(),
  ]);

  for (const activity of activities) {
    await prisma.enumerationCatalog.upsert({
      where: { key: `time_entry_activity:${activity.id}` },
      update: {
        remoteId: activity.id,
        kind: "time_entry_activity",
        name: activity.name,
        isDefault: false,
        isActive: true,
        position: null,
      },
      create: {
        key: `time_entry_activity:${activity.id}`,
        remoteId: activity.id,
        kind: "time_entry_activity",
        name: activity.name,
        isDefault: false,
        isActive: true,
        position: null,
      },
    });
  }

  for (const priority of priorities) {
    await prisma.enumerationCatalog.upsert({
      where: { key: `issue_priority:${priority.id}` },
      update: {
        remoteId: priority.id,
        kind: "issue_priority",
        name: priority.name,
        isDefault: Boolean(priority.is_default),
        isActive: priority.active ?? true,
        position: priority.position ?? null,
      },
      create: {
        key: `issue_priority:${priority.id}`,
        remoteId: priority.id,
        kind: "issue_priority",
        name: priority.name,
        isDefault: Boolean(priority.is_default),
        isActive: priority.active ?? true,
        position: priority.position ?? null,
      },
    });
  }
}
