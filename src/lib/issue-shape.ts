import { Prisma } from "@prisma/client";

type JsonValue = Prisma.JsonValue;

export type AllowedStatusView = { id: number; name: string; isClosed?: boolean };
export type IssueChildView = {
  id: number;
  subject: string;
  tracker?: string | null;
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

export function toIssueView<T extends { allowedStatusesJson: JsonValue | null; childrenJson: JsonValue | null }>(issue: T) {
  const { allowedStatusesJson, childrenJson, ...rest } = issue;
  return {
    ...rest,
    allowedStatuses: parseAllowedStatuses(allowedStatusesJson),
    children: parseChildren(childrenJson),
  };
}
