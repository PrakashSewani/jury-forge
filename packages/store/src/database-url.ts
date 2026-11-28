// Resolves the database URL from DATABASE_URL_FILE or DATABASE_URL (technical-approach §14).
// The file form is preferred: the URL carries the database password, and an environment value is
// visible in `docker inspect` and /proc. Error messages never include the URL or the file content.

export type ReadFile = (path: string) => string;

export class DatabaseUrlError extends Error {
  override name = 'DatabaseUrlError';
}

const SCHEMES = ['postgres:', 'postgresql:'];

export function resolveDatabaseUrl(
  env: Readonly<Record<string, string | undefined>>,
  readFile: ReadFile,
): string {
  const filePath = env['DATABASE_URL_FILE'];
  const direct = env['DATABASE_URL'];
  const hasFile = filePath !== undefined && filePath !== '';
  const hasDirect = direct !== undefined && direct !== '';

  if (hasFile && hasDirect) {
    throw new DatabaseUrlError('Set DATABASE_URL_FILE or DATABASE_URL, not both.');
  }
  if (!hasFile && !hasDirect) {
    throw new DatabaseUrlError('Set DATABASE_URL_FILE (preferred) or DATABASE_URL.');
  }

  let url: string;
  if (hasFile) {
    try {
      url = readFile(filePath).trim();
    } catch {
      throw new DatabaseUrlError(`Cannot read DATABASE_URL_FILE at ${filePath}.`);
    }
    if (url === '') {
      throw new DatabaseUrlError(`DATABASE_URL_FILE at ${filePath} is empty.`);
    }
  } else {
    url = (direct as string).trim();
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DatabaseUrlError('The database URL is not a valid URL.');
  }
  if (!SCHEMES.includes(parsed.protocol)) {
    throw new DatabaseUrlError('The database URL must start with postgres:// or postgresql://.');
  }
  return url;
}
