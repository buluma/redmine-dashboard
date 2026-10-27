import { lookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';
import { Agent } from 'undici';
import { env } from '@/src/lib/env';

const PRIVATE_IPV4_RANGES = [
  [/^0\./, 'unspecified'],
  [/^10\./, 'private'],
  [/^127\./, 'loopback'],
  [/^169\.254\./, 'link-local'],
  [/^172\.(1[6-9]|2\d|3[01])\./, 'private'],
  [/^192\.168\./, 'private'],
  [/^192\.0\.0\./, 'reserved'],
  [/^192\.0\.2\./, 'documentation'],
  [/^192\.88\.99\./, 'reserved'],
  [/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, 'shared/private'],
  [/^198\.1[89]\./, 'reserved'],
  [/^198\.51\.100\./, 'documentation'],
  [/^203\.0\.113\./, 'documentation'],
  [/^(22[4-9]|23\d|24\d|25[0-5])\./, 'multicast/reserved'],
] as const;

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    return PRIVATE_IPV4_RANGES.some(([range]) => range.test(address));
  }

  let normalized = address.toLowerCase().split('%')[0];
  if (isIP(normalized) === 6) {
    try {
      normalized = new URL(`http://[${normalized}]/`).hostname.slice(1, -1);
    } catch {
      // Keep the original value; malformed addresses are rejected by the caller.
    }
  }

  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice(7);
    if (isIP(mapped) === 4) return isPrivateAddress(mapped);

    // WHATWG URL canonicalization renders IPv4-mapped IPv6 literals as two hex groups.
    const groups = mapped.split(':');
    if (groups.length === 2 && groups.every((group) => /^[\da-f]{1,4}$/.test(group))) {
      const high = Number.parseInt(groups[0], 16);
      const low = Number.parseInt(groups[1], 16);
      const ipv4 = [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
      return isPrivateAddress(ipv4);
    }
  }

  // Conservatively reject non-global IPv6 unicast, loopback, and mapped private ranges.
  return normalized === '::' || normalized === '::1' ||
    normalized.startsWith('fc') || normalized.startsWith('fd') ||
    normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
    normalized.startsWith('fea') || normalized.startsWith('feb') ||
    normalized.startsWith('2001:db8:') || normalized.startsWith('64:ff9b:') ||
    normalized.startsWith('ff');
}

function trustedPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return env.webhookAllowedHosts.some((item) =>
    item.toLowerCase().replace(/^\[|\]$/g, '') === host
  );
}

/** Validate destination before storage and again immediately before delivery. */
type AddressResolver = (hostname: string, options: { all: true; verbatim: true }) => Promise<Array<{ address: string; family?: number }>>;

async function resolveWebhookAddresses(
  hostname: string,
  resolveAddresses: AddressResolver
): Promise<{ addresses: Array<{ address: string; family?: number }> } | { error: string }> {
  try {
    const addresses = isIP(hostname)
      ? [{ address: hostname }]
      : await resolveAddresses(hostname, { all: true, verbatim: true });
    if (addresses.length === 0) return { error: 'The webhook host did not resolve.' };
    if (addresses.some(({ address }) => isIP(address) === 0)) {
      return { error: 'The webhook host returned an invalid address.' };
    }
    if (addresses.some(({ address }) => isPrivateAddress(address)) && !trustedPrivateHost(hostname)) {
      return { error: 'Private network destinations require adding the host to WEBHOOK_ALLOWED_HOSTS.' };
    }
    return { addresses };
  } catch {
    return { error: 'The webhook host could not be resolved.' };
  }
}

/** Resolve and vet addresses at the socket boundary, then give those exact addresses to Node. */
export function createWebhookDispatcher(rawUrl: string, resolveAddresses: AddressResolver = lookup): Agent {
  const expectedHostname = new URL(rawUrl).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const lookupAtConnect: LookupFunction = (hostname, options, callback) => {
    if (hostname.toLowerCase().replace(/^\[|\]$/g, '') !== expectedHostname) {
      callback(Object.assign(new Error('Webhook connection host did not match the validated URL.'), { code: 'ENOTFOUND' }), '', 0);
      return;
    }

    void resolveWebhookAddresses(hostname, resolveAddresses).then((result) => {
      if ('error' in result) {
        const error = Object.assign(new Error(result.error), { code: 'ENOTFOUND' });
        callback(error, '', 0);
        return;
      }

      const addresses = result.addresses.map(({ address, family }) => ({
        address,
        family: family ?? isIP(address),
      })).filter(({ family }) => !options.family || family === options.family);
      if (addresses.length === 0) {
        callback(Object.assign(new Error('The webhook host did not resolve to the requested address family.'), { code: 'ENOTFOUND' }), '', 0);
        return;
      }
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    }).catch((error: unknown) => {
      callback(error instanceof Error ? error : new Error(String(error)), '', 0);
    });
  };

  return new Agent({ connect: { lookup: lookupAtConnect }, pipelining: 0 });
}

export async function validateWebhookUrl(
  rawUrl: string,
  resolveAddresses: AddressResolver = lookup
): Promise<{ valid: true } | { valid: false; error: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { valid: false, error: 'Enter a valid URL.' };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { valid: false, error: 'Webhook URLs must use HTTP or HTTPS.' };
  }
  if (url.username || url.password) {
    return { valid: false, error: 'Webhook URLs cannot contain credentials.' };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return { valid: false, error: 'Webhook URL must include a hostname.' };
  const explicitlyTrusted = trustedPrivateHost(host);
  if ((host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) && !explicitlyTrusted) {
    return { valid: false, error: 'Local destinations require adding the host to WEBHOOK_ALLOWED_HOSTS.' };
  }
  if (url.port && !['80', '443'].includes(url.port) && !explicitlyTrusted) {
    return { valid: false, error: 'Non-standard ports require adding the host to WEBHOOK_ALLOWED_HOSTS.' };
  }

  const resolution = await resolveWebhookAddresses(host, resolveAddresses);
  if ('error' in resolution) return { valid: false, error: resolution.error };

  return { valid: true };
}
