import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IssueActivityTabs, type IssueActivityTab } from "@/src/components/issue-detail/IssueActivityTabs";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/src/components/issue-detail/MarkdownBlock", () => ({
  MarkdownBlock: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

vi.mock("@/src/components/issue-detail/InternalNotesSection", () => ({
  InternalNotesSection: () => <div data-testid="internal-notes" />,
}));

vi.mock("@/src/components/TimeTrackingPanel", () => ({
  TimeTrackingPanel: ({ entries, activities }: { entries: Array<{ activityName: string }>; activities: Array<{ id: number }> }) => (
    <div data-testid="time-tracking">{`${entries[0]?.activityName ?? "none"}:${activities.length}`}</div>
  ),
}));

function renderTabs(activeTab: IssueActivityTab, over: Partial<Parameters<typeof IssueActivityTabs>[0]> = {}) {
  return render(
    <IssueActivityTabs
      issueId="issue-1"
      redmineIssueId={42}
      attachments={[]}
      timeEntries={[{ id: "time-1", hours: 1.5, activityName: "Development", authorName: "Ada", comments: "work", spentOn: "2026-09-13" }]}
      historyJournals={[{ id: "history-1", author: "Ada", notes: "History text", createdOnRemote: "2026-09-13" }]}
      noteJournals={[]}
      propertyJournals={[{ id: "property-1", author: null, notes: "Status updated", createdOnRemote: "2026-09-13" }]}
      activeTab={activeTab}
      tabsRef={null}
      internalNotes={[]}
      noteBusy={false}
      onCreateInternalNote={vi.fn(async () => {})}
      onUpdateInternalNote={vi.fn(async () => {})}
      onDeleteInternalNote={vi.fn(async () => {})}
      onAddTimeEntry={vi.fn(async () => {})}
      onImageClick={vi.fn()}
      formatAgo={(iso) => `ago:${iso}`}
      actionError={null}
      activities={[{ id: 31, name: "Development" }]}
      {...over}
    />,
  );
}

describe("IssueActivityTabs", () => {
  it("renders tab links with the supplied counts", () => {
    renderTabs("history", { internalNotes: [{ id: "note-1", issueId: "issue-1", content: "private", createdAt: "2026-09-13", updatedAt: "2026-09-13", authorId: "user-1", authorName: "Ada" }] });

    expect(screen.getByRole("link", { name: /issues.tabs.history/ })).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: /issues.tabs.notes/ })).toHaveTextContent("0");
    expect(screen.getByRole("link", { name: /issues.tabs.internalNotes/ })).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: /issues.tabs.properties/ })).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: /issues.tabs.timeEntries/ })).toHaveTextContent("1");
  });

  it("renders history journals and their formatted time", () => {
    renderTabs("history");
    expect(screen.getByText("History text")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "Ada • ago:2026-09-13")).toBeInTheDocument();
  });

  it("renders the notes empty state", () => {
    renderTabs("notes");
    expect(screen.getByText("issues.empty.notes")).toBeInTheDocument();
  });

  it("renders internal notes and property journals through their existing boundaries", () => {
    const { rerender } = renderTabs("internal-notes");
    expect(screen.getByTestId("internal-notes")).toBeInTheDocument();

    rerender(
      <IssueActivityTabs
        issueId="issue-1" redmineIssueId={42} attachments={[]} timeEntries={[]} historyJournals={[]} noteJournals={[]}
        propertyJournals={[{ id: "property-1", author: null, notes: "Status updated", createdOnRemote: "2026-09-13" }]}
        activeTab="properties" tabsRef={null} internalNotes={[]} noteBusy={false}
        onCreateInternalNote={vi.fn(async () => {})} onUpdateInternalNote={vi.fn(async () => {})} onDeleteInternalNote={vi.fn(async () => {})}
        onAddTimeEntry={vi.fn(async () => {})} onImageClick={vi.fn()} formatAgo={(iso) => `ago:${iso}`} actionError={null} activities={[]}
      />,
    );
    expect(screen.getByText("Status updated")).toBeInTheDocument();
  });

  it("passes normalized time entries and activities to the time panel", () => {
    renderTabs("time_entries");
    expect(screen.getByTestId("time-tracking")).toHaveTextContent("Development:1");
  });
});
