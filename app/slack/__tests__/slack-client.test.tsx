import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { SlackMessagesClient } from '../slack-client';
vi.mock('@/src/components/I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
it('does not fabricate a refresh timestamp during server rendering', () => {
  const html = renderToString(<SlackMessagesClient initialMessages={[]} channelId="test" channels={[{ id: 'test', name: 'test' }]} channelCount={1} />);
  expect(html).toContain('Last: --:--:--');
  expect(html).not.toContain('00:00:00');
});
