import { beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '@/src/lib/env';
import { validateWebhookUrl } from '../webhook-url';

describe('validateWebhookUrl', () => {
  const mockLookup = vi.fn();
  beforeEach(() => {
    env.webhookAllowedHosts.splice(0, env.webhookAllowedHosts.length);
    mockLookup.mockReset();
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

  it.each([
    'file:///etc/passwd',
    'http://localhost/hook',
    'http://127.0.0.1/hook',
    'http://169.254.169.254/latest/meta-data',
    'https://user:pass@example.com/hook',
  ])('rejects unsafe URL %s', async (url) => {
    await expect(validateWebhookUrl(url)).resolves.toMatchObject({ valid: false });
  });

  it('rejects a public hostname that resolves to a private address', async () => {
    mockLookup.mockResolvedValue([{ address: '10.0.0.12', family: 4 }]);
    await expect(validateWebhookUrl('https://hooks.example.com/callback', mockLookup)).resolves.toMatchObject({ valid: false });
  });

  it('permits a hostname resolving only to a public address', async () => {
    const result = await validateWebhookUrl('https://hooks.example.com/callback', mockLookup);
    expect(mockLookup).toHaveBeenCalledWith('hooks.example.com', { all: true, verbatim: true });
    expect(result).toEqual({ valid: true });
  });

  it('permits an explicitly trusted private host on a non-standard port', async () => {
    env.webhookAllowedHosts.push('100.110.136.4');
    await expect(validateWebhookUrl('http://100.110.136.4:7000/callback')).resolves.toEqual({ valid: true });
  });

  it('requires trusted hosts for non-standard ports', async () => {
    await expect(validateWebhookUrl('https://hooks.example.com:8443/callback', mockLookup)).resolves.toMatchObject({ valid: false });
  });
});
