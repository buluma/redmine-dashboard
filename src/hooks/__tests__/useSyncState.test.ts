import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSyncState } from '../useSyncState';
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('clears errors on recovery and aborts polling on unmount', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, json: async () => ({ syncActive: true, progress: 20 }) });
  vi.stubGlobal('fetch', fetcher);
  const { result, unmount } = renderHook(() => useSyncState());
  await waitFor(() => expect(result.current.error).toBe('offline'));
  await act(() => vi.advanceTimersByTimeAsync(30000));
  expect(result.current.error).toBeNull();
  expect(result.current.syncState?.isRunning).toBe(true);
  const signal = fetcher.mock.calls.at(-1)![1].signal as AbortSignal;
  unmount(); expect(signal.aborted).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(60000));
  expect(fetcher).toHaveBeenCalledTimes(2);
});
