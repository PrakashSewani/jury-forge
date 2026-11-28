// Readiness of the datastore for `/readyz` (observability.md §9; deployment.md §8): the database
// answers, every SQL migration shipped in this build is applied, and graphile-worker's schema is
// installed. The master-key check arrives with the key loader (WP 1-15).

import { readdir } from 'node:fs/promises';
import { type Kysely, sql } from 'kysely';
import type { DB } from './db.generated.ts';
import { MIGRATIONS_DIR, MIGRATIONS_TABLE } from './migrations.ts';
import { executorOf, type Store } from './store.ts';

export type ComponentState = 'ok' | 'pending' | 'error';

export interface StoreReadiness {
  database: ComponentState;
  /** `pending` when a migration in this build is not applied yet, `error` when it cannot be read. */
  migrations: ComponentState;
  /** `pending` until graphile-worker's schema is installed. */
  queue: ComponentState;
}

export interface ReadinessOptions {
  /** Each check fails as `error` after this long. Defaults to 2 000 ms. */
  timeoutMs?: number;
  /** Receives the reason a check failed. Error messages never reach the HTTP response. */
  onError?: (component: keyof StoreReadiness, error: unknown) => void;
}

/** The SQL migrations this build ships, by the name node-pg-migrate records. */
export async function shippedMigrations(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries
    .filter((name) => name.endsWith('.sql'))
    .map((name) => name.slice(0, -'.sql'.length))
    .sort();
}

export async function checkReadiness(
  store: Store,
  options: ReadinessOptions = {},
): Promise<StoreReadiness> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const onError = options.onError ?? (() => {});
  const db = executorOf(store);

  const run = async (
    component: keyof StoreReadiness,
    check: () => Promise<ComponentState>,
  ): Promise<ComponentState> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${component} check timed out after ${timeoutMs} ms`)),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([check(), timeout]);
    } catch (error) {
      onError(component, error);
      return 'error';
    } finally {
      clearTimeout(timer);
    }
  };

  const database = await run('database', async () => {
    await sql`select 1`.execute(db);
    return 'ok';
  });
  if (database !== 'ok') {
    return { database, migrations: 'error', queue: 'error' };
  }

  const [migrations, queue] = await Promise.all([
    run('migrations', async () => {
      const shipped = await shippedMigrations();
      if (!(await relationExists(db, `public.${MIGRATIONS_TABLE}`))) return 'pending';
      const applied = await sql<{ name: string }>`
        select name from ${sql.table(MIGRATIONS_TABLE)}
      `.execute(db);
      const names = new Set(applied.rows.map((row) => row.name));
      return shipped.every((name) => names.has(name)) ? 'ok' : 'pending';
    }),
    run('queue', async () => {
      // graphile-worker installs its schema in the same `migrate` run (migrations.ts).
      if (!(await relationExists(db, 'graphile_worker.migrations'))) return 'pending';
      await sql`select 1 from graphile_worker.migrations limit 1`.execute(db);
      return 'ok';
    }),
  ]);
  return { database, migrations, queue };
}

async function relationExists(db: Kysely<DB>, name: string): Promise<boolean> {
  const result = await sql<{ found: boolean }>`
    select to_regclass(${name}::text) is not null as found
  `.execute(db);
  return result.rows[0]?.found === true;
}
