import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IssueCommentForm } from "@/src/components/issue-detail/IssueCommentForm";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function renderForm(over: Partial<Parameters<typeof IssueCommentForm>[0]> = {}) {
  const props = {
    value: "",
    busy: false,
    actionError: null,
    actionInfo: null,
    onChange: vi.fn(),
    onSubmit: vi.fn(async () => {}),
    ...over,
  };
  render(<IssueCommentForm {...props} />);
  return props;
}

describe("IssueCommentForm", () => {
  it("forwards edited text through the controlled callback", () => {
    const props = renderForm();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "A new Redmine note" } });
    expect(props.onChange).toHaveBeenCalledWith("A new Redmine note");
  });

  it("submits the page-owned action when the comment is non-empty", () => {
    const props = renderForm({ value: "A new Redmine note" });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(props.onSubmit).toHaveBeenCalledOnce();
  });

  it("disables submission for empty or busy comments and shows action feedback", () => {
    const { rerender } = render(
      <IssueCommentForm value="" busy={false} actionError="failed" actionInfo="queued" onChange={vi.fn()} onSubmit={vi.fn(async () => {})} />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("queued")).toBeInTheDocument();

    rerender(
      <IssueCommentForm value="ready" busy actionError={null} actionInfo={null} onChange={vi.fn()} onSubmit={vi.fn(async () => {})} />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
