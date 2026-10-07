import { describe, expect, it } from "vitest";
import {
  formatReportDateOnly,
  getEffectiveReportDateWindow,
  parseReportDateOnly,
} from "@/src/lib/report-date-window";

function rangeLabel(start: Date, end: Date): string {
  return `${formatReportDateOnly(start)} – ${formatReportDateOnly(end)}`;
}

describe("effective reports date window", () => {
  it("uses the explicit range and ignores the selected day count", () => {
    const { start, end } = getEffectiveReportDateWindow(
      90,
      parseReportDateOnly("2026-02-02"),
      parseReportDateOnly("2026-02-08"),
      new Date(2026, 1, 20, 12),
    );

    expect(rangeLabel(start, end)).toBe("2026-02-02 – 2026-02-08");
  });

  it("uses today as the end when only a start date is supplied", () => {
    const { start, end } = getEffectiveReportDateWindow(
      30,
      parseReportDateOnly("2026-02-02"),
      null,
      new Date(2026, 1, 8, 12),
    );

    expect(rangeLabel(start, end)).toBe("2026-02-02 – 2026-02-08");
  });

  it("derives the start from the selected day count when only an end date is supplied", () => {
    const { start, end } = getEffectiveReportDateWindow(
      7,
      null,
      parseReportDateOnly("2026-02-08"),
      new Date(2026, 1, 20, 12),
    );

    expect(rangeLabel(start, end)).toBe("2026-02-02 – 2026-02-08");
  });

  it("uses the rolling day count when no explicit dates are supplied", () => {
    const { start, end } = getEffectiveReportDateWindow(
      7,
      null,
      null,
      new Date(2026, 1, 8, 12),
    );

    expect(rangeLabel(start, end)).toBe("2026-02-02 – 2026-02-08");
  });
});
