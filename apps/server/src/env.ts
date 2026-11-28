// The environment the `app` and `worker` roles read in WP 1-13 (technical-approach §14;
// operations.md §3): `DATABASE_URL_FILE` or `DATABASE_URL`, `LOG_LEVEL`, and, for `app`,
// `SETUP_BIND`. An invalid value stops the process before it opens a connection (fail closed).
// The rest of the v1 list arrives with the work that reads it: `JURY_MASTER_KEY_FILE` with the key
// loader (WP 1-15), `PUBLIC_URL` and `TRUSTED_PROXIES` with the origin (WP 1-14).

import { readFileSync } from 'node:fs';
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
      databaseUrl: resolveDatabaseUrl(env, readFile),
    };
  } catch (error) {
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
