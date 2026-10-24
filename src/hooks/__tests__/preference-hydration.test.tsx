import { act } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { useStoredString } from '../useStoredPreference';
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.innerHTML = '';
  localStorage.clear();
  vi.restoreAllMocks();
});
it('hydrates server defaults into saved preferences without mismatches or startup writes', async () => {
  function Preference() { return <output>{useStoredString('hydration-metrics', 'false')[0]}</output>; }
  localStorage.setItem('hydration-metrics', 'true');
  const host = document.createElement('div');
  host.innerHTML = renderToString(<Preference />);
  document.body.append(host);
  expect(host.textContent).toBe('false');
  const errors: unknown[] = [];
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  await act(async () => { root = hydrateRoot(host, <Preference />, { onRecoverableError: error => errors.push(error) }); });
  expect(host.textContent).toBe('true');
  expect(errors).toEqual([]);
  expect(writes).not.toHaveBeenCalled();
});
