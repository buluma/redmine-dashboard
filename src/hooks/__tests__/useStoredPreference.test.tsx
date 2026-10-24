import { act, cleanup, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStoredString, useStoredStringSet } from '../useStoredPreference';
const defaults = ['priority'] as const;
const accepts = (value: string): value is 'priority' => value === 'priority';
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('uses server defaults but reads saved values without writing during hydration', () => {
  localStorage.setItem('metrics', 'true');
  const spy = vi.spyOn(Storage.prototype, 'setItem');
  function Server() { return <span>{useStoredString('metrics', 'false')[0]}</span>; }
  expect(renderToString(<Server />)).toContain('false');
  const { result } = renderHook(() => useStoredString('metrics', 'false'));
  expect(result.current[0]).toBe('true');
  expect(spy).not.toHaveBeenCalled();
});
it('filters values, tolerates malformed storage, and persists explicit changes', () => {
  localStorage.setItem('columns', '{bad');
  const { result } = renderHook(() => useStoredStringSet('columns', defaults, accepts));
  expect([...result.current[0]]).toEqual(['priority']);
  expect(localStorage.getItem('columns')).toBe('{bad');
  act(() => result.current[1](new Set()));
  expect(localStorage.getItem('columns')).toBe('[]');
  act(() => { localStorage.setItem('columns', '["priority","unknown"]'); window.dispatchEvent(new StorageEvent('storage', { key: 'columns' })); });
  expect([...result.current[0]]).toEqual(['priority']);
});
it('keeps explicit changes usable when storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  const { result } = renderHook(() => useStoredString('blocked', 'false'));
  act(() => result.current[1]('true'));
  expect(result.current[0]).toBe('true');
});
