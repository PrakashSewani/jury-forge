// The `migrate` command: applies pending migrations, then exits (technical-approach §3.2).
// The one-shot `migrate` container runs it before `app` and `worker` start (deployment.md §3), as
// `node apps/server/dist/main.js migrate` in the image. In a checkout it also runs directly:
// node apps/server/src/migrate.ts [up]

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

/** Runs the command and turns any failure into exit code 1 without printing the connection string. */
export async function runMigrate(argv: readonly string[]): Promise<number> {
  try {
    return await main(argv);
  } catch (error) {
    // pg and node-pg-migrate errors name a host or a user, never the password (migrate.int.test.ts).
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`migrate: failed: ${message}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runMigrate(process.argv.slice(2));
}
