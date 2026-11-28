// The environment the `app` and `worker` roles read (technical-approach §14; operations.md §3).
// The shape is checked by the zod schema in `contracts`. Then each value is parsed by its own module:
// - `DATABASE_URL_FILE` or `DATABASE_URL`;
// - `JURY_MASTER_KEY_FILE`, the master key (WP 1-15a);
// - `LOG_LEVEL`;
// - `SETUP_BIND`;
// - `PUBLIC_URL`, which freezes the origin (ADR-0021).
// An invalid value stops the process before it opens a connection (fail closed). Messages name the
// variable and never a secret value. `TRUSTED_PROXIES` arrives with the first route behind Caddy
// that keys a limit on the client address.

import { readFileSync } from 'node:fs';
import { type LogLevel, parseRoleEnvironment } from '@jury-forge/contracts';
import {
  type KeyFileAccess,
  loadMasterKeyFile,
  type MasterKey,
  MasterKeyError,
} from '@jury-forge/crypto';
import { type Origin, parseOrigin } from '@jury-forge/domain';
import { DatabaseUrlError, type ReadFile, resolveDatabaseUrl } from '@jury-forge/store';
import {
  DEFAULT_SETUP_BIND,
  type ListenAddress,
  ListenAddressError,
  parseListenAddress,
} from './listen-address.ts';

export interface RoleEnv {
  databaseUrl: string;
  masterKey: MasterKey;
  logLevel: LogLevel;
  setupBind: ListenAddress;
  /** The parsed `PUBLIC_URL`, or null when the origin is set in setup. */
  publicUrl: Origin | null;
}

export class EnvError extends Error {
  override name = 'EnvError';
}

export interface EnvFiles {
  readFile?: ReadFile;
  keyAccess?: KeyFileAccess;
}

const readUtf8: ReadFile = (path) => readFileSync(path, 'utf8');

/** Reads and checks the role environment. Throws EnvError with every problem it found. */
export function loadRoleEnv(
  env: Readonly<Record<string, string | undefined>>,
  files: EnvFiles = {},
): RoleEnv {
  const shape = parseRoleEnvironment(env);
  if (!shape.ok) throw new EnvError(shape.problems.join('; '));
  const checked = shape.env;
  try {
    return {
      logLevel: checked.LOG_LEVEL,
      setupBind: parseSetupBind(checked.SETUP_BIND),
      publicUrl: parsePublicUrl(checked.PUBLIC_URL),
      databaseUrl: resolveDatabaseUrl(checked, files.readFile ?? readUtf8),
      masterKey: loadMasterKeyFile(checked.JURY_MASTER_KEY_FILE, files.keyAccess),
    };
  } catch (error) {
    if (error instanceof EnvError) throw error;
    if (
      error instanceof DatabaseUrlError ||
      error instanceof ListenAddressError ||
      error instanceof MasterKeyError
    ) {
      throw new EnvError(error.message);
    }
    throw error;
  }
}

function parsePublicUrl(value: string | undefined): Origin | null {
  if (value === undefined) return null;
  const parsed = parseOrigin(value);
  if (!parsed.ok) {
    throw new EnvError(`PUBLIC_URL must be https://<host> with no port or path (${parsed.reason})`);
  }
  return parsed.origin;
}

function parseSetupBind(value: string | undefined): ListenAddress {
  try {
    return parseListenAddress(value ?? DEFAULT_SETUP_BIND);
  } catch (error) {
    if (error instanceof ListenAddressError) {
      throw new ListenAddressError(`SETUP_BIND: ${error.message}`);
    }
    throw error;
  }
}
