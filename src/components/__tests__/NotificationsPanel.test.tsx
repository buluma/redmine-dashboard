import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { NotificationsPanel } from '../NotificationsPanel';
const t = (key: string) => key;
vi.mock('../I18nProvider', () => ({ useI18n: () => ({ t }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete (navigator as unknown as Record<string, unknown>).serviceWorker; });
it('renders without browser push support or hydration-only state', () => {
  expect(renderToString(<NotificationsPanel />)).toBeTruthy();
  render(<NotificationsPanel />);
  expect(screen.queryByText('notifications.pushOff')).not.toBeInTheDocument();
});
it('handles a failed subscription lookup without an unhandled rejection', async () => {
  const lookup = vi.fn().mockRejectedValue(new Error('denied'));
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ pushManager: { getSubscription: lookup } }) } });
  vi.stubGlobal('PushManager', function () {});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ notifications: [] }) }));
  render(<NotificationsPanel />);
  await waitFor(() => expect(lookup).toHaveBeenCalledOnce());
  await act(async () => { fireEvent.click(screen.getAllByRole('button')[0]); });
  expect(screen.getByText('notifications.pushOff')).toBeInTheDocument();
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
});
