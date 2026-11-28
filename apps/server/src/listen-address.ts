// `SETUP_BIND` (operations.md §3): the bootstrap listener's address, `host:port` or `[ipv6]:port`.
// A native install keeps the default, `127.0.0.1:8080`. Compose binds `0.0.0.0:8080` inside the
// container and publishes `127.0.0.1:8080:8080`, so the host publish is the loopback boundary.

import { isIP } from 'node:net';

export const DEFAULT_SETUP_BIND = '127.0.0.1:8080';

export interface ListenAddress {
  host: string;
  port: number;
  /** True for 127.0.0.0/8 and ::1. Anything else must be bounded by the host publish. */
  loopback: boolean;
}

export class ListenAddressError extends Error {
  override name = 'ListenAddressError';
}

export function parseListenAddress(value: string): ListenAddress {
  const match = /^(?:\[([^\]]+)\]|([^:[\]]+)):(\d{1,5})$/.exec(value.trim());
  const host = match?.[1] ?? match?.[2];
  const portText = match?.[3];
  if (host === undefined || portText === undefined) {
    throw new ListenAddressError(`expected host:port or [ipv6]:port, got ${JSON.stringify(value)}`);
  }
  const family = isIP(host);
  if (family === 0 || (match?.[1] !== undefined && family !== 6)) {
    throw new ListenAddressError(`the host must be an IP address, got ${JSON.stringify(host)}`);
  }
  const port = Number(portText);
  if (port < 1 || port > 65_535) {
    throw new ListenAddressError(`the port must be 1–65535, got ${portText}`);
  }
  const loopback = family === 4 ? host.split('.')[0] === '127' : host === '::1';
  return { host, port, loopback };
}
