import { describe, expect, it } from 'vitest';
import { parseRoleEnvironment } from './environment.ts';

const base = {
  DATABASE_URL_FILE: '/run/secrets/database_url',
  JURY_MASTER_KEY_FILE: '/run/secrets/master_key',
};

describe('parseRoleEnvironment', () => {
  it('reads the Compose environment and defaults LOG_LEVEL to info', () => {
    expect(
      parseRoleEnvironment({ ...base, SETUP_BIND: '0.0.0.0:8080', PUBLIC_URL: '', HOME: '/x' }),
    ).toEqual({
      ok: true,
      env: { ...base, LOG_LEVEL: 'info', SETUP_BIND: '0.0.0.0:8080' },
    });
  });

  it('treats empty values as unset and trims', () => {
    const result = parseRoleEnvironment({ ...base, LOG_LEVEL: '', DATABASE_URL: '' });
    expect(result).toEqual({ ok: true, env: { ...base, LOG_LEVEL: 'info' } });
  });

  it.each([
    [
      { DATABASE_URL_FILE: '/x' },
      'JURY_MASTER_KEY_FILE is required: the path to the master key file',
    ],
    [
      { ...base, JURY_MASTER_KEY_FILE: '' },
      'JURY_MASTER_KEY_FILE is required: the path to the master key file',
    ],
    [{ JURY_MASTER_KEY_FILE: '/k' }, 'DATABASE_URL_FILE is required (preferred), or DATABASE_URL'],
    [
      { ...base, DATABASE_URL: 'postgres://x' },
      'DATABASE_URL set DATABASE_URL_FILE or DATABASE_URL, not both',
    ],
    [
      { ...base, LOG_LEVEL: 'loud' },
      'LOG_LEVEL must be one of fatal, error, warn, info, debug, trace',
    ],
  ])('reports %j', (env, problem) => {
    const result = parseRoleEnvironment(env);
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.problems).toContain(problem);
  });

  it('never echoes a value in a problem', () => {
    const result = parseRoleEnvironment({ ...base, LOG_LEVEL: 'secret-looking-value' });
    expect(JSON.stringify(result)).not.toContain('secret-looking-value');
  });
});
