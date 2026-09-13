import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IssueOverviewCards } from "@/src/components/issue-detail/IssueOverviewCards";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function renderCards(over: Partial<Parameters<typeof IssueOverviewCards>[0]> = {}) {
  const props = {
    statusName: "In Progress",
    priority: "High",
    dueDate: "2026-09-13T00:00:00.000Z",
    doneRatio: 60,
    totalSpent: 2.25,
    assignedToName: "Ada",
    locale: "en-GB",
    formatStatus: vi.fn((value: string | null) => `status:${value}`),
    formatPriority: vi.fn((value: string | null) => `priority:${value}`),
    ...over,
  };
  render(<IssueOverviewCards {...props} />);
  return props;
}

describe("IssueOverviewCards", () => {
  it("renders formatted status and priority", () => {
    const props = renderCards();
    expect(screen.getByText("status:In Progress")).toBeInTheDocument();
    expect(screen.getByText("issues.fields.priority: priority:High")).toBeInTheDocument();
    expect(props.formatStatus).toHaveBeenCalledWith("In Progress");
    expect(props.formatPriority).toHaveBeenCalledWith("High");
  });

  it("renders due date, progress, time, and assignee values", () => {
    renderCards();
    expect(screen.getByText((_, element) => element?.textContent === "issues.fields.done: 60%")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "2.3h")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "issues.fields.assignee: Ada")).toBeInTheDocument();
    expect(screen.getByText(/13\/09\/2026/)).toBeInTheDocument();
  });

  it("renders established fallbacks for omitted values", () => {
    renderCards({ dueDate: null, doneRatio: null, assignedToName: null });
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "issues.fields.done: 0%")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "issues.fields.assignee: issues.empty.unassigned")).toBeInTheDocument();
  });
});
