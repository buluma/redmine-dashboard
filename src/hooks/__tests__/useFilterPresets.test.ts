import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useFilterPresets } from "@/src/hooks/useFilterPresets";

describe("useFilterPresets", () => {
  it("starts with no presets and the save form closed", () => {
    const { result } = renderHook(() => useFilterPresets());
    expect(result.current.filterPresets).toEqual([]);
    expect(result.current.savingPreset).toBe(false);
    expect(result.current.presetNameInput).toBe("");
  });

  it("opens the save form via startSaving", () => {
    const { result } = renderHook(() => useFilterPresets());
    act(() => result.current.startSaving());
    expect(result.current.savingPreset).toBe(true);
  });

  it("cancelSaving closes the form and clears the name input", () => {
    const { result } = renderHook(() => useFilterPresets());
    act(() => {
      result.current.startSaving();
      result.current.setPresetNameInput("My View");
    });
    act(() => result.current.cancelSaving());
    expect(result.current.savingPreset).toBe(false);
    expect(result.current.presetNameInput).toBe("");
  });

  it("confirmSaving appends a preset from the current name + snapshot and closes the form", () => {
    const { result } = renderHook(() => useFilterPresets());
    act(() => {
      result.current.startSaving();
      result.current.setPresetNameInput("Urgent");
    });
    act(() => result.current.confirmSaving({
      statusFilter: "Overdue",
      priorityFilter: "High",
      search: "",
      showFavoritesOnly: false,
    }));

    expect(result.current.filterPresets).toHaveLength(1);
    expect(result.current.filterPresets[0]).toMatchObject({
      name: "Urgent",
      statusFilter: "Overdue",
      priorityFilter: "High",
      search: "",
      showFavoritesOnly: false,
    });
    expect(result.current.filterPresets[0].id).toBeTruthy();
    expect(result.current.savingPreset).toBe(false);
    expect(result.current.presetNameInput).toBe("");
  });

  it("preserves whatever snapshot fields the caller passes, e.g. an optional assignedToMe", () => {
    const { result } = renderHook(() => useFilterPresets());
    act(() => result.current.setPresetNameInput("Mine"));
    act(() => result.current.confirmSaving({
      statusFilter: "",
      priorityFilter: "",
      search: "",
      showFavoritesOnly: false,
      assignedToMe: true,
    }));
    expect(result.current.filterPresets[0].assignedToMe).toBe(true);
  });

  it("appends to existing presets rather than replacing them", () => {
    const { result } = renderHook(() => useFilterPresets());
    act(() => result.current.setPresetNameInput("First"));
    act(() => result.current.confirmSaving({ statusFilter: "", priorityFilter: "", search: "", showFavoritesOnly: false }));
    act(() => result.current.setPresetNameInput("Second"));
    act(() => result.current.confirmSaving({ statusFilter: "", priorityFilter: "", search: "", showFavoritesOnly: false }));

    expect(result.current.filterPresets.map((p) => p.name)).toEqual(["First", "Second"]);
  });
});
