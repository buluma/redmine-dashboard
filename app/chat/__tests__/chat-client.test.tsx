import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatInterface } from '../chat-client';
let locale = 'en';
vi.mock('@/src/components/I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => `${locale}:${key}` }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); locale = 'en'; });
it('renders a deterministic welcome during SSR', () => {
  expect(renderToString(<ChatInterface />)).toContain('en:chat.welcomeTitle');
  expect(renderToString(<ChatInterface />)).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
});
it('preserves messages when the locale changes', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: { content: 'answer' } }) }));
  const view = render(<ChatInterface />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'keep my question' } });
  fireEvent.submit(screen.getByRole('textbox').closest('form')!);
  await waitFor(() => expect(screen.getByText('answer')).toBeInTheDocument());
  locale = 'fr'; view.rerender(<ChatInterface />);
  expect(screen.getByText('keep my question')).toBeInTheDocument();
  expect(screen.getByText('answer')).toBeInTheDocument();
  expect(screen.getByText(/fr:chat.welcomeTitle/)).toBeInTheDocument();
});
