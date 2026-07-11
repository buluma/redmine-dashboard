"use client";

import { useState } from "react";

import type { FilterPreset } from "@/src/types/dashboard";

export interface UseFilterPresetsResult {
  filterPresets: FilterPreset[];
  savingPreset: boolean;
  presetNameInput: string;
  setPresetNameInput: (name: string) => void;
  startSaving: () => void;
  cancelSaving: () => void;
  confirmSaving: (snapshot: Omit<FilterPreset, "id" | "name">) => void;
}

export function useFilterPresets(): UseFilterPresetsResult {
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([]);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState("");

  function startSaving() {
    setSavingPreset(true);
  }

  function cancelSaving() {
    setSavingPreset(false);
    setPresetNameInput("");
  }

  function confirmSaving(snapshot: Omit<FilterPreset, "id" | "name">) {
    setFilterPresets((current) => [...current, {
      id: Date.now().toString(),
      name: presetNameInput.trim(),
      ...snapshot,
    }]);
    setSavingPreset(false);
    setPresetNameInput("");
  }

  return { filterPresets, savingPreset, presetNameInput, setPresetNameInput, startSaving, cancelSaving, confirmSaving };
}
