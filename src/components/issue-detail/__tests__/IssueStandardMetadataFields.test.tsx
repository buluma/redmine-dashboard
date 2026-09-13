import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IssueStandardMetadataFields } from "@/src/components/issue-detail/IssueStandardMetadataFields";

vi.mock("@/src/components/I18nProvider", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const baseProps = {
  isEditing: false,
  draft: null,
  authorName: "Ada",
  categoryName: "Features",
  startDate: "2026-09-01T00:00:00.000Z",
  dueDate: "2026-09-13T00:00:00.000Z",
  priority: "High",
  estimatedHours: 2.5,
  spentHours: 1.25,
  priorities: [{ id: 4, name: "High", isDefault: true }],
  locale: "en-GB",
  formatPriority: (value: string | null) => `priority:${value}`,
  onDraftChange: vi.fn(),
};

describe("IssueStandardMetadataFields", () => {
  it("renders read-only metadata and formatted values", () => {
    render(<IssueStandardMetadataFields {...baseProps} />);
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("priority:High")).toBeInTheDocument();
    expect(screen.getByText("2.50h")).toBeInTheDocument();
    expect(screen.getByText("1.25h")).toBeInTheDocument();
  });

  it("renders controlled edit fields and forwards field changes", () => {
    const onDraftChange = vi.fn();
    render(<IssueStandardMetadataFields {...baseProps} isEditing draft={{ startDate: "2026-09-01", dueDate: "2026-09-13", categoryId: "32", priorityId: "4", estimatedHours: "2.5" }} onDraftChange={onDraftChange} />);

    fireEvent.change(screen.getAllByDisplayValue("2026-09-01")[0], { target: { value: "2026-09-02" } });
    fireEvent.change(screen.getByDisplayValue("2.5"), { target: { value: "3" } });
    expect(onDraftChange).toHaveBeenCalledWith("startDate", "2026-09-02");
    expect(onDraftChange).toHaveBeenCalledWith("estimatedHours", "3");
    expect(screen.getByRole("option", { name: "High (default)" })).toBeInTheDocument();
  });

  it("keeps spent hours visible (read-only) while editing, since Redmine computes it", () => {
    render(
      <IssueStandardMetadataFields
        {...baseProps}
        isEditing
        draft={{ startDate: "2026-09-01", dueDate: "2026-09-13", categoryId: "32", priorityId: "4", estimatedHours: "2.5" }}
      />,
    );
    expect(screen.getByText("1.25h")).toBeInTheDocument();
    // The estimated-hours read-only span is replaced by an editable input,
    // unlike spent hours which is never editable.
    expect(screen.queryByText("2.50h")).not.toBeInTheDocument();
  });
});
