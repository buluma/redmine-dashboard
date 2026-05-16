import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";

import { usePageSize, PAGE_SIZE_OPTIONS } from "@/src/hooks/usePageSize";

const STORAGE_KEY = "nrcc.pageSize.v1";

describe("usePageSize", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to 20 when localStorage is empty", () => {
    const { result } = renderHook(() => usePageSize());
    expect(result.current.pageSize).toBe(20);
    expect(result.current.options).toEqual(PAGE_SIZE_OPTIONS);
  });

  it("hydrates from a valid stored value on mount", () => {
    window.localStorage.setItem(STORAGE_KEY, "50");
    const { result } = renderHook(() => usePageSize());
    expect(result.current.pageSize).toBe(50);
  });

  it("ignores invalid stored values and keeps the default", () => {
    window.localStorage.setItem(STORAGE_KEY, "7"); // not in the allowed set
    const { result } = renderHook(() => usePageSize());
    expect(result.current.pageSize).toBe(20);
  });

  it("persists allowed values via setPageSize and rejects invalid ones", () => {
    const { result } = renderHook(() => usePageSize());

    act(() => result.current.setPageSize(100));
    expect(result.current.pageSize).toBe(100);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("100");

    act(() => result.current.setPageSize(13));
    expect(result.current.pageSize).toBe(100);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("100");
  });

  it("accepts a custom default", () => {
    const { result } = renderHook(() => usePageSize(50));
    expect(result.current.pageSize).toBe(50);
  });
});
