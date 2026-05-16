"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "nrcc.pageSize.v1";
export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

function isPageSize(value: number): value is PageSize {
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(value);
}

export interface UsePageSizeResult {
  pageSize: PageSize;
  setPageSize: (value: number) => void;
  options: typeof PAGE_SIZE_OPTIONS;
}

export function usePageSize(defaultSize: PageSize = 20): UsePageSizeResult {
  const [pageSize, setPageSizeState] = useState<PageSize>(defaultSize);

  // Hydration-safe load: SSR renders defaultSize, client mounts and reads
  // localStorage. setState in effect is intentional — lazy init in useState
  // would cause an SSR/client HTML mismatch.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const n = raw ? Number(raw) : NaN;
      if (isPageSize(n)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPageSizeState(n);
      }
    } catch {
      // Ignore storage errors.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(pageSize));
    } catch {
      // Ignore storage errors.
    }
  }, [pageSize]);

  const setPageSize = useCallback((value: number) => {
    if (isPageSize(value)) {
      setPageSizeState(value);
    }
  }, []);

  return { pageSize, setPageSize, options: PAGE_SIZE_OPTIONS };
}
