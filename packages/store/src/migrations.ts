// Runs the plain-SQL migrations in ../migrations with node-pg-migrate (technical-approach §3.2),
// then installs or upgrades graphile-worker's own schema (it owns `graphile_worker`, job-pipeline.md).
// The `migrate` container runs `up` once before `app` and `worker` start; `down` exists for the
// tested down steps and rollback drills, and leaves the queue schema alone.

import { fileURLToPath } from 'node:url';
import { Logger, makeWorkerUtils } from 'graphile-worker';
import { runner } from 'node-pg-migrate';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/** node-pg-migrate's bookkeeping table, in `public`. It has no `org_id` (ADR-0035 exception). */
export const MIGRATIONS_TABLE = 'pgmigrations';

export type MigrationDirection = 'up' | 'down';

export interface MigrateOptions {
  databaseUrl: string;
  direction?: MigrationDirection;
  /** How many migrations to run. Defaults to all pending for `up` and one for `down`. */
  count?: number;
  /** Receives one line per message. Defaults to no output. */
  log?: (message: string) => void;
}

/** Applies or reverts migrations and returns the names of the SQL migrations it ran, in order. */
export async function migrate(options: MigrateOptions): Promise<string[]> {
  const direction = options.direction ?? 'up';
  const log = options.log ?? (() => {});
  const ran = await runner({
    databaseUrl: options.databaseUrl,
    dir: MIGRATIONS_DIR,
    migrationsTable: MIGRATIONS_TABLE,
    direction,
    count: options.count ?? (direction === 'up' ? Number.POSITIVE_INFINITY : 1),
    checkOrder: true,
    singleTransaction: true,
    advisoryLockMode: 'fail',
    logger: { debug: () => {}, info: log, warn: log, error: log },
  });
  if (direction === 'up') {
    await migrateQueueSchema(options.databaseUrl, log);
  }
  return ran.map((migration) => migration.name);
}

async function migrateQueueSchema(
  databaseUrl: string,
  log: (message: string) => void,
): Promise<void> {
  const logger = new Logger(() => (level, message) => {
    if (level === 'error' || level === 'warning') log(`graphile-worker: ${message}`);
  });
  const utils = await makeWorkerUtils({ connectionString: databaseUrl, logger });
  try {
    await utils.migrate();
    log('queue schema (graphile-worker) is current');
  } finally {
    await utils.release();
  }
}
