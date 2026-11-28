import { randomBytes } from 'node:crypto';
import type { KeyFileAccess } from '@jury-forge/crypto';
import { describe, expect, it } from 'vitest';
import { EnvError, type EnvFiles, loadRoleEnv } from './env.ts';

const URL_VALUE = 'postgres://jury_forge:placeholder@postgres:5432/jury_forge';
const KEY_B64 = randomBytes(32).toString('base64');
const texts: Record<string, string> = {
  '/run/secrets/database_url': `${URL_VALUE}\n`,
  '/run/secrets/master_key': `${KEY_B64}\n`,
};
const readFile = (path: string): string => {
  const content = texts[path];
  if (content === undefined) throw new Error('ENOENT');
  return content;
};
const keyAccess: KeyFileAccess = {
  posix: true,
  mode: (path) => {
    if (texts[path] === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return 0o100400;
  },
  read: readFile,
};
const files: EnvFiles = { readFile, keyAccess };
const base = {
  DATABASE_URL_FILE: '/run/secrets/database_url',
  JURY_MASTER_KEY_FILE: '/run/secrets/master_key',
};

describe('loadRoleEnv', () => {
  it('reads the Compose environment', () => {
    const env = loadRoleEnv({ ...base, SETUP_BIND: '0.0.0.0:8080' }, files);
    expect(env).toMatchObject({
      databaseUrl: URL_VALUE,
      logLevel: 'info',
      setupBind: { host: '0.0.0.0', port: 8080, loopback: false },
      publicUrl: null,
    });
    expect(env.masterKey.keyId).toMatch(/^k1-[0-9a-f]{16}$/);
  });

  it('defaults SETUP_BIND to loopback', () => {
    const env = loadRoleEnv({ ...base, SETUP_BIND: '' }, files);
    expect(env.setupBind).toEqual({ host: '127.0.0.1', port: 8080, loopback: true });
  });

  it('parses PUBLIC_URL into the canonical origin', () => {
    const env = loadRoleEnv({ ...base, PUBLIC_URL: 'https://Review.Example.com/' }, files);
    expect(env.publicUrl).toEqual({
      url: 'https://review.example.com',
      host: 'review.example.com',
    });
  });

  it.each([
    [{}, /JURY_MASTER_KEY_FILE is required/],
    [{ JURY_MASTER_KEY_FILE: '/run/secrets/master_key' }, /DATABASE_URL_FILE is required/],
    [{ ...base, DATABASE_URL_FILE: '/missing' }, /Cannot read DATABASE_URL_FILE/],
    [
      { ...base, JURY_MASTER_KEY_FILE: '/missing' },
      /JURY_MASTER_KEY_FILE does not exist: \/missing/,
    ],
    [{ ...base, JURY_MASTER_KEY_FILE: '/run/secrets/database_url' }, /must be one line of base64/],
    [{ ...base, SETUP_BIND: 'localhost:8080' }, /^SETUP_BIND: /],
    [{ ...base, LOG_LEVEL: 'loud' }, /^LOG_LEVEL must be one of/],
    [{ ...base, PUBLIC_URL: 'http://review.example.com' }, /PUBLIC_URL .*not_https/],
    [{ ...base, PUBLIC_URL: 'https://review.example.com/jf' }, /has_path/],
  ])('fails closed on %j', (env, message) => {
    expect(() => loadRoleEnv(env, files)).toThrow(EnvError);
    expect(() => loadRoleEnv(env, files)).toThrow(message);
  });

  it('never puts the database URL or the master key in an error', () => {
    for (const env of [
      { ...base, SETUP_BIND: 'bad' },
      { ...base, JURY_MASTER_KEY_FILE: '/run/secrets/database_url' },
      { DATABASE_URL: URL_VALUE, JURY_MASTER_KEY_FILE: '/run/secrets/database_url' },
    ]) {
      let message = '';
      try {
        loadRoleEnv(env, files);
      } catch (error) {
        message = String(error);
      }
      expect(message).not.toBe('');
      expect(message).not.toContain('placeholder');
      expect(message).not.toContain(KEY_B64);
    }
  });
});
