const DAY_MS = 24 * 60 * 60 * 1000;

export function parseReportDateOnly(value: string | null): Date | null {
  if (!value || value.trim().length === 0) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function startOfReportDay(date: Date): Date {
  const out = new Date(date);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function endOfReportDay(date: Date): Date {
  const out = new Date(date);
  out.setHours(23, 59, 59, 999);
  return out;
}

/** Keep date precedence and day-window calculation shared by the API and its UI summary. */
export function getEffectiveReportDateWindow(
  days: number,
  fromDate: Date | null,
  toDate: Date | null,
  now = new Date(),
): { start: Date; end: Date } {
  if (fromDate && toDate) {
    return { start: startOfReportDay(fromDate), end: endOfReportDay(toDate) };
  }
  if (fromDate) {
    return { start: startOfReportDay(fromDate), end: endOfReportDay(now) };
  }

  const end = endOfReportDay(toDate ?? now);
  const start = startOfReportDay(new Date(end.getTime() - (days - 1) * DAY_MS));
  return { start, end };
}

export function formatReportDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
