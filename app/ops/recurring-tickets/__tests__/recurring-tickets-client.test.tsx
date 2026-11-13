import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RecurringTicketsClient } from "../recurring-tickets-client";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    formatDate: (value: string) => value,
  }),
}));

type ClientProps = Parameters<typeof RecurringTicketsClient>[0];

const series: ClientProps["initialSeries"][number] = {
  id: "s1",
  key: "vodacom-sa",
  name: "Vodacom SA Support",
  isActive: true,
  redmineProjectId: 1,
  parentIssueId: 2,
  trackerId: 3,
  priorityId: 4,
  categoryId: null,
  assignedToId: null,
  subjectTemplate: "Week {{week}}",
  descriptionTemplate: null,
  estimatedHours: null,
  customFieldsJson: null,
  cadence: "weekly",
  createWeekday: 1,
  closeWeekday: 1,
  createDayOfMonth: 1,
  closeDayOfMonth: null,
  wakatimeProjectName: "Streamline-Vodacom-SA-Prod-Optimization",
  defaultActivityId: 9,
  defaultActivityName: "Development",
  expectsTime: true,
  instanceCount: 18,
};

function instance(overrides: Partial<ClientProps["initialInstances"][number]>): ClientProps["initialInstances"][number] {
  return {
    id: "i1",
    seriesKey: "vodacom-sa",
    seriesName: "Vodacom SA Support",
    periodKey: "2026-W45",
    subject: "Week 45 Vodacom SA Support",
    issueId: null,
    redmineIssueId: 100,
    status: "closed",
    closeAttempts: 1,
    lastError: null,
    finalHoursApplied: null,
    scheduledCreateDate: "2026-11-02",
    scheduledCloseDate: "2026-11-09",
    closedAt: null,
    createdAt: "2026-11-02",
    ...overrides,
  };
}

describe("RecurringTicketsClient", () => {
  it("rounds applied hours to two decimals instead of showing float noise", () => {
    render(
      <RecurringTicketsClient
        initialSeries={[series]}
        initialInstances={[
          instance({ id: "a", finalHoursApplied: 0.5800000000000001 }),
          instance({ id: "b", finalHoursApplied: 43.77 }),
          instance({ id: "c", finalHoursApplied: null }),
        ]}
      />,
    );

    expect(screen.getByText("0.58")).toBeTruthy();
    expect(screen.getByText("43.77")).toBeTruthy();
    expect(screen.queryByText("0.5800000000000001")).toBeNull();
  });

  // The shared .issues-table rule sizes column 4 for the dashboard's Subject
  // column; both tables here opt out via rt-table, and the series actions
  // sit in a single-row flex wrapper.
  it("scopes both tables with rt-table and keeps series actions in one row wrapper", () => {
    const { container } = render(
      <RecurringTicketsClient initialSeries={[series]} initialInstances={[instance({})]} />,
    );

    const tables = container.querySelectorAll("table");
    expect(tables).toHaveLength(2);
    tables.forEach((table) => expect(table.classList.contains("rt-table")).toBe(true));

    const actions = container.querySelector(".rt-row-actions");
    expect(actions?.querySelectorAll("button")).toHaveLength(2);
  });
});
