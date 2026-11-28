// The environment the `app` and `worker` roles read in WP 1-13 (technical-approach §14;
// operations.md §3): `DATABASE_URL_FILE` or `DATABASE_URL`, `LOG_LEVEL`, and, for `app`,
// `SETUP_BIND` and `PUBLIC_URL` (WP 1-14: it freezes the origin, ADR-0021). An invalid value stops
// the process before it opens a connection (fail closed). The rest of the v1 list arrives with the
// work that reads it: `JURY_MASTER_KEY_FILE` with the key loader and `TRUSTED_PROXIES` with the
// first per-client rate limit (both WP 1-15).

import { readFileSync } from 'node:fs';
import { type Origin, parseOrigin } from '@jury-forge/domain';
import { DatabaseUrlError, type ReadFile, resolveDatabaseUrl } from '@jury-forge/store';
import {
  DEFAULT_SETUP_BIND,
  type ListenAddress,
  ListenAddressError,
  parseListenAddress,
} from './listen-address.ts';
import { LogLevelError, parseLogLevel } from './logger.ts';

export interface RoleEnv {
  databaseUrl: string;
  logLevel: ReturnType<typeof parseLogLevel>;
  setupBind: ListenAddress;
  /** The parsed `PUBLIC_URL`, or null when the origin is set in setup. */
  publicUrl: Origin | null;
}

export class EnvError extends Error {
  override name = 'EnvError';
}

const readUtf8: ReadFile = (path) => readFileSync(path, 'utf8');

/** Reads and checks the role environment. Messages name the variable, never a secret value. */
export function loadRoleEnv(
  env: Readonly<Record<string, string | undefined>>,
  readFile: ReadFile = readUtf8,
): RoleEnv {
  try {
    return {
      logLevel: parseLogLevel(env['LOG_LEVEL']),
      setupBind: parseSetupBind(env['SETUP_BIND']),
      publicUrl: parsePublicUrl(env['PUBLIC_URL']),
      databaseUrl: resolveDatabaseUrl(env, readFile),
    };
  } catch (error) {
    if (error instanceof EnvError) throw error;
    if (
      error instanceof DatabaseUrlError ||
      error instanceof ListenAddressError ||
      error instanceof LogLevelError
    ) {
      throw new EnvError(error.message);
    }
    throw error;
  }
}

function parsePublicUrl(value: string | undefined): Origin | null {
  if (value === undefined || value === '') return null;
  const parsed = parseOrigin(value);
  if (!parsed.ok) {
    throw new EnvError(`PUBLIC_URL must be https://<host> with no port or path (${parsed.reason})`);
  }
  return parsed.origin;
}

function parseSetupBind(value: string | undefined): ListenAddress {
  try {
    return parseListenAddress(value === undefined || value === '' ? DEFAULT_SETUP_BIND : value);
  } catch (error) {
    if (error instanceof ListenAddressError) {
      throw new ListenAddressError(`SETUP_BIND: ${error.message}`);
    }
    throw error;
  }
}
