// Raw Redmine JSON → typed value helpers shared across the sync pipeline.
// No I/O, no Prisma — pure parsing so every other sync module can lean on
// the same tolerant-of-missing-fields conventions.

export function asObject(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export function nestedName(value: unknown): string | null {
  return asString(asObject(value).name);
}

export function nestedId(value: unknown): number | null {
  return asNumber(asObject(value).id);
}

export function parentIssueLabel(value: unknown): string | null {
  const obj = asObject(value);
  const subject = asString(obj.subject);
  const id = asNumber(obj.id);
  if (subject) {
    return subject;
  }
  if (id) {
    return `#${id}`;
  }
  return null;
}

export function asDate(value: unknown): Date | null {
  const s = asString(value);
  if (!s) {
    return null;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// See the cachedUpdatedOnByRemoteId comment in executeSyncJob for why this
// exists: redmineDate()'s day-granularity `updated_on` filter re-lists every
// issue touched today on every incremental tick, not just ones that changed
// since the last poll. This lets the sync loop skip an issue whose
// updated_on genuinely hasn't moved since it was last cached.
export function isUnchangedSinceLastSync(remoteUpdatedOn: Date | null, cachedUpdatedOn: Date | null | undefined): boolean {
  if (!remoteUpdatedOn || !cachedUpdatedOn) {
    return false;
  }
  return remoteUpdatedOn.getTime() === cachedUpdatedOn.getTime();
}

export function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export type AllowedStatus = { id: number; name: string; isClosed?: boolean };

export function parseAllowedStatuses(issueRaw: Record<string, unknown>): AllowedStatus[] {
  const statuses = asObject(issueRaw).allowed_statuses;
  if (!Array.isArray(statuses)) {
    return [];
  }

  return statuses
    .map((row) => {
      const item = asObject(row);
      const id = asNumber(item.id);
      const name = asString(item.name);
      if (!id || !name) return null;
      return {
        id,
        name,
        ...(asBoolean(item.is_closed) !== null ? { isClosed: asBoolean(item.is_closed) ?? undefined } : {}),
      };
    })
    .filter((x): x is AllowedStatus => Boolean(x));
}

export type IssueChild = {
  id: number;
  subject: string;
  tracker?: string;
  statusName?: string;
  assignedToName?: string;
};

export function parseChildren(issueRaw: Record<string, unknown>): IssueChild[] {
  const children = asObject(issueRaw).children;
  if (!Array.isArray(children)) {
    return [];
  }

  const result: IssueChild[] = [];
  for (const row of children) {
    const item = asObject(row);
    const id = asNumber(item.id);
    const subject = asString(item.subject);
    if (!id || !subject) continue;

    const trackerObj = item.tracker as Record<string, unknown> | undefined;
    const tracker = (trackerObj ? asString(trackerObj.name) : null) ?? undefined;
    const statusName = nestedName(item.status) ?? undefined;
    const assignedToName = nestedName(item.assigned_to) ?? undefined;

    result.push({ id, subject, tracker, statusName, assignedToName });
  }
  return result;
}
