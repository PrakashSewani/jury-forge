// The instance's public origin (ADR-0021; deployment.md §2). One HTTPS origin per instance:
// `https://<host>`, with no path (DEP-08), no port, no credentials, and a DNS name, not an IP
// address (DEP-10). The stored form is canonical: lowercase, punycode, no trailing dot or slash.
// It is never derived from a request header.

/** How TLS reaches the instance (ADR-0036). `caddy` issues on demand; `front` ends TLS before it. */
export type TlsMode = 'caddy' | 'front';
export const TLS_MODES: readonly TlsMode[] = ['caddy', 'front'];

export interface Origin {
  /** `https://<host>`, canonical. */
  url: string;
  /** The host name alone, canonical; what the `ask` endpoint and the `Host` check compare. */
  host: string;
}

export type OriginRejection =
  | 'not_a_url'
  | 'not_https'
  | 'has_credentials'
  | 'has_port'
  | 'has_path'
  | 'ip_address'
  | 'not_public_name';

export type OriginResult = { ok: true; origin: Origin } | { ok: false; reason: OriginRejection };

const MAX_HOST_LENGTH = 253;
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** Parses what an operator entered (or `PUBLIC_URL`) into the canonical origin. */
export function parseOrigin(input: string): OriginResult {
  const text = input.trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: 'not_a_url' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'not_https' };
  if (url.username !== '' || url.password !== '') return { ok: false, reason: 'has_credentials' };
  // The URL parser drops `:443`, so any port left is a non-default one.
  if (url.port !== '' || /^https:\/\/[^/?#]*:\d*(?:[/?#]|$)/i.test(text)) {
    return { ok: false, reason: 'has_port' };
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '' || /[?#]/.test(text)) {
    return { ok: false, reason: 'has_path' };
  }
  const host = normaliseHost(url.hostname);
  if (host === null) return { ok: false, reason: 'not_public_name' };
  if (isIpLiteral(host)) return { ok: false, reason: 'ip_address' };
  if (!isPublicName(host)) return { ok: false, reason: 'not_public_name' };
  return { ok: true, origin: { url: `https://${host}`, host } };
}

/**
 * The host part of a `Host` header or an SNI name, canonical, or null when it is not a name this
 * module would accept. `defaultPort` is the port that may appear without changing the host.
 */
export function hostOf(value: string, defaultPort = 443): string | null {
  const text = value.trim().toLowerCase();
  const match = /^([a-z0-9.-]+|\[[0-9a-f:.]+\])(?::(\d{1,5}))?$/.exec(text);
  if (match === null) return null;
  const port = match[2];
  if (port !== undefined && Number(port) !== defaultPort) return null;
  return normaliseHost(match[1] as string);
}

function normaliseHost(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === '' || host.length > MAX_HOST_LENGTH ? null : host;
}

/** After WHATWG URL parsing every IPv4 spelling is dotted decimal and IPv6 is bracketed. */
function isIpLiteral(host: string): boolean {
  return host.startsWith('[') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

/** Two or more LDH labels, and not a loopback name (RFC 6761 `localhost`). */
function isPublicName(host: string): boolean {
  const labels = host.split('.');
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return false;
  // A numeric last label never gets here: the URL parser reads it as an invalid IPv4 address.
  return labels[labels.length - 1] !== 'localhost';
}
