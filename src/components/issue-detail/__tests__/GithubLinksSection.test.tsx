import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { GithubLinksSection, type GithubLink } from "@/src/components/issue-detail/GithubLinksSection";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function makeLink(over: Partial<GithubLink> = {}): GithubLink {
  return {
    id: "l1",
    repositoryFullName: "acme/platform",
    githubIssueNumber: 123,
    githubPrNumber: null,
    url: "https://github.com/acme/platform/issues/123",
    title: "Investigate API timeout",
    createdAt: "2026-05-16T00:00:00.000Z",
    ...over,
  };
}

function renderSection(over: Partial<Parameters<typeof GithubLinksSection>[0]> = {}) {
  const props = {
    links: [makeLink()],
    busy: false,
    actionError: null,
    actionInfo: null,
    onCreate: vi.fn(async () => true),
    onDelete: vi.fn(async () => {}),
    ...over,
  };
  render(<GithubLinksSection {...props} />);
  return props;
}

describe("GithubLinksSection", () => {
  it("renders existing links by title", () => {
    renderSection();
    expect(screen.getByText("Investigate API timeout")).toBeInTheDocument();
  });

  it("renders empty state when there are no links", () => {
    renderSection({ links: [] });
    expect(screen.getByText("issues.empty.github")).toBeInTheDocument();
  });

  it("submits a new link with parsed numeric fields and clears the form", async () => {
    const onCreate = vi.fn(async () => true);
    renderSection({ links: [], onCreate });

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const numbers = screen.getAllByRole("spinbutton") as HTMLInputElement[];

    fireEvent.change(inputs[0], { target: { value: "acme/platform" } });
    fireEvent.change(numbers[0], { target: { value: "55" } });
    fireEvent.change(inputs[1], { target: { value: "https://gh/x" } });
    fireEvent.change(inputs[2], { target: { value: "title" } });

    fireEvent.submit(inputs[0].closest("form")!);

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    const firstCall = onCreate.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(firstCall[0]).toEqual({
      repositoryFullName: "acme/platform",
      githubIssueNumber: 55,
      githubPrNumber: undefined,
      url: "https://gh/x",
      title: "title",
    });
  });

  it("calls onDelete with the link id", () => {
    const props = renderSection();
    fireEvent.click(screen.getByRole("button", { name: "issues.actions.delete" }));
    expect(props.onDelete).toHaveBeenCalledWith("l1");
  });

  it("shows actionError when provided", () => {
    renderSection({ actionError: "boom" });
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("disables submit when busy", () => {
    renderSection({ busy: true });
    expect(screen.getByRole("button", { name: "common.loading" })).toBeDisabled();
  });
});
