import { prisma } from "@/src/lib/db";

type ActivityEventInput = {
  issueId: string;
  eventType:
    | "issue_update"
    | "journal"
    | "time_entry"
    | "attachment"
    | "relation"
    | "internal_note"
    | "github_link";
  source: "redmine" | "local";
  sourceRemoteId?: string | null;
  eventAt: Date;
  summary?: string | null;
};

const EVENT_SUMMARY_MAX = 260;

function sanitizeSummary(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  return compact.length <= EVENT_SUMMARY_MAX ? compact : `${compact.slice(0, EVENT_SUMMARY_MAX).trimEnd()}...`;
}

function dedupeKey(input: ActivityEventInput): string {
  const remotePart = input.sourceRemoteId ? input.sourceRemoteId : "none";
  return `${input.issueId}:${input.eventType}:${remotePart}:${input.eventAt.toISOString()}`;
}

function asValidDate(value: unknown): Date | null {
  if (!(value instanceof Date)) return null;
  if (Number.isNaN(value.getTime())) return null;
  return value;
}

export async function recordIssueActivityEvent(input: ActivityEventInput): Promise<void> {
  const eventAt = asValidDate(input.eventAt);
  if (!eventAt) return;

  const key = dedupeKey(input);
  await prisma.issueActivityEvent.upsert({
    where: { dedupeKey: key },
    update: {
      summary: sanitizeSummary(input.summary),
    },
    create: {
      issueId: input.issueId,
      eventType: input.eventType,
      source: input.source,
      sourceRemoteId: input.sourceRemoteId ?? null,
      eventAt,
      summary: sanitizeSummary(input.summary),
      dedupeKey: key,
    },
  });
}

export async function recomputeIssueActivityIndex(issueId: string): Promise<void> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      updatedOnRemote: true,
    },
  });

  if (!issue) {
    return;
  }

  const latestEvent = await prisma.issueActivityEvent.findFirst({
    where: { issueId },
    orderBy: [{ eventAt: "desc" }, { createdAt: "desc" }],
    select: {
      eventAt: true,
      eventType: true,
    },
  });

  const fallbackAt = issue.updatedOnRemote;
  const fallbackType = "issue_update";

  const lastActivityAt = latestEvent?.eventAt ?? fallbackAt;
  const lastActivityType = latestEvent?.eventType ?? fallbackType;

  await prisma.issue.update({
    where: { id: issueId },
    data: {
      lastActivityAt,
      lastActivityType,
    },
  });
}

export function issueActivityTimestamp(issue: {
  lastActivityAt?: string | Date | null;
  updatedOnRemote: string | Date;
}): Date {
  const activity = issue.lastActivityAt ? new Date(issue.lastActivityAt) : null;
  if (activity && !Number.isNaN(activity.getTime())) {
    return activity;
  }
  const fallback = new Date(issue.updatedOnRemote);
  return Number.isNaN(fallback.getTime()) ? new Date(0) : fallback;
}
