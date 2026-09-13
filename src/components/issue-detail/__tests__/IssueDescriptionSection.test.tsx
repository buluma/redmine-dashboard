import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IssueDescriptionSection } from "@/src/components/issue-detail/IssueDescriptionSection";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/src/components/MarkdownBlock", () => ({
  MarkdownBlock: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

function renderSection(over: Partial<Parameters<typeof IssueDescriptionSection>[0]> = {}) {
  const props = {
    description: "Issue description",
    attachments: [],
    redmineIssueId: 42,
    isEditing: false,
    editingDescription: "",
    onDescriptionChange: vi.fn(),
    onImageClick: vi.fn(),
    ...over,
  };
  render(<IssueDescriptionSection {...props} />);
  return props;
}

describe("IssueDescriptionSection", () => {
  it("renders the existing description through the Markdown boundary", () => {
    renderSection();
    expect(screen.getByTestId("markdown")).toHaveTextContent("Issue description");
  });

  it("renders the empty state when no description exists", () => {
    renderSection({ description: null });
    expect(screen.getByText("issues.empty.noDescription")).toBeInTheDocument();
  });

  it("renders a controlled textarea in edit mode", () => {
    const props = renderSection({ isEditing: true, editingDescription: "Draft description" });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Draft description");
    fireEvent.change(textarea, { target: { value: "Updated draft" } });
    expect(props.onDescriptionChange).toHaveBeenCalledWith("Updated draft");
  });
});
