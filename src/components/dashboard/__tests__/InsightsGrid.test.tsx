import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { InsightsGrid } from "@/src/components/dashboard/InsightsGrid";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

function renderGrid(overrides: Partial<Parameters<typeof InsightsGrid>[0]> = {}) {
  const props = {
    topStatuses: [["New", 3], ["In Progress", 2]] as [string, number][],
    priorityMix: [["High", 4], ["Low", 1]] as [string, number][],
    totalVisible: 5,
    statusFilter: "",
    onStatusFilterChange: vi.fn(),
    ...overrides,
  };
  render(<InsightsGrid {...props} />);
  return props;
}

describe("InsightsGrid", () => {
  it("renders a chip per status with its count", () => {
    renderGrid();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("shows the empty state when there are no statuses", () => {
    renderGrid({ topStatuses: [] });
    expect(screen.getByText("No status data yet.")).toBeInTheDocument();
  });

  it("marks the active status chip", () => {
    renderGrid({ statusFilter: "New" });
    expect(screen.getByRole("button", { name: /New/ })).toHaveClass("active");
  });

  it("toggles the status filter off when clicking the active chip", () => {
    const props = renderGrid({ statusFilter: "New" });
    fireEvent.click(screen.getByRole("button", { name: /New/ }));
    expect(props.onStatusFilterChange).toHaveBeenCalledWith("");
  });

  it("sets the status filter when clicking an inactive chip", () => {
    const props = renderGrid({ statusFilter: "" });
    fireEvent.click(screen.getByRole("button", { name: /New/ }));
    expect(props.onStatusFilterChange).toHaveBeenCalledWith("New");
  });

  it("renders priority bars sized relative to totalVisible", () => {
    renderGrid({ priorityMix: [["High", 4]], totalVisible: 8 });
    const track = document.querySelector(".bar-fill.priority") as HTMLElement;
    expect(track.style.width).toBe("50%");
  });

  it("shows the empty state when there is no priority data", () => {
    renderGrid({ priorityMix: [] });
    expect(screen.getByText("No priority data yet.")).toBeInTheDocument();
  });
});
