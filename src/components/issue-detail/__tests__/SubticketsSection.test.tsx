import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SubticketsSection } from "@/src/components/issue-detail/SubticketsSection";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe("SubticketsSection", () => {
  it("renders child links, formatted status, and the assignee", () => {
    const formatStatus = vi.fn((status: string) => `status:${status}`);
    render(
      <SubticketsSection
        subtickets={[{ id: 42, subject: "Child issue", statusName: "In Progress", assignedToName: "Ada" }]}
        formatStatus={formatStatus}
      />,
    );

    expect(screen.getByRole("link", { name: "#42" })).toHaveAttribute("href", "/issues/42");
    expect(screen.getByRole("link", { name: "Child issue" })).toHaveAttribute("target", "_blank");
    expect(screen.getByText("status:In Progress")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(formatStatus).toHaveBeenCalledWith("In Progress");
  });

  it("renders the empty state and subticket count", () => {
    render(<SubticketsSection subtickets={[]} formatStatus={(status) => status} />);
    expect(screen.getByText("issues.empty.subtickets")).toBeInTheDocument();
    expect(screen.getByText(/\(0\)/)).toBeInTheDocument();
  });

  it("uses fallback content for missing status and assignee", () => {
    render(<SubticketsSection subtickets={[{ id: 7, subject: "Unassigned child" }]} formatStatus={(status) => status} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("issues.empty.unassigned")).toBeInTheDocument();
  });
});
