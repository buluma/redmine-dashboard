import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useIssues } from '../useIssues';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('rejects stale pages and exposes loading while the new page is pending', async () => {
  const requests: Array<(value: unknown) => void> = [];
  vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => requests.push(resolve))));
  const { result } = renderHook(() => useIssues());
  act(() => result.current.setPage(2));
  expect(result.current.loading).toBe(true);
  await act(async () => requests[1]({ ok: true, json: async () => ({ issues: [{ id: 'new' }], total: 1 }) }));
  await act(async () => requests[0]({ ok: true, json: async () => ({ issues: [{ id: 'old' }], total: 1 }) }));
  expect(result.current.issues[0].id).toBe('new');
  expect(result.current.loading).toBe(false);
});
it('keeps search mode across refresh and returns to filters when cleared', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ issues: [], total: 0 }) });
  vi.stubGlobal('fetch', fetcher);
  const { result } = renderHook(() => useIssues());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.search('hello'));
  await act(() => result.current.refetch());
  expect(fetcher.mock.calls.at(-1)?.[0]).toBe('/api/search?q=hello');
  await act(() => result.current.search(''));
  expect(fetcher.mock.calls.at(-1)?.[0]).toContain('/api/issues?');
});
