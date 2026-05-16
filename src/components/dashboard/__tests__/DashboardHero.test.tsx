import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { DashboardHero, type DashboardHeroStats } from "@/src/components/dashboard/DashboardHero";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string | number> | string, fallback?: string) => {
      if (typeof vars === "string") return vars;
      return fallback ?? key;
    },
  }),
}));

const baseStats: DashboardHeroStats = {
  totalVisible: 12,
  total: 30,
  dueToday: 1,
  avgOpenAgeDays: 2,
  open: 5,
  inProgress: 3,
  overdue: 2,
  dueSoon: 4,
  completion: 40,
  done: 7,
  avgDoneRatio: 50,
  blocked: 1,
  stale: 2,
};

function renderHero(overrides: Partial<Parameters<typeof DashboardHero>[0]> = {}) {
  const props = {
    stats: baseStats,
    aiSummaryCount: 9,
    loading: false,
    manualRefreshBusy: false,
    showAllMetrics: false,
    onManualPull: vi.fn(),
    onResetFilters: vi.fn(),
    onOpenShortcuts: vi.fn(),
    onToggleAllMetrics: vi.fn(),
    aiStatusIndicator: <div data-testid="ai-status">ai</div>,
    ...overrides,
  };
  render(<DashboardHero {...props} />);
  return props;
}

describe("DashboardHero", () => {
  it("renders only 3 primary metric cards in compact mode", () => {
    renderHero({ showAllMetrics: false });
    expect(screen.queryByText("metrics.deliveryHealthLabel")).toBeNull();
    expect(screen.queryByText("metrics.blockedLabel")).toBeNull();
    expect(screen.queryByText("metrics.staleQueueLabel")).toBeNull();
    expect(screen.queryByText("metrics.aiInsightsLabel")).toBeNull();
  });

  it("renders all metric cards when showAllMetrics is true", () => {
    renderHero({ showAllMetrics: true });
    expect(screen.getByText("metrics.deliveryHealthLabel")).toBeInTheDocument();
    expect(screen.getByText("metrics.blockedLabel")).toBeInTheDocument();
    expect(screen.getByText("metrics.staleQueueLabel")).toBeInTheDocument();
    expect(screen.getByText("metrics.aiInsightsLabel")).toBeInTheDocument();
  });

  it("invokes callbacks when action buttons are clicked", () => {
    const props = renderHero();

    fireEvent.click(screen.getByRole("button", { name: "hero.forceRefresh" }));
    expect(props.onManualPull).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "hero.resetFilters" }));
    expect(props.onResetFilters).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "hero.shortcutsBtn" }));
    expect(props.onOpenShortcuts).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "All metrics" }));
    expect(props.onToggleAllMetrics).toHaveBeenCalled();
  });

  it("shows refreshing label and disables button when manualRefreshBusy", () => {
    renderHero({ manualRefreshBusy: true });
    const btn = screen.getByRole("button", { name: "hero.refreshing" });
    expect(btn).toBeDisabled();
  });

  it("renders the AI status slot", () => {
    renderHero();
    expect(screen.getByTestId("ai-status")).toBeInTheDocument();
  });
});
