import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { env } from '@/src/lib/env';
import { InvalidWebhookDestinationError, sendWebhookRequest, validateWebhookUrl } from '../webhook-url';

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

  it.each([
    'http://[::ffff:127.0.0.1]/hook',
    'http://[::ffff:7f00:1]/hook',
    'http://[0:0:0:0:0:ffff:7f00:1]/hook',
  ])('rejects IPv4-mapped IPv6 loopback URL %s', async (url) => {
    await expect(validateWebhookUrl(url)).resolves.toMatchObject({ valid: false });
  });

  it('rejects a public hostname that resolves to a private address', async () => {
    mockLookup.mockResolvedValue([{ address: '10.0.0.12', family: 4 }]);
    await expect(validateWebhookUrl('https://hooks.example.com/callback', mockLookup)).resolves.toMatchObject({ valid: false });
  });

  it('rejects a hostname when any DNS answer is private', async () => {
    mockLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: 'fd00::12', family: 6 },
    ]);
    await expect(validateWebhookUrl('https://hooks.example.com/callback', mockLookup)).resolves.toMatchObject({ valid: false });
  });

  it.each(['::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:7f00:1'])(
    'rejects IPv4-mapped private DNS answer %s',
    async (address) => {
      mockLookup.mockResolvedValue([{ address, family: 6 }]);
      await expect(validateWebhookUrl('https://hooks.example.com/callback', mockLookup)).resolves.toMatchObject({ valid: false });
    }
  );

  it('preserves explicitly trusted private DNS destinations', async () => {
    env.webhookAllowedHosts.push('hooks.example.com');
    mockLookup.mockResolvedValue([{ address: '10.0.0.12', family: 4 }]);
    await expect(validateWebhookUrl('https://hooks.example.com/callback', mockLookup)).resolves.toEqual({ valid: true });
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

  it('rejects a private DNS answer at the actual connection boundary after public validation', async () => {
    mockLookup
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '::ffff:7f00:1', family: 6 }]);
    const url = 'http://hooks.example.com/callback';
    await expect(sendWebhookRequest(url, '{}', {}, mockLookup)).rejects.toBeInstanceOf(InvalidWebhookDestinationError);
    expect(mockLookup).toHaveBeenCalledTimes(2);
    expect(mockLookup).toHaveBeenLastCalledWith('hooks.example.com', { all: true, verbatim: true });
  });

  it('leaves a transient connection-time DNS failure retryable', async () => {
    mockLookup
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockRejectedValueOnce(new Error('temporary DNS failure'));

    await expect(sendWebhookRequest('http://hooks.example.com/callback', '{}', {}, mockLookup))
      .rejects.not.toBeInstanceOf(InvalidWebhookDestinationError);
  });

  it('validates direct send calls before opening a private IP-literal connection', async () => {
    await expect(sendWebhookRequest('http://127.0.0.1/hook', '{}', {}, mockLookup)).rejects.toThrow(
      'Private network destinations require adding the host to WEBHOOK_ALLOWED_HOSTS.'
    );
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('connects to the resolved IP while keeping the original Host header for trusted private receivers', async () => {
    env.webhookAllowedHosts.push('hooks.example.com');
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    let receivedHost: string | undefined;
    const server = createServer((request, response) => {
      receivedHost = request.headers.host;
      response.end('ok');
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    try {
      const address = server.address() as AddressInfo;
      const url = `http://hooks.example.com:${address.port}/callback`;
      await expect(sendWebhookRequest(url, '{}', {}, mockLookup)).resolves.toEqual({ status: 200, responseBody: 'ok' });
      expect(receivedHost).toBe(`hooks.example.com:${address.port}`);
      expect(mockLookup).toHaveBeenCalledTimes(2);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
