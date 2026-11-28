// The tenant-scoped data layer (security.md T-12, ADR-0035, data-model.md rule 1).
//
// Code outside this package never holds a raw Kysely instance. A tenant table is reachable only
// through `forOrg(orgId)`, which filters every read, update, and delete by `org_id` and sets
// `org_id` on every insert. Instance-level tables (no `org_id`) go through `instance`.
// Joins from a scoped query must follow foreign-key columns: the composite tenant keys keep a
// joined row in the same org, so filtering the root table is enough.

import {
  type DeleteQueryBuilder,
  type DeleteResult,
  type Insertable,
  type InsertQueryBuilder,
  type InsertResult,
  Kysely,
  PostgresDialect,
  type SelectQueryBuilder,
  sql,
  type Updateable,
  type UpdateQueryBuilder,
  type UpdateResult,
} from 'kysely';
import pg from 'pg';
import type { DB } from './db.generated.ts';

/** Every table with an `org_id` column: the tenant-owned tables of ADR-0035. */
export type TenantTable = { [K in keyof DB]: 'org_id' extends keyof DB[K] ? K : never }[keyof DB];

/** Tables without `org_id`: the tenant root, instance-level identity, and worker liveness. */
export type InstanceTable = Exclude<keyof DB, TenantTable>;

/** The tenant tables at runtime; the type below fails to compile if one is missing. */
export const TENANT_TABLES = [
  'artefacts',
  'audit_events',
  'budgets',
  'coverage_manifests',
  'finding_feedback',
  'finding_fingerprints',
  'installations',
  'instance_settings',
  'message_versions',
  'model_probes',
  'pr_sessions',
  'provider_models',
  'providers',
  'repositories',
  'resolutions',
  'reviewer_repo_bindings',
  'reviewer_versions',
  'reviewers',
  'secrets',
  'session_findings',
  'session_messages',
  'session_threads',
  'session_turns',
  'turn_steps',
  'usage_rollups',
  'webhook_deliveries',
] as const satisfies readonly TenantTable[];

type MissingTenantTables = Exclude<TenantTable, (typeof TENANT_TABLES)[number]>;
const allTenantTablesListed: [MissingTenantTables] extends [never] ? true : MissingTenantTables =
  true;
void allTenantTablesListed;

/** Insert values for a tenant table: `org_id` is supplied by the scope. */
export type TenantInsert<T extends TenantTable> = Omit<Insertable<DB[T]>, 'org_id'>;

/** Update values for a tenant table: `org_id` can never change. */
export type TenantUpdate<T extends TenantTable> = Omit<Updateable<DB[T]>, 'org_id'>;

// biome-ignore lint/complexity/noBannedTypes: Kysely's own type for "nothing selected yet".
type NoSelection = {};

export interface TenantScope {
  readonly orgId: string;
  selectFrom<T extends TenantTable>(table: T): SelectQueryBuilder<DB, T, NoSelection>;
  insertInto<T extends TenantTable>(
    table: T,
    values: TenantInsert<T> | readonly TenantInsert<T>[],
  ): InsertQueryBuilder<DB, T, InsertResult>;
  update<T extends TenantTable>(
    table: T,
    values: TenantUpdate<T>,
  ): UpdateQueryBuilder<DB, T, T, UpdateResult>;
  deleteFrom<T extends TenantTable>(table: T): DeleteQueryBuilder<DB, T, DeleteResult>;
}

export interface InstanceScope {
  selectFrom<T extends InstanceTable>(table: T): SelectQueryBuilder<DB, T, NoSelection>;
  insertInto<T extends InstanceTable>(table: T): InsertQueryBuilder<DB, T, InsertResult>;
  updateTable<T extends InstanceTable>(table: T): UpdateQueryBuilder<DB, T, T, UpdateResult>;
  deleteFrom<T extends InstanceTable>(table: T): DeleteQueryBuilder<DB, T, DeleteResult>;
}

/** Why audit rows are being deleted (migration 0006). */
export type AuditDeleteReason = 'retention' | 'org_purge';

export interface Store {
  /** Queries on tenant tables, always scoped to `orgId`. */
  forOrg(orgId: string): TenantScope;
  /** Queries on the instance-level tables. */
  readonly instance: InstanceScope;
  /** Runs `fn` in one transaction; it commits when `fn` resolves and rolls back when it throws. */
  transaction<R>(fn: (tx: Store) => Promise<R>): Promise<R>;
  /** Permits audit deletes for the rest of the current transaction. Throws outside a transaction. */
  allowAuditDelete(reason: AuditDeleteReason): Promise<void>;
  /** Cross-org maintenance for the retention job: deletes expired artefacts, oldest first. */
  deleteExpiredArtefacts(options?: { now?: Date; limit?: number }): Promise<number>;
  /** Closes the pool. Only on the store that `createStore` returned. */
  destroy(): Promise<void>;
}

export class StoreUsageError extends Error {
  override name = 'StoreUsageError';
}

export interface StoreOptions {
  databaseUrl: string;
  /** Maximum pool connections. Defaults to 10. */
  maxConnections?: number;
}

export function createStore(options: StoreOptions): Store {
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        connectionString: options.databaseUrl,
        max: options.maxConnections ?? 10,
      }),
    }),
  });
  return storeOver(db, false);
}

function orgFilter(table: string, orgId: string) {
  return sql<boolean>`${sql.ref(`${table}.org_id`)} = ${orgId}`;
}

function scopeFor(db: Kysely<DB>, orgId: string): TenantScope {
  if (typeof orgId !== 'string' || orgId === '') {
    throw new StoreUsageError('forOrg needs an org id.');
  }
  // Kysely cannot type a column reference on a generic table, so the builders below are built on
  // an untyped view and given back their precise types. The org filter is the only addition.
  const untyped = db as unknown as Kysely<Record<string, Record<string, unknown>>>;
  return {
    orgId,
    selectFrom(table) {
      return untyped
        .selectFrom(table as string)
        .where(orgFilter(table, orgId)) as unknown as SelectQueryBuilder<
        DB,
        typeof table,
        NoSelection
      >;
    },
    insertInto(table, values) {
      const rows = (Array.isArray(values) ? values : [values]) as Record<string, unknown>[];
      // `org_id` is overwritten even if a caller smuggled one past the types.
      const scoped = rows.map((row) => ({ ...row, org_id: orgId }));
      return untyped.insertInto(table as string).values(scoped) as unknown as InsertQueryBuilder<
        DB,
        typeof table,
        InsertResult
      >;
    },
    update(table, values) {
      if (Object.hasOwn(values, 'org_id')) {
        throw new StoreUsageError('A row cannot move to another org: org_id is not updatable.');
      }
      return untyped
        .updateTable(table as string)
        .set(values as Record<string, unknown>)
        .where(orgFilter(table, orgId)) as unknown as UpdateQueryBuilder<
        DB,
        typeof table,
        typeof table,
        UpdateResult
      >;
    },
    deleteFrom(table) {
      return untyped
        .deleteFrom(table as string)
        .where(orgFilter(table, orgId)) as unknown as DeleteQueryBuilder<
        DB,
        typeof table,
        DeleteResult
      >;
    },
  };
}

function instanceScope(db: Kysely<DB>): InstanceScope {
  return {
    selectFrom: (table) => db.selectFrom(table),
    insertInto: (table) => db.insertInto(table),
    updateTable: (table) => db.updateTable(table),
    deleteFrom: (table) => db.deleteFrom(table),
  } as InstanceScope;
}

/**
 * The Kysely executor behind each Store, for this package's own adapters (the queue runs
 * `graphile_worker.add_job` in the caller's transaction). Not exported from the package.
 */
const executors = new WeakMap<Store, Kysely<DB>>();

/** @internal The executor of a Store created by this package. */
export function executorOf(store: Store): Kysely<DB> {
  const db = executors.get(store);
  if (db === undefined) {
    throw new StoreUsageError('This Store was not created by createStore.');
  }
  return db;
}

function storeOver(db: Kysely<DB>, inTransaction: boolean): Store {
  const store = buildStore(db, inTransaction);
  executors.set(store, db);
  return store;
}

function buildStore(db: Kysely<DB>, inTransaction: boolean): Store {
  return {
    forOrg: (orgId) => scopeFor(db, orgId),
    instance: instanceScope(db),
    async transaction(fn) {
      if (inTransaction) {
        throw new StoreUsageError(
          'Nested transactions are not supported; use the outer transaction.',
        );
      }
      return db.transaction().execute((trx) => fn(storeOver(trx, true)));
    },
    async allowAuditDelete(reason) {
      if (!inTransaction) {
        throw new StoreUsageError('allowAuditDelete only works inside store.transaction().');
      }
      if (reason !== 'retention' && reason !== 'org_purge') {
        throw new StoreUsageError('Unknown audit delete reason.');
      }
      await sql`select set_config('jury_forge.audit_delete', ${reason}, true)`.execute(db);
    },
    async deleteExpiredArtefacts(options = {}) {
      const now = options.now ?? new Date();
      const limit = options.limit ?? 1000;
      const result = await db
        .deleteFrom('artefacts')
        .where('id', 'in', (eb) =>
          eb
            .selectFrom('artefacts')
            .select('id')
            .where('expires_at', '<=', now)
            .orderBy('expires_at')
            .limit(limit),
        )
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },
    async destroy() {
      if (inTransaction) {
        throw new StoreUsageError('destroy() belongs to the store createStore returned.');
      }
      await db.destroy();
    },
  };
}
