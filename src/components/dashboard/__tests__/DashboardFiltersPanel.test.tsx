import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";

import { DashboardFiltersPanel } from "@/src/components/dashboard/DashboardFiltersPanel";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/src/components/SavedViewsPanel", () => ({
  SavedViewsPanel: (props: { savedViews: unknown[]; onSave: (name: string) => void }) => (
    <div data-testid="saved-views-panel">
      saved-views:{props.savedViews.length}
      <button type="button" onClick={() => props.onSave("My View")}>save-view</button>
    </div>
  ),
}));

function renderPanel(overrides: Partial<Parameters<typeof DashboardFiltersPanel>[0]> = {}) {
  const props = {
    statusFilter: "",
    onStatusFilterChange: vi.fn(),
    statuses: [{ id: 1, name: "New", isClosed: false }, { id: 2, name: "Closed", isClosed: true }],
    priorityFilter: "",
    onPriorityFilterChange: vi.fn(),
    priorities: ["Low", "High"],
    sort: "updated_desc",
    onSortChange: vi.fn(),
    search: "",
    onSearchChange: vi.fn(),
    searchInputRef: createRef<HTMLInputElement>(),
    searchMode: "local" as const,
    onSearchModeChange: vi.fn(),
    onResetPage: vi.fn(),
    savedViews: [],
    activeViewId: null,
    onApplySavedView: vi.fn(),
    onDeleteSavedView: vi.fn(),
    onReorderSavedViews: vi.fn(),
    onSaveCurrentView: vi.fn(),
    viewDraftName: "",
    setViewDraftName: vi.fn(),
    aiSearchOpen: false,
    aiAvailable: true,
    onToggleAiSearch: vi.fn(),
    onOpenFtsSearch: vi.fn(),
    ...overrides,
  };
  render(<DashboardFiltersPanel {...props} />);
  return props;
}

describe("DashboardFiltersPanel", () => {
  it("changes status filter and resets the page", () => {
    const props = renderPanel();
    fireEvent.change(screen.getByLabelText("filters.status"), { target: { value: "Closed" } });
    expect(props.onStatusFilterChange).toHaveBeenCalledWith("Closed");
    expect(props.onResetPage).toHaveBeenCalledTimes(1);
  });

  it("changes priority filter and resets the page", () => {
    const props = renderPanel();
    fireEvent.change(screen.getByLabelText("filters.priority"), { target: { value: "High" } });
    expect(props.onPriorityFilterChange).toHaveBeenCalledWith("High");
    expect(props.onResetPage).toHaveBeenCalledTimes(1);
  });

  it("changes sort without resetting the page", () => {
    const props = renderPanel();
    fireEvent.change(screen.getByLabelText("filters.sort"), { target: { value: "priority" } });
    expect(props.onSortChange).toHaveBeenCalledWith("priority");
    expect(props.onResetPage).not.toHaveBeenCalled();
  });

  it("changes search text and resets the page", () => {
    const props = renderPanel();
    fireEvent.change(screen.getByPlaceholderText("filters.searchPlaceholder"), { target: { value: "bug" } });
    expect(props.onSearchChange).toHaveBeenCalledWith("bug");
    expect(props.onResetPage).toHaveBeenCalledTimes(1);
  });

  it("changes search mode without resetting the page", () => {
    const props = renderPanel();
    fireEvent.change(screen.getByLabelText(/filters.searchSource/), { target: { value: "fts" } });
    expect(props.onSearchModeChange).toHaveBeenCalledWith("fts");
    expect(props.onResetPage).not.toHaveBeenCalled();
  });

  it("disables the AI toggle when AI is unavailable", () => {
    renderPanel({ aiAvailable: false });
    expect(screen.getByRole("button", { name: /askAI/ })).toBeDisabled();
  });

  it("toggles AI search when the AI button is clicked", () => {
    const props = renderPanel({ aiAvailable: true });
    fireEvent.click(screen.getByRole("button", { name: /askAI/ }));
    expect(props.onToggleAiSearch).toHaveBeenCalledTimes(1);
  });

  it("opens FTS search when the FTS button is clicked", () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /sourceFts/ }));
    expect(props.onOpenFtsSearch).toHaveBeenCalledTimes(1);
  });

  it("passes savedViews through to SavedViewsPanel and wires onSave to set the draft name then save", () => {
    const props = renderPanel({ savedViews: [{ id: "1", name: "A" }] as unknown as Parameters<typeof DashboardFiltersPanel>[0]["savedViews"] });
    expect(screen.getByTestId("saved-views-panel")).toHaveTextContent("saved-views:1");
    fireEvent.click(screen.getByText("save-view"));
    expect(props.setViewDraftName).toHaveBeenCalledWith("My View");
    expect(props.onSaveCurrentView).toHaveBeenCalledTimes(1);
  });
});
