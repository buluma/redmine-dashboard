import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ModalDialog } from "@/src/components/ModalDialog";

function renderDialog(onClose = vi.fn()) {
  return {
    onClose,
    ...render(
      <>
        <button type="button">Open dialog</button>
        <ModalDialog
          open
          onClose={onClose}
          labelledBy="dialog-title"
          backdropClassName="test-backdrop"
          dialogClassName="test-dialog"
        >
          <h2 id="dialog-title">Test dialog</h2>
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </ModalDialog>
      </>,
    ),
  };
}

describe("ModalDialog", () => {
  it("exposes dialog semantics and focuses the first control", async () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "Test dialog" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(screen.getByRole("button", { name: "First action" })).toHaveFocus());
  });

  it("closes on Escape and backdrop interaction", () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("wraps Tab focus in both directions", async () => {
    renderDialog();
    const first = screen.getByRole("button", { name: "First action" });
    const last = screen.getByRole("button", { name: "Last action" });
    await waitFor(() => expect(first).toHaveFocus());

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();
  });

  it("restores focus to the opener when unmounted", async () => {
    const opener = document.createElement("button");
    opener.type = "button";
    opener.textContent = "External opener";
    document.body.append(opener);
    opener.focus();
    const { unmount } = renderDialog();
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("restores focus when the open state closes", async () => {
    const onClose = vi.fn();
    const opener = document.createElement("button");
    opener.type = "button";
    opener.textContent = "State opener";
    document.body.append(opener);
    opener.focus();

    const { rerender } = render(
      <ModalDialog
        open
        onClose={onClose}
        labelledBy="dialog-title"
        backdropClassName="test-backdrop"
        dialogClassName="test-dialog"
      >
        <h2 id="dialog-title">Test dialog</h2>
        <button type="button">Action</button>
      </ModalDialog>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Action" })).toHaveFocus());
    rerender(
      <ModalDialog
        open={false}
        onClose={onClose}
        labelledBy="dialog-title"
        backdropClassName="test-backdrop"
        dialogClassName="test-dialog"
      >
        <h2 id="dialog-title">Test dialog</h2>
        <button type="button">Action</button>
      </ModalDialog>,
    );

    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("moves focus to the dialog itself when it has no controls", async () => {
    render(
      <ModalDialog
        open
        onClose={vi.fn()}
        labelledBy="dialog-title"
        backdropClassName="test-backdrop"
        dialogClassName="test-dialog"
      >
        <h2 id="dialog-title">Informational dialog</h2>
        <p>No actions are available.</p>
      </ModalDialog>,
    );

    await waitFor(() => expect(screen.getByRole("dialog", { name: "Informational dialog" })).toHaveFocus());
  });
});
