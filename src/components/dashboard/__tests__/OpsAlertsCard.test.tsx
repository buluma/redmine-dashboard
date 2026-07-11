import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { OpsAlertsCard } from "@/src/components/dashboard/OpsAlertsCard";
import type { Issue } from "@/src/types/dashboard";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${Object.values(vars).join(",")}` : key),
  }),
}));

function makeAtRisk(overrides: { issue?: Partial<Issue>; severity?: number; reason?: string } = {}) {
  return {
    issue: { id: "1", redmineIssueId: 1, localIssueNumber: null, subject: "Fix it", ...overrides.issue } as Issue,
    severity: overrides.severity ?? 3,
    reason: overrides.reason ?? "overdue",
  };
}

function renderCard(overrides: Partial<Parameters<typeof OpsAlertsCard>[0]> = {}) {
  const props = {
    atRisk: [],
    open: true,
    onToggleOpen: vi.fn(),
    onPrefetchIssue: vi.fn(),
    onOpenIssue: vi.fn(),
    manualRefreshBusy: false,
    onManualPull: vi.fn(),
    ...overrides,
  };
  render(<OpsAlertsCard {...props} />);
  return props;
}

describe("OpsAlertsCard", () => {
  it("shows the empty state with a refresh action when there is nothing at risk", () => {
    const props = renderCard({ atRisk: [] });
    expect(screen.getByText("No active risk alerts.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("hero.forceRefresh"));
    expect(props.onManualPull).toHaveBeenCalledTimes(1);
  });

  it("renders a row per at-risk issue with tone based on reason", () => {
    renderCard({ atRisk: [makeAtRisk({ reason: "overdue" }), makeAtRisk({ reason: "blocked" })] });
    const rows = screen.getAllByRole("button", { name: /Fix it/ });
    expect(rows[0]).toHaveClass("tone-critical");
    expect(rows[1]).toHaveClass("tone-warning");
  });

  it("calls onOpenIssue when a row is clicked", () => {
    const props = renderCard({ atRisk: [makeAtRisk()] });
    fireEvent.click(screen.getByRole("button", { name: /Fix it/ }));
    expect(props.onOpenIssue).toHaveBeenCalledTimes(1);
  });

  it("collapses to a summary line when open is false", () => {
    renderCard({ atRisk: [makeAtRisk()], open: false });
    expect(screen.queryByText(/Fix it/)).toBeNull();
    expect(screen.getByText(/opsAlerts.itemCount/)).toBeInTheDocument();
  });

  it("calls onToggleOpen when the expand/collapse button is clicked", () => {
    const props = renderCard({ open: true });
    fireEvent.click(screen.getByText("collapsible.collapse"));
    expect(props.onToggleOpen).toHaveBeenCalledTimes(1);
  });
});
