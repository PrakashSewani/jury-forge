// The `migrate` entrypoint: applies pending migrations, then exits (technical-approach §3.2).
// The one-shot `migrate` container runs it before `app` and `worker` start (deployment.md §3); the
// exact container command is fixed with the image in M1.2. Usage: node apps/server/src/migrate.ts [up]

import { readFileSync } from 'node:fs';
import { DatabaseUrlError, migrate, resolveDatabaseUrl } from '@jury-forge/store';

const USAGE = 'usage: migrate [up]';

export async function main(argv: readonly string[]): Promise<number> {
  const [command = 'up', ...rest] = argv;
  if (command !== 'up' || rest.length > 0) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  let databaseUrl: string;
  try {
    databaseUrl = resolveDatabaseUrl(process.env, (path) => readFileSync(path, 'utf8'));
  } catch (error) {
    if (error instanceof DatabaseUrlError) {
      process.stderr.write(`migrate: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
  const ran = await migrate({
    databaseUrl,
    direction: 'up',
    log: (message) => process.stdout.write(`migrate: ${message}\n`),
  });
  process.stdout.write(`migrate: ${ran.length} migration(s) applied\n`);
  return 0;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      // node-pg-migrate errors carry SQL and constraint names, not the connection string.
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`migrate: failed: ${message}\n`);
      process.exitCode = 1;
    },
  );
}
