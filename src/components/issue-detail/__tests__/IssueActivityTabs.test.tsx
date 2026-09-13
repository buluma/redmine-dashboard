import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { IssueActivityTabs, type IssueActivityTab } from "@/src/components/issue-detail/IssueActivityTabs";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/src/components/MarkdownBlock", () => ({
  MarkdownBlock: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

vi.mock("@/src/components/issue-detail/InternalNotesSection", () => ({
  InternalNotesSection: ({
    onCreate,
    onUpdate,
    onDelete,
    renderMarkdown,
    formatAgo,
  }: {
    onCreate: (content: string) => Promise<void>;
    onUpdate: (noteId: string, content: string) => Promise<void>;
    onDelete: (noteId: string) => Promise<void>;
    renderMarkdown: (content: string) => ReactNode;
    formatAgo: (iso: string) => string;
  }) => (
    <div data-testid="internal-notes">
      <button type="button" onClick={() => void onCreate("new note")}>create</button>
      <button type="button" onClick={() => void onUpdate("note-1", "edited")}>update</button>
      <button type="button" onClick={() => void onDelete("note-1")}>delete</button>
      <div data-testid="internal-notes-rendered">{renderMarkdown("internal note body")}</div>
      <div data-testid="internal-notes-ago">{formatAgo("2026-09-13")}</div>
    </div>
  ),
}));

vi.mock("@/src/components/TimeTrackingPanel", () => ({
  TimeTrackingPanel: ({
    entries,
    activities,
    onAddEntry,
  }: {
    entries: Array<{ activityName: string }>;
    activities: Array<{ id: number }>;
    onAddEntry: (hours: number, activityId: number, comments: string, spentOn: string) => Promise<void>;
  }) => (
    <div data-testid="time-tracking">
      {`${entries[0]?.activityName ?? "none"}:${activities.length}`}
      <button type="button" onClick={() => void onAddEntry(2, 31, "logged", "2026-09-13")}>
        add entry
      </button>
    </div>
  ),
}));

function renderTabs(activeTab: IssueActivityTab, over: Partial<Parameters<typeof IssueActivityTabs>[0]> = {}) {
  return render(
    <IssueActivityTabs
      issueId="issue-1"
      redmineIssueId={42}
      attachments={[]}
      timeEntries={[{ id: "time-1", redmineTimeEntryId: null, hours: 1.5, activityId: 31, activityName: "Development", authorName: "Ada", comments: "work", spentOn: "2026-09-13" }]}
      historyJournals={[{ id: "history-1", author: "Ada", notes: "History text", details: [], createdOnRemote: "2026-09-13" }]}
      noteJournals={[]}
      propertyJournals={[{ id: "property-1", author: null, notes: "Status updated", details: [], createdOnRemote: "2026-09-13" }]}
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
        propertyJournals={[{ id: "property-1", author: null, notes: "Status updated", details: [], createdOnRemote: "2026-09-13" }]}
        activeTab="properties" tabsRef={null} internalNotes={[]} noteBusy={false}
        onCreateInternalNote={vi.fn(async () => {})} onUpdateInternalNote={vi.fn(async () => {})} onDeleteInternalNote={vi.fn(async () => {})}
        onAddTimeEntry={vi.fn(async () => {})} onImageClick={vi.fn()} formatAgo={(iso) => `ago:${iso}`} actionError={null} activities={[]}
      />,
    );
    expect(screen.getByText("Status updated")).toBeInTheDocument();
  });

  it("wires the internal-notes callbacks and helpers through to the section, not just the props", () => {
    const onCreateInternalNote = vi.fn(async () => {});
    const onUpdateInternalNote = vi.fn(async () => {});
    const onDeleteInternalNote = vi.fn(async () => {});

    renderTabs("internal-notes", { onCreateInternalNote, onUpdateInternalNote, onDeleteInternalNote });

    fireEvent.click(screen.getByText("create"));
    fireEvent.click(screen.getByText("update"));
    fireEvent.click(screen.getByText("delete"));

    expect(onCreateInternalNote).toHaveBeenCalledWith("new note");
    expect(onUpdateInternalNote).toHaveBeenCalledWith("note-1", "edited");
    expect(onDeleteInternalNote).toHaveBeenCalledWith("note-1");
    // The closures handed to InternalNotesSection actually work, not just exist.
    expect(screen.getByTestId("internal-notes-rendered")).toHaveTextContent("internal note body");
    expect(screen.getByTestId("internal-notes-ago")).toHaveTextContent("ago:2026-09-13");
  });

  it("wires onAddTimeEntry through to the time-tracking panel with the right argument order", () => {
    const onAddTimeEntry = vi.fn(async () => {});
    renderTabs("time_entries", { onAddTimeEntry });

    fireEvent.click(screen.getByText("add entry"));

    expect(onAddTimeEntry).toHaveBeenCalledWith(2, 31, "logged", "2026-09-13");
  });

  it("passes normalized time entries and activities to the time panel", () => {
    renderTabs("time_entries");
    expect(screen.getByTestId("time-tracking")).toHaveTextContent("Development:1");
  });
});
