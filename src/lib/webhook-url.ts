import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
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

  const normalized = address.toLowerCase().split('%')[0];
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice(7);
    if (isIP(mapped) === 4) return isPrivateAddress(mapped);
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

  try {
    const addresses = isIP(host)
      ? [{ address: host }]
      : await resolveAddresses(host, { all: true, verbatim: true });
    if (addresses.length === 0) return { valid: false, error: 'The webhook host did not resolve.' };
    if (addresses.some(({ address }) => isPrivateAddress(address)) && !explicitlyTrusted) {
      return { valid: false, error: 'Private network destinations require adding the host to WEBHOOK_ALLOWED_HOSTS.' };
    }
  } catch {
    return { valid: false, error: 'The webhook host could not be resolved.' };
  }

  return { valid: true };
}
