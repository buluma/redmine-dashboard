import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { IssueQueueRow, type IssueQueueRowCallbacks } from "@/src/components/dashboard/IssueQueueRow";
import type { Issue, StatusCatalog } from "@/src/types/dashboard";
import type { ColumnKey } from "@/src/components/ColumnPicker";

function makeIssue(over: Partial<Issue> = {}): Issue {
  return {
    id: "i1",
    redmineIssueId: 42,
    redmineBaseUrl: "https://r.example.com",
    source: "redmine",
    localIssueNumber: null,
    subject: "Investigate timeout",
    description: "",
    projectName: "Platform",
    parentIssueId: null,
    parentIssueLabel: null,
    statusId: 2,
    statusName: "In Progress",
    priorityId: 2,
    priorityName: "High",
    priority: "High",
    tracker: "Bug",
    assignedToName: "Alice",
    assignedToId: 1,
    dueDate: null,
    startDate: null,
    estimatedHours: null,
    doneRatio: 25,
    closedOn: null,
    createdOnRemote: "2026-05-01T00:00:00.000Z",
    updatedOnRemote: "2026-05-15T00:00:00.000Z",
    lastSyncedAt: "2026-05-15T00:00:00.000Z",
    customFields: [],
    journals: [],
    timeEntries: [],
    githubLinks: [],
    attachments: [],
    relations: [],
    allowedStatuses: [],
    children: [],
    lastActivityType: "update",
    ...over,
  } as Issue;
}

const statuses: StatusCatalog[] = [
  { id: 1, name: "Open", isClosed: false },
  { id: 2, name: "In Progress", isClosed: false },
  { id: 3, name: "Done", isClosed: true },
];

function renderRow(over: Partial<Parameters<typeof IssueQueueRow>[0]> = {}) {
  const callbacks: IssueQueueRowCallbacks = {
    onSelect: vi.fn(),
    onOpenInNewTab: vi.fn(),
    onPrefetch: vi.fn(),
    onToggleSelection: vi.fn(),
    onStatusChange: vi.fn(),
    onLoadAllowedStatuses: vi.fn(),
    onHoverEnter: vi.fn(),
    onHoverLeave: vi.fn(),
  };
  const visibleColumns = new Set<ColumnKey>(["priority", "due", "progress", "updated"]);
  const props = {
    issue: makeIssue(),
    selected: false,
    inBulkSelection: false,
    statuses,
    visibleColumns,
    ...callbacks,
    ...over,
  };
  const utils = render(
    <table>
      <tbody>
        <IssueQueueRow {...props} />
      </tbody>
    </table>,
  );
  return { props, ...callbacks, ...utils };
}

describe("IssueQueueRow", () => {
  it("renders subject + selected status", () => {
    renderRow();
    expect(screen.getByText("Investigate timeout")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open #42/ })).toBeInTheDocument();
  });

  it("calls onSelect when the row is clicked", () => {
    const { onSelect } = renderRow();
    fireEvent.click(screen.getByRole("button", { name: /Open #42/ }));
    expect(onSelect).toHaveBeenCalledWith(42);
  });

  it("calls onToggleSelection when the checkbox is toggled", () => {
    const { onToggleSelection } = renderRow();
    fireEvent.click(screen.getByRole("checkbox", { name: /Select issue #42/ }));
    expect(onToggleSelection).toHaveBeenCalledWith(42);
  });

  it("Enter opens peek; Shift+Enter opens in new tab", () => {
    const { onSelect, onOpenInNewTab } = renderRow();
    const row = screen.getByRole("button", { name: /Open #42/ });
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith(42);
    fireEvent.keyDown(row, { key: "Enter", shiftKey: true });
    expect(onOpenInNewTab).toHaveBeenCalled();
  });

  it("Space toggles bulk selection", () => {
    const { onToggleSelection } = renderRow();
    const row = screen.getByRole("button", { name: /Open #42/ });
    fireEvent.keyDown(row, { key: " " });
    expect(onToggleSelection).toHaveBeenCalledWith(42);
  });

  it("calls onStatusChange when the status select changes", () => {
    const onStatusChange = vi.fn();
    renderRow({ onStatusChange });
    const select = screen.getByDisplayValue("In Progress");
    fireEvent.change(select, { target: { value: "3" } });
    expect(onStatusChange).toHaveBeenCalled();
    expect(onStatusChange.mock.calls[0][1]).toBe(3);
  });

  it("filters statuses by allowedStatusIds when provided", () => {
    const { container } = renderRow({ allowedStatusIds: [3] });
    const select = container.querySelector("select.status-select") as HTMLSelectElement;
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toEqual(["Done"]);
  });
});
