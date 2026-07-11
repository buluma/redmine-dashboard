import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { IssueQueueCard } from "@/src/components/dashboard/IssueQueueCard";
import type { Issue, StatusCatalog } from "@/src/types/dashboard";
import type { ColumnKey } from "@/src/components/ColumnPicker";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${Object.values(vars).join(",")}` : key),
  }),
}));

vi.mock("@/src/components/dashboard/IssueQueueRow", () => ({
  IssueQueueRow: ({ issue }: { issue: Issue }) => <tr data-testid={`row-${issue.id}`}><td>{issue.subject}</td></tr>,
}));

vi.mock("@/src/components/KanbanBoard", () => ({
  KanbanBoard: () => <div data-testid="kanban-board" />,
}));

vi.mock("@/src/components/GanttChart", () => ({
  GanttChart: () => <div data-testid="gantt-chart" />,
}));

vi.mock("@/src/components/ColumnPicker", () => ({
  ColumnPicker: () => <div data-testid="column-picker" />,
}));

vi.mock("@/src/components/ProjectFilter", () => ({
  ProjectFilter: () => <div data-testid="project-filter" />,
}));

vi.mock("@/src/components/ExportButton", () => ({
  ExportButton: ({ format }: { format: string }) => <button type="button">{`export-${format}`}</button>,
}));

vi.mock("@/src/components/SkeletonTable", () => ({
  SkeletonTable: () => <tr data-testid="skeleton-table"><td>loading</td></tr>,
}));

const statuses: StatusCatalog[] = [{ id: 1, name: "New", isClosed: false }];

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "1",
    redmineIssueId: 1,
    localIssueNumber: null,
    redmineBaseUrl: "https://redmine.example.com",
    subject: "Fix it",
    description: null,
    projectName: "Core",
    parentIssueId: null,
    parentIssueLabel: null,
    tracker: "Bug",
    priority: "Normal",
    priorityId: 2,
    priorityName: "Normal",
    statusId: 1,
    statusName: "New",
    assignedToName: null,
    updatedAt: "2026-07-01T00:00:00Z",
    updatedOnRemote: "2026-07-01T00:00:00Z",
    lastActivityAt: "2026-07-01T00:00:00Z",
    lastActivityType: "issue_update",
    dueDate: null,
    startDate: null,
    estimatedHours: null,
    createdAt: "2026-06-01T00:00:00Z",
    doneRatio: 0,
    githubLinks: [],
    journals: [],
    timeEntries: [],
    attachments: [],
    relations: [],
    allowedStatuses: [],
    children: [],
    ...overrides,
  };
}

function renderCard(overrides: Partial<Parameters<typeof IssueQueueCard>[0]> = {}) {
  const props = {
    loading: false,
    visibleIssues: [makeIssue()],
    issues: [makeIssue()],
    summary: {
      open: 1, inProgress: 0, blocked: 0, overdue: 0, stale: 0, dueToday: 0, totalVisible: 1,
    },
    issueQueueOpen: true,
    onToggleIssueQueueOpen: vi.fn(),
    selectedIssueIds: [] as number[],
    onClearBulkSelection: vi.fn(),
    statuses,
    bulkStatusId: 0,
    onBulkStatusIdChange: vi.fn(),
    bulkPriorityId: 0,
    onBulkPriorityIdChange: vi.fn(),
    computedPriorityOptions: [{ id: 1, name: "Normal" }],
    bulkUpdating: false,
    onUpdateBulkStatus: vi.fn(),
    onUpdateBulkPriority: vi.fn(),
    onUpdateBulkMarkDone: vi.fn(),
    statusFilter: "",
    onStatusFilterChange: vi.fn(),
    onResetPage: vi.fn(),
    filterPresets: [],
    savingPreset: false,
    presetNameInput: "",
    onPresetNameInputChange: vi.fn(),
    onStartSavingPreset: vi.fn(),
    onCancelSavingPreset: vi.fn(),
    onConfirmSavingPreset: vi.fn(),
    onApplyPreset: vi.fn(),
    priorityFilter: "",
    onPriorityFilterChange: vi.fn(),
    search: "",
    onSearchChange: vi.fn(),
    showFavoritesOnly: false,
    onShowFavoritesOnlyChange: vi.fn(),
    assignedToMe: false,
    onAssignedToMeChange: vi.fn(),
    onOpenIssueCreateModal: vi.fn(),
    visibleColumns: new Set<ColumnKey>(["priority", "due", "progress", "updated"]),
    onVisibleColumnsChange: vi.fn(),
    selectedProject: null,
    onSelectedProjectChange: vi.fn(),
    viewMode: "list" as const,
    onViewModeChange: vi.fn(),
    onBoardDrop: vi.fn(),
    onSelectIssueId: vi.fn(),
    selectedAllVisible: false,
    onToggleSelectAllVisible: vi.fn(),
    onSort: vi.fn(),
    getSortIndicator: vi.fn(() => ""),
    allowedStatusIdsByIssue: {},
    selectedIssueId: null,
    page: 1,
    onPageChange: vi.fn(),
    pageSize: 20,
    onPageSizeChange: vi.fn(),
    total: 1,
    onOpenInNewTab: vi.fn(),
    onPrefetchIssue: vi.fn(),
    onToggleIssueSelection: vi.fn(),
    onUpdateStatus: vi.fn(),
    onLoadAllowedStatuses: vi.fn(),
    onHoverEnter: vi.fn(),
    onHoverLeave: vi.fn(),
    ...overrides,
  };
  render(<IssueQueueCard {...props} />);
  return props;
}

describe("IssueQueueCard", () => {
  it("renders the queue title and toggles collapsed state", () => {
    const props = renderCard();
    expect(screen.getByText("queue.title")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(props.onToggleIssueQueueOpen).toHaveBeenCalledTimes(1);
  });

  it("shows only the summary line when collapsed", () => {
    renderCard({ issueQueueOpen: false });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText(/pagination.queueHidden/)).toBeInTheDocument();
  });

  it("shows the bulk hint when nothing is selected", () => {
    renderCard({ selectedIssueIds: [] });
    expect(screen.getByText(/queue.bulkHint/)).toBeInTheDocument();
  });

  it("shows the bulk toolbar and wires its actions when issues are selected", () => {
    const props = renderCard({ selectedIssueIds: [1, 2], bulkStatusId: 5 });
    expect(screen.getByText("2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Apply status/ }));
    expect(props.onUpdateBulkStatus).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear Selection" }));
    expect(props.onClearBulkSelection).toHaveBeenCalledTimes(1);
  });

  it("wires quick-filter buttons to onStatusFilterChange + onResetPage", () => {
    const props = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Open/ }));
    expect(props.onStatusFilterChange).toHaveBeenCalledWith("Open");
    expect(props.onResetPage).toHaveBeenCalledTimes(1);
  });

  it("only shows the Overdue quick filter when there is overdue work", () => {
    renderCard({ summary: { open: 0, inProgress: 0, blocked: 0, overdue: 0, stale: 0, dueToday: 0, totalVisible: 0 } });
    expect(screen.queryByRole("button", { name: /Overdue/ })).toBeNull();
    renderCard({ summary: { open: 0, inProgress: 0, blocked: 0, overdue: 3, stale: 0, dueToday: 0, totalVisible: 3 } });
    expect(screen.getByRole("button", { name: /Overdue/ })).toBeInTheDocument();
  });

  it("renders the table view by default with rows for each paged issue", () => {
    renderCard({ visibleIssues: [makeIssue({ id: "1" }), makeIssue({ id: "2" })] });
    expect(screen.getByTestId("row-1")).toBeInTheDocument();
    expect(screen.getByTestId("row-2")).toBeInTheDocument();
  });

  it("shows the skeleton table instead of rows while loading", () => {
    renderCard({ loading: true });
    expect(screen.getByTestId("skeleton-table")).toBeInTheDocument();
    expect(screen.queryByTestId("row-1")).toBeNull();
  });

  it("renders the kanban board when viewMode is board", () => {
    renderCard({ viewMode: "board" });
    expect(screen.getByTestId("kanban-board")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renders the gantt chart when viewMode is gantt", () => {
    renderCard({ viewMode: "gantt" });
    expect(screen.getByTestId("gantt-chart")).toBeInTheDocument();
  });

  it("switches view mode via the tab buttons", () => {
    const props = renderCard();
    fireEvent.click(screen.getByRole("tab", { name: "queue.viewBoard" }));
    expect(props.onViewModeChange).toHaveBeenCalledWith("board");
  });

  it("wires the select-all checkbox", () => {
    const props = renderCard();
    fireEvent.click(screen.getByLabelText("Select all visible issues"));
    expect(props.onToggleSelectAllVisible).toHaveBeenCalledTimes(1);
  });

  it("hides pagination controls (but keeps the count) when everything fits on one page", () => {
    renderCard({ visibleIssues: [makeIssue()], pageSize: 20, total: 1 });
    expect(screen.queryByLabelText("Next page")).toBeNull();
    expect(screen.getByText(/pagination.showing/)).toBeInTheDocument();
  });

  it("shows pagination nav and wires page changes when there are multiple pages", () => {
    const many = Array.from({ length: 25 }, (_, i) => makeIssue({ id: String(i), redmineIssueId: i + 1 }));
    const props = renderCard({ visibleIssues: many, pageSize: 20, page: 1, total: 25 });
    fireEvent.click(screen.getByLabelText("Next page"));
    expect(props.onPageChange).toHaveBeenCalled();
  });

  it("hides the whole pagination bar when there are no visible issues", () => {
    renderCard({ visibleIssues: [] });
    expect(screen.queryByText(/pagination.showing/)).toBeNull();
  });
});
