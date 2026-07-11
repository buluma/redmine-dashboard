import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ActivityFeedCard } from "@/src/components/dashboard/ActivityFeedCard";
import type { ActivityEvent } from "@/src/types/dashboard";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${Object.values(vars).join(",")}` : key),
  }),
}));

const event = (overrides: Partial<ActivityEvent> = {}): ActivityEvent => ({
  issueId: "1",
  issueLabel: "#1",
  issueSubject: "Fix it",
  timestamp: "2026-01-01T00:00:00Z",
  detail: "Latest activity: issue update",
  ...overrides,
});

function renderCard(overrides: Partial<Parameters<typeof ActivityFeedCard>[0]> = {}) {
  const props = {
    recentActivity: [],
    open: true,
    onToggleOpen: vi.fn(),
    onPrefetchIssue: vi.fn(),
    onOpenIssue: vi.fn(),
    ...overrides,
  };
  const view = render(<ActivityFeedCard {...props} />);
  return { props, rows: () => view.container.querySelectorAll<HTMLButtonElement>(".activity-row") };
}

describe("ActivityFeedCard", () => {
  it("renders a row per activity event", () => {
    renderCard({ recentActivity: [event({ issueSubject: "Fix it" }), event({ issueSubject: "Ship it" })] });
    expect(screen.getByText(/Fix it/)).toBeInTheDocument();
    expect(screen.getByText(/Ship it/)).toBeInTheDocument();
  });

  it("tones a logged-time entry distinctly from a comment or update", () => {
    const { rows } = renderCard({
      recentActivity: [
        event({ issueId: "1", detail: "2.0h logged" }),
        event({ issueId: "2", detail: "Alice commented" }),
        event({ issueId: "3", detail: "Latest activity: issue update" }),
      ],
    });
    const [r0, r1, r2] = rows();
    expect(r0).toHaveClass("tone-time");
    expect(r1).toHaveClass("tone-comment");
    expect(r2).toHaveClass("tone-update");
  });

  it("calls onOpenIssue with the event's issueId when a row is clicked", () => {
    const { props, rows } = renderCard({ recentActivity: [event({ issueId: "42" })] });
    fireEvent.click(rows()[0]);
    expect(props.onOpenIssue).toHaveBeenCalledWith("42");
  });

  it("collapses to a summary line when open is false", () => {
    renderCard({ recentActivity: [event()], open: false });
    expect(screen.queryByText(/Fix it/)).toBeNull();
    expect(screen.getByText(/activityFeed.hiddenFeed/)).toBeInTheDocument();
  });
});
