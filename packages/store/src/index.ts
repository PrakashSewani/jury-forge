// Kysely repositories, SQL migrations, queue adapter (technical-approach §4).
// M1.1: the SQL migrations (WP 1-08), the tenant-scoped store with the artefact and audit
// repositories (WP 1-09), and the graphile-worker `JobQueue` adapter (WP 1-10).
// M1.2: the readiness checks behind `/readyz` (WP 1-13); the stored origin (WP 1-14); the master-key probe (WP 1-15a).
export {
  ARTEFACT_KINDS,
  ARTEFACT_MAX_BYTES,
  ArtefactError,
  type ArtefactKind,
  getArtefact,
  type NewArtefact,
  putArtefact,
  type StoredArtefact,
} from './artefacts.ts';
export { type AuditEvent, appendAudit } from './audit.ts';
export { DatabaseUrlError, type ReadFile, resolveDatabaseUrl } from './database-url.ts';
export type { DB } from './db.generated.ts';
export { ensureKeyProbe, type KeyProbe, readKeyProbe, type SealedRecord } from './key-probe.ts';
export {
  MIGRATIONS_DIR,
  MIGRATIONS_TABLE,
  type MigrateOptions,
  type MigrationDirection,
  migrate,
} from './migrations.ts';
export {
  instanceOrgId,
  ORIGIN_SETTING_KEY,
  OriginConflictError,
  type OriginSetting,
  OriginSettingError,
  type OriginWrite,
  readOriginSetting,
  writeOriginSetting,
} from './origin.ts';
export {
  FencedError,
  GraphileJobQueue,
  type GraphileJobQueueOptions,
  type QueueLogLevel,
  QueueUsageError,
  type ReleaseDeadWorkersOptions,
  type ReleasedPool,
  releaseDeadWorkers,
} from './queue.ts';
export {
  type ComponentState,
  checkReadiness,
  type ReadinessOptions,
  type StoreReadiness,
  shippedMigrations,
} from './readiness.ts';
export {
  type AuditDeleteReason,
  createStore,
  type InstanceScope,
  type InstanceTable,
  type Store,
  type StoreOptions,
  StoreUsageError,
  TENANT_TABLES,
  type TenantInsert,
  type TenantScope,
  type TenantTable,
  type TenantUpdate,
} from './store.ts';
export { createTurnStore } from './turns.ts';
