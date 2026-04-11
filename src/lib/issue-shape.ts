import { Prisma } from "@prisma/client";

type JsonValue = Prisma.JsonValue;

export type AllowedStatusView = { id: number; name: string; isClosed?: boolean };
export type IssueChildView = {
  id: number;
  subject: string;
  statusId?: number | null;
  statusName?: string | null;
  priority?: string | null;
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
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const id = typeof item.id === "number" ? item.id : null;
      const subject = typeof item.subject === "string" ? item.subject : null;
      if (!id || !subject) return null;

      // Status can be nested object {id, name} or missing
      const status = item.status as Record<string, unknown> | undefined;
      const statusId = typeof status?.id === "number" ? status.id : null;
      const statusName = typeof status?.name === "string" ? status.name : null;

      // Priority can be string or nested object {name}
      const priorityVal = item.priority;
      const priority = typeof priorityVal === "string" ? priorityVal
        : (priorityVal && typeof priorityVal === "object" ? (priorityVal as Record<string, unknown>).name : null);

      return {
        id,
        subject,
        statusId,
        statusName,
        priority: typeof priority === "string" ? priority : null,
      };
    })
    .filter((x): x is IssueChildView => Boolean(x));
}

export function toIssueView<T extends { allowedStatusesJson: JsonValue | null; childrenJson: JsonValue | null }>(issue: T) {
  const { allowedStatusesJson, childrenJson, ...rest } = issue;
  return {
    ...rest,
    allowedStatuses: parseAllowedStatuses(allowedStatusesJson),
    children: parseChildren(childrenJson),
  };
}
