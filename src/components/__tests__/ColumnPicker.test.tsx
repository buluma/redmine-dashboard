import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ColumnPicker, type ColumnKey } from "@/src/components/ColumnPicker";

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe("ColumnPicker", () => {
  it("restores focus to the trigger after Escape closes the picker", async () => {
    const onChange = vi.fn();
    render(<ColumnPicker visibleColumns={new Set<ColumnKey>(["priority"])} onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: "columnPicker.buttonLabel" });
    fireEvent.click(trigger);

    expect(screen.getByRole("group", { name: "columnPicker.header" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("group", { name: "columnPicker.header" })).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  it("resets to all available columns", () => {
    const onChange = vi.fn();
    render(<ColumnPicker visibleColumns={new Set<ColumnKey>(["priority"])} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "columnPicker.buttonLabel" }));
    fireEvent.click(screen.getByRole("button", { name: "columnPicker.reset" }));

    expect(onChange).toHaveBeenCalledWith(new Set<ColumnKey>(["priority", "due", "progress", "updated"]));
  });
});
