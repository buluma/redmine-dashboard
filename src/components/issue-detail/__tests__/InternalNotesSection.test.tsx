import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { InternalNotesSection } from "@/src/components/issue-detail/InternalNotesSection";
import type { InternalNote } from "@/src/hooks/useInternalNotes";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

function makeNote(over: Partial<InternalNote> = {}): InternalNote {
  return {
    id: "n1",
    issueId: "i1",
    content: "hello world",
    createdAt: "2026-05-16T00:00:00.000Z",
    updatedAt: "2026-05-16T00:00:00.000Z",
    authorId: "u1",
    authorName: "Tester",
    ...over,
  };
}

function renderSection(over: Partial<Parameters<typeof InternalNotesSection>[0]> = {}) {
  const props = {
    notes: [makeNote()],
    busy: false,
    onCreate: vi.fn(async () => {}),
    onUpdate: vi.fn(async () => {}),
    onDelete: vi.fn(async () => {}),
    renderMarkdown: (content: string) => <div data-testid="md">{content}</div>,
    formatAgo: (iso: string) => `ago:${iso}`,
    actionError: null,
    ...over,
  };
  render(<InternalNotesSection {...props} />);
  return props;
}

describe("InternalNotesSection", () => {
  it("renders notes with author and rendered markdown", () => {
    renderSection();
    expect(screen.getByText("Tester")).toBeInTheDocument();
    expect(screen.getByTestId("md")).toHaveTextContent("hello world");
  });

  it("shows the empty message when there are no notes", () => {
    renderSection({ notes: [] });
    expect(screen.getByText("issues.empty.notes")).toBeInTheDocument();
  });

  it("calls onCreate with the trimmed textarea content and resets the field", () => {
    const props = renderSection();
    const textarea = screen.getAllByRole("textbox")[0];
    fireEvent.change(textarea, { target: { value: "  draft  " } });
    fireEvent.submit(textarea.closest("form")!);
    expect(props.onCreate).toHaveBeenCalledWith("draft");
  });

  it("disables submit when textarea is empty or busy", () => {
    renderSection({ busy: true });
    const submit = screen.getByRole("button", { name: "common.loading" });
    expect(submit).toBeDisabled();
  });

  it("enters edit mode and calls onUpdate with the new content", () => {
    const props = renderSection();
    fireEvent.click(screen.getByRole("button", { name: "common.edit" }));
    const editArea = screen.getAllByRole("textbox").find((el) => (el as HTMLTextAreaElement).value === "hello world");
    expect(editArea).toBeTruthy();
    fireEvent.change(editArea!, { target: { value: "new content" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    expect(props.onUpdate).toHaveBeenCalledWith("n1", "new content");
  });

  it("calls onDelete after confirmation", () => {
    const props = renderSection();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByTitle("common.delete"));
    expect(props.onDelete).toHaveBeenCalledWith("n1");
    confirmSpy.mockRestore();
  });

  it("renders the actionError banner when provided", () => {
    renderSection({ actionError: "bad" });
    expect(screen.getByText("bad")).toBeInTheDocument();
  });
});
