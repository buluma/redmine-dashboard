import { Prisma } from "@prisma/client";

type JsonValue = Prisma.JsonValue;

export type AllowedStatusView = { id: number; name: string; isClosed?: boolean };
export type IssueChildView = {
  id: number;
  subject: string;
  tracker?: string | null;
};

export type IssueViewBase = {
  id: string;
  redmineIssueId: number | null;
  redmineBaseUrl: string | null;
  source: string;
  localIssueNumber: number | null;
  userId: string;
  subject: string;
  description: string | null;
  projectName: string | null;
  tracker: string | null;
  priority: string | null;
  priorityId: number | null;
  statusId: number;
  statusName: string;
  parentIssueId: number | null;
  parentIssueLabel: string | null;
  assignedToId: number | null;
  assignedToName: string | null;
  authorId: number | null;
  authorName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  startDate: Date | null;
  estimatedHours: number | null;
  spentHours: number | null;
  customFieldsJson: JsonValue | null;
  updatedOnRemote: Date;
  dueDate: Date | null;
  doneRatio: number | null;
  allowedStatusesJson: JsonValue | null;
  childrenJson: JsonValue | null;
  lastActivityAt: Date | null;
  lastActivityType: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function parseAllowedStatuses(value: JsonValue | null): AllowedStatusView[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const id = typeof item.id === "number" ? item.id : null;
      const name = typeof item.name === "string" ? item.name : null;
      if (!id || !name) return null;
      const out: AllowedStatusView = { id, name };
      if (typeof item.isClosed === "boolean") {
        out.isClosed = item.isClosed;
      }
      return out;
    })
    .filter((x): x is AllowedStatusView => Boolean(x));
}

function parseChildren(value: JsonValue | null): IssueChildView[] {
  if (!Array.isArray(value)) return [];
  const items = value as Array<Record<string, unknown> | null | undefined>;
  const result: IssueChildView[] = [];
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const id = typeof item.id === "number" ? item.id : null;
    const subject = typeof item.subject === "string" ? item.subject : null;
    if (!id || !subject) continue;

    const tracker = item.tracker as Record<string, unknown> | undefined;
    const trackerName = typeof tracker?.name === "string" ? tracker.name : null;

    result.push({ id, subject, tracker: trackerName });
  }
  return result;
}

function mapJournals(journals: Array<{ detailsJson?: JsonValue | null; [key: string]: unknown }>) {
  return journals.map(({ detailsJson, ...rest }) => ({
    ...rest,
    details: Array.isArray(detailsJson) ? detailsJson : [],
  }));
}

export function toIssueView<T extends { allowedStatusesJson: JsonValue | null; childrenJson: JsonValue | null; journals?: Array<{ detailsJson?: JsonValue | null; [key: string]: unknown }> }>(issue: T) {
  const { allowedStatusesJson, childrenJson, journals, ...rest } = issue;
  return {
    ...rest,
    ...(journals ? { journals: mapJournals(journals) } : {}),
    allowedStatuses: parseAllowedStatuses(allowedStatusesJson),
    children: parseChildren(childrenJson),
  };
}
