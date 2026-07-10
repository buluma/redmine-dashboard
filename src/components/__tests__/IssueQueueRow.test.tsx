import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IssueQueueRow, type IssueQueueRowCallbacks } from "@/src/components/dashboard/IssueQueueRow";
import type { Issue } from "@/src/types/dashboard";
import type { ColumnKey } from "@/src/components/ColumnPicker";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "cuid-fixture",
    redmineIssueId: 42,
    localIssueNumber: null,
    redmineBaseUrl: "",
    subject: "Fixture issue",
    description: null,
    projectName: null,
    parentIssueId: null,
    parentIssueLabel: null,
    tracker: null,
    priority: null,
    priorityId: null,
    priorityName: null,
    statusId: 1,
    statusName: "New",
    assignedToName: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedOnRemote: "2026-01-01T00:00:00.000Z",
    lastActivityAt: null,
    lastActivityType: null,
    dueDate: null,
    startDate: null,
    estimatedHours: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    doneRatio: null,
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

function makeCallbacks(): IssueQueueRowCallbacks {
  return {
    onSelect: vi.fn(),
    onOpenInNewTab: vi.fn(),
    onPrefetch: vi.fn(),
    onToggleSelection: vi.fn(),
    onStatusChange: vi.fn(),
    onLoadAllowedStatuses: vi.fn(),
    onHoverEnter: vi.fn(),
    onHoverLeave: vi.fn(),
  };
}

function renderRow(issue: Issue, callbacks: IssueQueueRowCallbacks) {
  return render(
    <table>
      <tbody>
        <IssueQueueRow
          issue={issue}
          selected={false}
          inBulkSelection={false}
          statuses={[{ id: 1, name: "New", isClosed: false }]}
          visibleColumns={new Set<ColumnKey>()}
          {...callbacks}
        />
      </tbody>
    </table>,
  );
}

describe("IssueQueueRow selection", () => {
  it("clicking a Redmine-backed row selects it by numeric id", () => {
    const callbacks = makeCallbacks();
    renderRow(makeIssue({ redmineIssueId: 42 }), callbacks);

    fireEvent.click(screen.getByRole("button", { name: /Open #42/ }));

    expect(callbacks.onSelect).toHaveBeenCalledWith(42);
  });

  it("clicking a local ticket row does not fire onSelect (no numeric id to peek)", () => {
    const callbacks = makeCallbacks();
    renderRow(makeIssue({ redmineIssueId: null, localIssueNumber: 5 }), callbacks);

    fireEvent.click(screen.getByRole("button", { name: /Open L-5/ }));

    expect(callbacks.onSelect).not.toHaveBeenCalled();
  });

  it("Enter on a local ticket row also stays guarded, matching click behavior", () => {
    const callbacks = makeCallbacks();
    renderRow(makeIssue({ redmineIssueId: null, localIssueNumber: 5 }), callbacks);

    fireEvent.keyDown(screen.getByRole("button", { name: /Open L-5/ }), { key: "Enter" });

    expect(callbacks.onSelect).not.toHaveBeenCalled();
  });
});
