import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { IssueHoverTooltip } from "@/src/components/dashboard/IssueHoverTooltip";
import type { Issue } from "@/src/types/dashboard";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string | number>) => {
      if (!vars) return key;
      return `${key}:${Object.values(vars).join(",")}`;
    },
  }),
}));

const baseIssue = {
  id: 1,
  localIssueNumber: 42,
  subject: "Fix the widget",
  priority: "High",
  statusName: "In Progress",
  doneRatio: 60,
  dueDate: null,
  description: null,
} as unknown as Issue;

describe("IssueHoverTooltip", () => {
  it("renders nothing when there is no hovered issue", () => {
    const { container } = render(
      <IssueHoverTooltip issue={null} position={{ x: 0, y: 0 }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders subject and priority when an issue is hovered", () => {
    render(<IssueHoverTooltip issue={baseIssue} position={{ x: 10, y: 20 }} />);
    expect(screen.getByText("Fix the widget")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("positions the tooltip via inline style", () => {
    render(<IssueHoverTooltip issue={baseIssue} position={{ x: 10, y: 20 }} />);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.style.left).toBe("10px");
    expect(tooltip.style.top).toBe("20px");
  });

  it("truncates a long description to 200 chars with an ellipsis", () => {
    const longDesc = "x".repeat(250);
    render(
      <IssueHoverTooltip
        issue={{ ...baseIssue, description: longDesc } as Issue}
        position={{ x: 0, y: 0 }}
      />,
    );
    expect(screen.getByText(`${"x".repeat(200)}...`)).toBeInTheDocument();
  });

  it("omits the due date row when dueDate is absent", () => {
    render(<IssueHoverTooltip issue={baseIssue} position={{ x: 0, y: 0 }} />);
    expect(screen.queryByText(/preview.due/)).toBeNull();
  });
});
