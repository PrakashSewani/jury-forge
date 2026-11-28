// The master key (KEK) from JURY_MASTER_KEY_FILE (technical-approach §3.9; security.md §7).
// The file holds one line: 32 random bytes in base64 (44 characters; owner decision 2026-11-28).
// The loader fails closed on a missing, unreadable, group- or world-readable, malformed, or
// sample-looking file. Its messages name the path and the reason, never the content.
// A MasterKey never shows its bytes: it serialises and inspects as `[MasterKey <keyId>]`.

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

export const MASTER_KEY_BYTES = 32;
/**
 * Fewer distinct byte values than this is not random. A random 32-byte key has about 30; the
 * chance that it has 16 or fewer is below 1e-13, while hex or ASCII samples have at most 16.
 */
const MIN_DISTINCT_BYTES = 17;
const BASE64_32 = /^[A-Za-z0-9+/]{43}=$/;

export type MasterKeyProblem = 'missing' | 'unreadable' | 'permissions' | 'format' | 'weak';

export class MasterKeyError extends Error {
  override name = 'MasterKeyError';
  readonly problem: MasterKeyProblem;
  constructor(problem: MasterKeyProblem, message: string) {
    super(message);
    this.problem = problem;
  }
}

const bytesOf = new WeakMap<MasterKey, Buffer>();

export class MasterKey {
  /** A stable, non-secret identifier of this key, recorded with every wrapped data key. */
  readonly keyId: string;

  private constructor(bytes: Buffer) {
    this.keyId = keyIdOf(bytes);
    bytesOf.set(this, bytes);
    Object.freeze(this);
  }

  /** Parses the file's text. Throws MasterKeyError('format' | 'weak'). */
  static fromBase64(text: string): MasterKey {
    const line = text.replace(/\r?\n$/, '');
    if (!BASE64_32.test(line)) {
      throw new MasterKeyError(
        'format',
        'The master key must be one line of base64 that decodes to exactly 32 bytes.',
      );
    }
    // 43 base64 characters and one `=` are exactly 32 bytes.
    const bytes = Buffer.from(line, 'base64');
    if (new Set(bytes).size < MIN_DISTINCT_BYTES) {
      bytes.fill(0);
      throw new MasterKeyError('weak', 'The master key is not random; generate a new one.');
    }
    return new MasterKey(bytes);
  }

  toString(): string {
    return `[MasterKey ${this.keyId}]`;
  }

  toJSON(): string {
    return this.toString();
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.toString();
  }
}

/** For the envelope module of this package only; index.ts does not export it. */
export function masterKeyBytes(key: MasterKey): Buffer {
  const bytes = bytesOf.get(key);
  if (bytes === undefined) throw new Error('Not a MasterKey.');
  return bytes;
}

export interface KeyFileAccess {
  /** File mode bits, or throws with `code` ENOENT/EACCES. */
  mode(path: string): number;
  read(path: string): string;
  /** Windows has no POSIX mode bits, so the permission check is skipped there. */
  posix: boolean;
}

const nodeAccess: KeyFileAccess = {
  mode: (path) => statSync(path).mode,
  read: (path) => readFileSync(path, 'utf8'),
  posix: process.platform !== 'win32',
};

/** Loads JURY_MASTER_KEY_FILE. Throws MasterKeyError; the message never contains the key. */
export function loadMasterKeyFile(path: string, access: KeyFileAccess = nodeAccess): MasterKey {
  let mode: number;
  try {
    mode = access.mode(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw code === 'ENOENT'
      ? new MasterKeyError('missing', `JURY_MASTER_KEY_FILE does not exist: ${path}`)
      : new MasterKeyError('unreadable', `Cannot read JURY_MASTER_KEY_FILE at ${path}`);
  }
  if (access.posix && (mode & 0o077) !== 0) {
    throw new MasterKeyError(
      'permissions',
      `JURY_MASTER_KEY_FILE at ${path} is readable by group or others; make it 0400`,
    );
  }
  let text: string;
  try {
    text = access.read(path);
  } catch {
    throw new MasterKeyError('unreadable', `Cannot read JURY_MASTER_KEY_FILE at ${path}`);
  }
  try {
    return MasterKey.fromBase64(text);
  } catch (error) {
    if (error instanceof MasterKeyError) {
      throw new MasterKeyError(error.problem, `JURY_MASTER_KEY_FILE at ${path}: ${error.message}`);
    }
    throw error;
  }
}

function keyIdOf(bytes: Buffer): string {
  const digest = createHash('sha256').update('jury-forge/kek-id/v1\0').update(bytes).digest('hex');
  return `k1-${digest.slice(0, 16)}`;
}
