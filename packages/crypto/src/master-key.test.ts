import { randomBytes } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  type KeyFileAccess,
  loadMasterKeyFile,
  MasterKey,
  MasterKeyError,
  type MasterKeyProblem,
  masterKeyBytes,
} from './master-key.ts';

const KEY_B64 = randomBytes(32).toString('base64');

function access(
  files: Record<string, { mode: number; text?: string; readFails?: boolean }>,
  posix = true,
): KeyFileAccess {
  return {
    posix,
    mode(path) {
      const file = files[path];
      if (file === undefined) throw Object.assign(new Error('nope'), { code: 'ENOENT' });
      return file.mode;
    },
    read(path) {
      const file = files[path];
      if (file?.text === undefined || file.readFails === true) {
        throw Object.assign(new Error('nope'), { code: 'EACCES' });
      }
      return file.text;
    },
  };
}

function problemOf(fn: () => unknown): MasterKeyProblem | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof MasterKeyError) return error.problem;
    throw error;
  }
  return undefined;
}

describe('MasterKey.fromBase64', () => {
  it('accepts 32 random bytes in base64, with or without a trailing newline', () => {
    const key = MasterKey.fromBase64(`${KEY_B64}\n`);
    expect(masterKeyBytes(key).toString('base64')).toBe(KEY_B64);
    expect(MasterKey.fromBase64(`${KEY_B64}\r\n`).keyId).toBe(key.keyId);
    expect(MasterKey.fromBase64(KEY_B64).keyId).toBe(key.keyId);
  });

  it('derives a stable key id that is not the key', () => {
    const key = MasterKey.fromBase64(KEY_B64);
    expect(key.keyId).toMatch(/^k1-[0-9a-f]{16}$/);
    expect(MasterKey.fromBase64(randomBytes(32).toString('base64')).keyId).not.toBe(key.keyId);
    expect(key.keyId).not.toContain(masterKeyBytes(key).toString('hex').slice(0, 16));
  });

  it.each([
    ['', 'format'],
    ['not base64 at all', 'format'],
    [randomBytes(31).toString('base64'), 'format'],
    [randomBytes(33).toString('base64'), 'format'],
    [randomBytes(32).toString('hex'), 'format'],
    // base64url: `-` and `_` are not in the base64 alphabet (fixed, so the case cannot pass by chance).
    [`-_${KEY_B64.slice(2)}`, 'format'],
    [` ${KEY_B64}`, 'format'],
    [`${KEY_B64}\n\n`, 'format'],
    [Buffer.alloc(32).toString('base64'), 'weak'],
    [Buffer.alloc(32, 0x41).toString('base64'), 'weak'],
    [Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'), 'weak'],
  ])('refuses %j as %s', (text, problem) => {
    expect(problemOf(() => MasterKey.fromBase64(text))).toBe(problem);
  });

  it('never shows its bytes when printed, serialised, or inspected', () => {
    const key = MasterKey.fromBase64(KEY_B64);
    const hex = masterKeyBytes(key).toString('hex');
    for (const shown of [
      String(key),
      JSON.stringify({ key }),
      inspect(key),
      inspect({ key }, { depth: 5 }),
      `${key}`,
    ]) {
      expect(shown).toContain(key.keyId);
      expect(shown).not.toContain(KEY_B64);
      expect(shown).not.toContain(hex);
    }
    expect(Object.keys(key)).toEqual(['keyId']);
    expect(Object.isFrozen(key)).toBe(true);
  });

  it('refuses a non-key in masterKeyBytes', () => {
    expect(() => masterKeyBytes({} as MasterKey)).toThrow('Not a MasterKey.');
  });
});

describe('loadMasterKeyFile', () => {
  const path = '/run/secrets/master_key';

  it('reads a real file with the default access', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jf-kek-'));
    try {
      const file = join(dir, 'master_key');
      writeFileSync(
        file,
        `${KEY_B64}
`,
      );
      chmodSync(file, 0o400);
      expect(loadMasterKeyFile(file).keyId).toBe(MasterKey.fromBase64(KEY_B64).keyId);
      if (process.platform !== 'win32') {
        chmodSync(file, 0o644);
        expect(problemOf(() => loadMasterKeyFile(file))).toBe('permissions');
      }
      expect(problemOf(() => loadMasterKeyFile(join(dir, 'missing')))).toBe('missing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads a 0400 file', () => {
    const key = loadMasterKeyFile(
      path,
      access({ [path]: { mode: 0o100400, text: `${KEY_B64}\n` } }),
    );
    expect(key.keyId).toBe(MasterKey.fromBase64(KEY_B64).keyId);
  });

  it.each([
    [{}, 'missing'],
    [{ [path]: { mode: 0o100440, text: KEY_B64 } }, 'permissions'],
    [{ [path]: { mode: 0o100404, text: KEY_B64 } }, 'permissions'],
    [{ [path]: { mode: 0o100600, text: KEY_B64, readFails: true } }, 'unreadable'],
    [{ [path]: { mode: 0o100400, text: 'REPLACE_ME' } }, 'format'],
    [{ [path]: { mode: 0o100400, text: Buffer.alloc(32).toString('base64') } }, 'weak'],
  ])('fails closed on %j as %s, naming the path and not the content', (files, problem) => {
    let caught: unknown;
    try {
      loadMasterKeyFile(path, access(files as never));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MasterKeyError);
    expect((caught as MasterKeyError).problem).toBe(problem);
    expect((caught as Error).message).toContain(path);
    expect((caught as Error).message).not.toContain(KEY_B64);
  });

  it('reports EACCES on stat as unreadable', () => {
    const denied: KeyFileAccess = {
      posix: true,
      mode: () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
      },
      read: () => KEY_B64,
    };
    expect(problemOf(() => loadMasterKeyFile(path, denied))).toBe('unreadable');
  });

  it('skips the permission check where there are no POSIX modes', () => {
    const files = { [path]: { mode: 0o100666, text: KEY_B64 } };
    expect(loadMasterKeyFile(path, access(files, false)).keyId).toMatch(/^k1-/);
  });

  it('rethrows an unexpected error from parsing unchanged', () => {
    const weird: KeyFileAccess = {
      posix: false,
      mode: () => 0o100400,
      read: () => {
        return {
          replace: () => {
            throw new RangeError('boom');
          },
        } as unknown as string;
      },
    };
    expect(() => loadMasterKeyFile(path, weird)).toThrow(RangeError);
  });
});
