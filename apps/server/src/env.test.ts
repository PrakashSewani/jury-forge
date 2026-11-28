import { describe, expect, it } from 'vitest';
import { EnvError, loadRoleEnv } from './env.ts';

const URL_VALUE = 'postgres://jury_forge:placeholder@postgres:5432/jury_forge';
const files: Record<string, string> = { '/run/secrets/database_url': `${URL_VALUE}\n` };
const readFile = (path: string): string => {
  const content = files[path];
  if (content === undefined) throw new Error('ENOENT');
  return content;
};

describe('loadRoleEnv', () => {
  it('reads the Compose environment', () => {
    expect(
      loadRoleEnv(
        { DATABASE_URL_FILE: '/run/secrets/database_url', SETUP_BIND: '0.0.0.0:8080' },
        readFile,
      ),
    ).toEqual({
      databaseUrl: URL_VALUE,
      logLevel: 'info',
      setupBind: { host: '0.0.0.0', port: 8080, loopback: false },
      publicUrl: null,
    });
  });

  it('defaults SETUP_BIND to loopback', () => {
    const env = loadRoleEnv({ DATABASE_URL: URL_VALUE, SETUP_BIND: '' }, readFile);
    expect(env.setupBind).toEqual({ host: '127.0.0.1', port: 8080, loopback: true });
  });

  it('parses PUBLIC_URL into the canonical origin', () => {
    const env = loadRoleEnv({ DATABASE_URL: URL_VALUE, PUBLIC_URL: 'https://Review.Example.com/' });
    expect(env.publicUrl).toEqual({
      url: 'https://review.example.com',
      host: 'review.example.com',
    });
  });

  it.each([
    [{}, /DATABASE_URL_FILE/],
    [
      { DATABASE_URL: URL_VALUE, PUBLIC_URL: 'http://review.example.com' },
      /PUBLIC_URL .*not_https/,
    ],
    [{ DATABASE_URL: URL_VALUE, PUBLIC_URL: 'https://review.example.com/jf' }, /has_path/],
    [{ DATABASE_URL_FILE: '/missing' }, /Cannot read DATABASE_URL_FILE/],
    [{ DATABASE_URL: URL_VALUE, SETUP_BIND: 'localhost:8080' }, /^SETUP_BIND: /],
    [{ DATABASE_URL: URL_VALUE, LOG_LEVEL: 'loud' }, /^LOG_LEVEL /],
  ])('fails closed on %j', (env, message) => {
    expect(() => loadRoleEnv(env, readFile)).toThrow(EnvError);
    expect(() => loadRoleEnv(env, readFile)).toThrow(message);
  });

  it('never puts the database URL in an error', () => {
    const env = { DATABASE_URL: URL_VALUE, SETUP_BIND: 'bad' };
    expect(() => loadRoleEnv(env, readFile)).toThrow(EnvError);
    try {
      loadRoleEnv(env, readFile);
    } catch (error) {
      expect(String(error)).not.toContain('placeholder');
    }
  });
});
