import { describe, expect, it } from 'vitest';
import { DatabaseUrlError, resolveDatabaseUrl } from './database-url.ts';

const SECRET_URL = 'postgres://jury:s3cret-password@db.internal:5432/jury_forge';
const noFile = (): string => {
  throw new Error('readFile must not be called');
};

function errorOf(fn: () => unknown): DatabaseUrlError {
  try {
    fn();
  } catch (error) {
    if (error instanceof DatabaseUrlError) return error;
    throw error;
  }
  throw new Error('expected a DatabaseUrlError');
}

describe('resolveDatabaseUrl', () => {
  it('reads and trims DATABASE_URL_FILE', () => {
    const url = resolveDatabaseUrl({ DATABASE_URL_FILE: '/run/secrets/database_url' }, (path) => {
      expect(path).toBe('/run/secrets/database_url');
      return `${SECRET_URL}\n`;
    });
    expect(url).toBe(SECRET_URL);
  });

  it('accepts DATABASE_URL when no file is set', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: SECRET_URL }, noFile)).toBe(SECRET_URL);
  });

  it('accepts the postgresql:// scheme', () => {
    const url = 'postgresql://localhost/jury_forge';
    expect(resolveDatabaseUrl({ DATABASE_URL: url }, noFile)).toBe(url);
  });

  it('treats empty values as unset', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL_FILE: '', DATABASE_URL: SECRET_URL }, noFile)).toBe(
      SECRET_URL,
    );
    expect(errorOf(() => resolveDatabaseUrl({ DATABASE_URL: '' }, noFile)).message).toMatch(
      /Set DATABASE_URL_FILE/,
    );
  });

  it('refuses both forms at once', () => {
    const error = errorOf(() =>
      resolveDatabaseUrl(
        { DATABASE_URL_FILE: '/run/secrets/database_url', DATABASE_URL: SECRET_URL },
        noFile,
      ),
    );
    expect(error.message).toMatch(/not both/);
  });

  it('refuses when neither is set', () => {
    expect(errorOf(() => resolveDatabaseUrl({}, noFile)).message).toMatch(/Set DATABASE_URL_FILE/);
  });

  it('reports an unreadable or empty file without its content', () => {
    const unreadable = errorOf(() =>
      resolveDatabaseUrl({ DATABASE_URL_FILE: '/missing' }, () => {
        throw new Error(`ENOENT ${SECRET_URL}`);
      }),
    );
    expect(unreadable.message).toBe('Cannot read DATABASE_URL_FILE at /missing.');
    const empty = errorOf(() => resolveDatabaseUrl({ DATABASE_URL_FILE: '/empty' }, () => ' \n'));
    expect(empty.message).toMatch(/is empty/);
  });

  it('rejects a value that is not a postgres URL, without echoing it', () => {
    for (const value of ['not a url s3cret-password', 'mysql://jury:s3cret-password@db/jury']) {
      const error = errorOf(() => resolveDatabaseUrl({ DATABASE_URL: value }, noFile));
      expect(error.message).not.toContain('s3cret-password');
    }
    expect(
      errorOf(() => resolveDatabaseUrl({ DATABASE_URL: 'mysql://db/x' }, noFile)).message,
    ).toMatch(/postgres:\/\//);
  });
});
