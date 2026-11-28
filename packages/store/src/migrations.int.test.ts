// WP 1-08: the MVP schema migrations against a real PostgreSQL 17 (technical-approach §3.2, §17).
import { requireContainerRuntime, startPostgres } from '@jury-forge/testkit';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_TABLE, migrate } from './migrations.ts';

const runtime = await requireContainerRuntime();

/** The MVP tables of technical-approach §17, plus `worker_heartbeats` (ADR-0037). */
const MVP_TABLES = [
  'orgs',
  'users',
  'user_sessions',
  'instance_settings',
  'secrets',
  'installations',
  'repositories',
  'webhook_deliveries',
  'providers',
  'provider_models',
  'model_probes',
  'reviewers',
  'reviewer_versions',
  'reviewer_repo_bindings',
  'pr_sessions',
  'session_threads',
  'session_messages',
  'message_versions',
  'session_turns',
  'turn_steps',
  'session_findings',
  'finding_fingerprints',
  'coverage_manifests',
  'resolutions',
  'finding_feedback',
  'budgets',
  'usage_rollups',
  'audit_events',
  'artefacts',
  'worker_heartbeats',
].sort();

/**
 * Tables without `org_id`: the tenant root, instance-level identity (ADR-0035), worker liveness
 * (ADR-0037), and the migration bookkeeping table. graphile-worker's schema is not in `public`.
 */
const NO_ORG_ID = new Set([
  'orgs',
  'users',
  'user_sessions',
  'worker_heartbeats',
  MIGRATIONS_TABLE,
]);

const MIGRATIONS = [
  '0001_foundation',
  '0002_forge',
  '0003_providers_reviewers',
  '0004_sessions',
  '0005_budgets_usage',
  '0006_audit_append_only',
  '0007_key_probe',
];

const PG_MIGRATE_LOCK_ID = '7241865325823964';

let container: Awaited<ReturnType<typeof startPostgres>>;
let databaseCount = 0;

async function freshDatabase(): Promise<string> {
  const name = `wp108_${++databaseCount}`;
  const admin = new pg.Client({ connectionString: container.getConnectionUri() });
  await admin.connect();
  try {
    await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(container.getConnectionUri());
  url.pathname = `/${name}`;
  return url.toString();
}

async function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function migratedDatabase(): Promise<string> {
  const url = await freshDatabase();
  await migrate({ databaseUrl: url });
  return url;
}

async function publicTables(client: pg.Client): Promise<string[]> {
  const { rows } = await client.query<{ name: string }>(
    `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`,
  );
  return rows.map((row) => row.name);
}

/** Tables that break ADR-0035: no `org_id`, a nullable or non-uuid one, or one that does not reference orgs. */
async function tenantKeyViolations(client: pg.Client): Promise<string[]> {
  const { rows } = await client.query<{
    table_name: string;
    has_org_id: boolean;
    not_null: boolean | null;
    type: string | null;
    references_orgs: boolean;
  }>(
    `select c.relname as table_name,
            a.attnum is not null as has_org_id,
            a.attnotnull as not_null,
            format_type(a.atttypid, a.atttypmod) as type,
            exists (
              select 1 from pg_constraint fk
              where fk.conrelid = c.oid and fk.contype = 'f'
                and fk.confrelid = 'public.orgs'::regclass and fk.conkey = array[a.attnum]
            ) as references_orgs
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     left join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind in ('r', 'p')
     order by 1`,
  );
  return rows
    .filter((row) => !NO_ORG_ID.has(row.table_name))
    .filter(
      (row) => !row.has_org_id || !row.not_null || row.type !== 'uuid' || !row.references_orgs,
    )
    .map((row) => row.table_name);
}

/** Foreign keys between two tenant-owned tables that do not lead with `org_id` on both sides. */
async function nonCompositeTenantKeys(client: pg.Client): Promise<string[]> {
  const { rows } = await client.query<{
    name: string;
    source: string;
    target: string;
    source_cols: string[];
    target_cols: string[];
  }>(
    `select fk.conname as name, src.relname as source, dst.relname as target,
            array(select a.attname::text from unnest(fk.conkey) with ordinality k(attnum, ord)
                  join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = k.attnum order by k.ord) as source_cols,
            array(select a.attname::text from unnest(fk.confkey) with ordinality k(attnum, ord)
                  join pg_attribute a on a.attrelid = fk.confrelid and a.attnum = k.attnum order by k.ord) as target_cols
     from pg_constraint fk
     join pg_class src on src.oid = fk.conrelid
     join pg_class dst on dst.oid = fk.confrelid
     join pg_namespace n on n.oid = src.relnamespace
     where fk.contype = 'f' and n.nspname = 'public'`,
  );
  return rows
    .filter((row) => !NO_ORG_ID.has(row.source) && !NO_ORG_ID.has(row.target))
    .filter((row) => row.source_cols[0] !== 'org_id' || row.target_cols[0] !== 'org_id')
    .map((row) => `${row.source}.${row.name}`);
}

/** Columns, constraints, indexes, and functions of `public`, for comparing two schemas. */
async function schemaSnapshot(client: pg.Client): Promise<string[]> {
  const { rows } = await client.query<{ entry: string }>(
    `select 'column ' || table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' '
              || coalesce(column_default, '') as entry
       from information_schema.columns where table_schema = 'public' and table_name <> $1
     union all
     select 'constraint ' || conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid)
       from pg_constraint where connamespace = 'public'::regnamespace and conrelid::regclass::text <> $1
     union all
     select 'index ' || indexdef from pg_indexes where schemaname = 'public' and tablename <> $1
     union all
     select 'function ' || p.proname || ' ' || md5(pg_get_functiondef(p.oid))
       from pg_proc p where p.pronamespace = 'public'::regnamespace
     union all
     select 'trigger ' || pg_get_triggerdef(t.oid)
       from pg_trigger t join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal
     order by 1`,
    [MIGRATIONS_TABLE],
  );
  return rows.map((row) => row.entry);
}

async function insert(
  client: pg.Client,
  table: string,
  row: Record<string, unknown>,
): Promise<string> {
  const columns = Object.keys(row);
  const values = Object.values(row);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const returning =
    table === 'turn_steps' ||
    table === 'finding_fingerprints' ||
    table === 'usage_rollups' ||
    table === 'instance_settings'
      ? 'org_id'
      : 'id';
  const { rows } = await client.query<{ value: string }>(
    `insert into ${table} (${columns.join(', ')}) values (${placeholders}) returning ${returning} as value`,
    values,
  );
  const value = rows[0]?.value;
  if (value === undefined) throw new Error(`insert into ${table} returned nothing`);
  return value;
}

/** One row in every tenant-owned table for `org`, linked the way the product links them. */
async function populateOrg(client: pg.Client, org: string): Promise<Record<string, string>> {
  const hash = Buffer.alloc(32, 1);
  const user = await insert(client, 'users', { github_id: 4242, login: 'octo' });
  await insert(client, 'user_sessions', {
    user_id: user,
    token_hash: hash,
    idle_expires_at: new Date(Date.now() + 3_600_000),
    absolute_expires_at: new Date(Date.now() + 86_400_000),
  });
  const secret = await insert(client, 'secrets', {
    org_id: org,
    kind: 'provider_api_key',
    ciphertext: Buffer.from('c'),
    wrapped_dek: Buffer.from('d'),
    key_id: 'k1',
  });
  const artefact = await insert(client, 'artefacts', {
    org_id: org,
    kind: 'webhook_payload',
    bytes: Buffer.from('{}'),
    size: 2,
    sha256: hash,
    redacted: false,
    expires_at: new Date(Date.now() + 86_400_000),
  });
  await insert(client, 'instance_settings', {
    org_id: org,
    key: 'public_url',
    value: JSON.stringify('https://review.example.test'),
  });
  await insert(client, 'audit_events', {
    org_id: org,
    actor_type: 'system',
    action: 'test.populate',
  });
  const installation = await insert(client, 'installations', {
    org_id: org,
    forge: 'github',
    base_url: 'https://api.github.com',
    external_id: 1,
    account_login: 'acme',
    account_type: 'organization',
  });
  const repository = await insert(client, 'repositories', {
    org_id: org,
    installation_id: installation,
    external_id: 10,
    full_name: 'acme/app',
    private: true,
    default_branch: 'main',
  });
  await insert(client, 'webhook_deliveries', {
    org_id: org,
    installation_id: installation,
    delivery_id: `d-${org}`,
    event: 'pull_request',
    payload_artefact_id: artefact,
  });
  const provider = await insert(client, 'providers', {
    org_id: org,
    kind: 'openai_compatible',
    name: 'p',
    base_url: 'https://api.example.test/v1',
    allowed_origin: 'https://api.example.test',
    secret_id: secret,
  });
  const model = await insert(client, 'provider_models', {
    org_id: org,
    provider_id: provider,
    model_id: 'm',
    source: 'discovered',
  });
  await insert(client, 'model_probes', {
    org_id: org,
    provider_model_id: model,
    endpoint: '/chat/completions',
    probe_version: 1,
    sdk_version: 'test',
    status: 'passed',
    chosen_mode: 'forced_tool',
    triggered_by: 'bind',
    actor_id: user,
  });
  const reviewer = await insert(client, 'reviewers', {
    org_id: org,
    slug: 'security',
    name: 'Security',
    role: 'security',
  });
  const version = await insert(client, 'reviewer_versions', {
    org_id: org,
    reviewer_id: reviewer,
    version: 1,
    prompt_hash: 'h',
    model_role: 'reasoning',
    provider_model_id: model,
    content_hash: 'c',
  });
  await insert(client, 'reviewer_repo_bindings', {
    org_id: org,
    repository_id: repository,
    reviewer_id: reviewer,
    reviewer_version_id: version,
    enabled: true,
    selection: 'required',
  });
  const session = await insert(client, 'pr_sessions', {
    org_id: org,
    installation_id: installation,
    repository_id: repository,
    pr_number: 7,
  });
  const thread = await insert(client, 'session_threads', {
    org_id: org,
    session_id: session,
    created_by: 'agent',
    owner_reviewer_id: reviewer,
  });
  const turn = await insert(client, 'session_turns', {
    org_id: org,
    session_id: session,
    generation: 0,
    trigger: 'label',
  });
  await insert(client, 'turn_steps', {
    org_id: org,
    turn_id: turn,
    step: 'resolve',
    input_hash: 'i',
  });
  const message = await insert(client, 'session_messages', {
    org_id: org,
    session_id: session,
    thread_id: thread,
    role: 'agent',
    reviewer_version_id: version,
  });
  await insert(client, 'message_versions', {
    org_id: org,
    session_message_id: message,
    body_hash: 'b',
    body: 'hello',
    answered_by_turn_id: turn,
  });
  const finding = await insert(client, 'session_findings', {
    org_id: org,
    session_id: session,
    thread_id: thread,
    turn_id: turn,
    reviewer_version_id: version,
    fingerprint: 'f',
    category: 'security',
    severity: 'high',
    file: 'src/a.ts',
  });
  await insert(client, 'finding_fingerprints', {
    org_id: org,
    repository_id: repository,
    fingerprint: 'f',
    category: 'security',
    path: 'src/a.ts',
    first_seen_turn_id: turn,
    last_state: 'open',
  });
  await insert(client, 'coverage_manifests', {
    org_id: org,
    turn_id: turn,
    files: JSON.stringify([]),
  });
  await insert(client, 'resolutions', {
    org_id: org,
    thread_id: thread,
    actor_type: 'user',
    actor_id: 'octo',
    mode: 'suggest',
  });
  await insert(client, 'finding_feedback', {
    org_id: org,
    finding_id: finding,
    user_id: user,
    source: 'button',
    verdict: 'helpful',
  });
  await insert(client, 'budgets', {
    org_id: org,
    scope_type: 'repo',
    scope_id: repository,
    period: 'turn',
    token_limit: 1000,
    action: 'block',
  });
  await insert(client, 'usage_rollups', {
    org_id: org,
    scope_type: 'repo',
    scope_id: repository,
    period_start: new Date(),
    tokens: 1,
  });
  return { user, installation, repository, version };
}

async function rowsPerTenantTable(client: pg.Client, org: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of (await publicTables(client)).filter((name) => !NO_ORG_ID.has(name))) {
    const { rows } = await client.query<{ n: number }>(
      `select count(*)::int as n from ${table} where org_id = $1`,
      [org],
    );
    counts[table] = rows[0]?.n ?? 0;
  }
  return counts;
}

function pgCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

describe.runIf(runtime)('MVP schema migrations (WP 1-08)', () => {
  beforeAll(async () => {
    container = await startPostgres();
  });
  afterAll(async () => {
    await container?.stop();
  });

  it('applies every migration in order on a fresh database and creates the MVP tables', async () => {
    const url = await freshDatabase();
    expect(await migrate({ databaseUrl: url })).toEqual(MIGRATIONS);
    expect(await migrate({ databaseUrl: url })).toEqual([]);
    await withClient(url, async (client) => {
      expect(await publicTables(client)).toEqual([...MVP_TABLES, MIGRATIONS_TABLE].sort());
    });
  });

  it('creates exactly one unclaimed instance org (ADR-0035 decision 5)', async () => {
    const url = await migratedDatabase();
    await withClient(url, async (client) => {
      const { rows } = await client.query<{ owner_user_id: string | null }>(
        'select owner_user_id from orgs',
      );
      expect(rows).toEqual([{ owner_user_id: null }]);
    });
  });

  it('gives every tenant-owned table a non-null org_id that references orgs, and the check catches one that does not', async () => {
    const url = await migratedDatabase();
    await withClient(url, async (client) => {
      expect(await tenantKeyViolations(client)).toEqual([]);
      await client.query('create table tenant_check_probe (id uuid primary key, org_id uuid)');
      expect(await tenantKeyViolations(client)).toEqual(['tenant_check_probe']);
    });
  });

  it('makes every foreign key between tenant-owned tables composite on org_id, and the check catches one that is not', async () => {
    const url = await migratedDatabase();
    await withClient(url, async (client) => {
      expect(await nonCompositeTenantKeys(client)).toEqual([]);
      await client.query(
        `create table fk_check_probe (
           id uuid primary key, org_id uuid not null references orgs (id),
           repository_id uuid references repositories (id))`,
      );
      expect(await nonCompositeTenantKeys(client)).toEqual([
        'fk_check_probe.fk_check_probe_repository_id_fkey',
      ]);
    });
  });

  it("rejects a child row that points at another org's parent", async () => {
    const url = await migratedDatabase();
    await withClient(url, async (client) => {
      const instanceOrg = (await client.query<{ id: string }>('select id from orgs')).rows[0]?.id;
      const otherOrg = await insert(client, 'orgs', { slug: 'other' });
      const { installation } = await populateOrg(client, otherOrg);
      const error = await insert(client, 'repositories', {
        org_id: instanceOrg,
        installation_id: installation,
        external_id: 99,
        full_name: 'acme/leak',
        private: false,
        default_branch: 'main',
      }).catch((e: unknown) => e);
      expect(pgCode(error)).toBe('23503');
    });
  });

  it('deletes every row an org owns when the org is deleted, and nothing else', async () => {
    const url = await migratedDatabase();
    await withClient(url, async (client) => {
      const instanceOrg = (await client.query<{ id: string }>('select id from orgs')).rows[0]
        ?.id as string;
      const org = await insert(client, 'orgs', { slug: 'doomed' });
      const { user } = await populateOrg(client, org);
      const before = await rowsPerTenantTable(client, org);
      expect(Object.entries(before).filter(([, n]) => n === 0)).toEqual([]);

      // Without the purge flag the audit guard (migration 0006) refuses the cascade.
      const refused = await client
        .query('delete from orgs where id = $1', [org])
        .catch((e: unknown) => e);
      expect(pgCode(refused)).toBe('JF001');

      await client.query('begin');
      await client.query("select set_config('jury_forge.audit_delete', 'org_purge', true)");
      await client.query('delete from orgs where id = $1', [org]);
      await client.query('commit');

      const after = await rowsPerTenantTable(client, org);
      expect(Object.entries(after).filter(([, n]) => n > 0)).toEqual([]);
      expect((await client.query('select 1 from users where id = $1', [user])).rowCount).toBe(1);
      expect((await client.query('select 1 from orgs where id = $1', [instanceOrg])).rowCount).toBe(
        1,
      );
    });
  });

  it('refuses to delete a reviewer version that history still references', async () => {
    const url = await migratedDatabase();
    await withClient(url, async (client) => {
      const org = await insert(client, 'orgs', { slug: 'history' });
      const { version } = await populateOrg(client, org);
      const error = await client
        .query('delete from reviewer_versions where id = $1', [version])
        .catch((e: unknown) => e);
      expect(pgCode(error)).toBe('23503');
    });
  });

  it('reverts every migration and reapplies them to an identical schema', async () => {
    const url = await migratedDatabase();
    const first = await withClient(url, schemaSnapshot);
    expect(first.length).toBeGreaterThan(100);

    expect(
      await migrate({ databaseUrl: url, direction: 'down', count: Number.POSITIVE_INFINITY }),
    ).toEqual([...MIGRATIONS].reverse());
    await withClient(url, async (client) => {
      expect(await publicTables(client)).toEqual([MIGRATIONS_TABLE]);
      expect(await schemaSnapshot(client)).toEqual([]);
    });

    expect(await migrate({ databaseUrl: url })).toEqual(MIGRATIONS);
    expect(await withClient(url, schemaSnapshot)).toEqual(first);
  });

  it('reverts one migration at a time down to an empty schema', async () => {
    const url = await migratedDatabase();
    for (const name of [...MIGRATIONS].reverse()) {
      expect(await migrate({ databaseUrl: url, direction: 'down' })).toEqual([name]);
    }
    await withClient(url, async (client) => {
      expect(await publicTables(client)).toEqual([MIGRATIONS_TABLE]);
    });
  });

  it('generates UUIDv7 ids: version 7, variant 10, ordered by time, and the default for ids', async () => {
    const url = await migratedDatabase();
    await withClient(url, async (client) => {
      const first = (await client.query<{ id: string }>('select uuid_v7()::text as id')).rows[0]
        ?.id as string;
      await client.query('select pg_sleep(0.01)');
      const second = (await client.query<{ id: string }>('select uuid_v7()::text as id')).rows[0]
        ?.id as string;
      for (const id of [first, second]) {
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      }
      expect(first < second).toBe(true);
      const millis = Number.parseInt(first.replace(/-/g, '').slice(0, 12), 16);
      expect(Math.abs(millis - Date.now())).toBeLessThan(60_000);
      const org = (await client.query<{ id: string }>('select id::text as id from orgs')).rows[0]
        ?.id as string;
      expect(org).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    });
  });

  it('caps an artefact at 2 MiB and checks its recorded size', async () => {
    const url = await migratedDatabase();
    await withClient(url, async (client) => {
      const org = (await client.query<{ id: string }>('select id from orgs')).rows[0]?.id;
      const row = (bytes: Buffer, size: number) => ({
        org_id: org,
        kind: 'diff',
        bytes,
        size,
        sha256: Buffer.alloc(32),
        redacted: true,
        expires_at: new Date(Date.now() + 86_400_000),
      });
      const max = Buffer.alloc(2_097_152);
      await expect(insert(client, 'artefacts', row(max, max.length))).resolves.toBeTypeOf('string');
      const over = Buffer.alloc(2_097_153);
      const tooBig = await insert(client, 'artefacts', row(over, over.length)).catch(
        (e: unknown) => e,
      );
      expect(pgCode(tooBig)).toBe('23514');
      expect((tooBig as { constraint?: string }).constraint).toBe('artefacts_size_cap');
      const lying = await insert(client, 'artefacts', row(Buffer.from('abc'), 1)).catch(
        (e: unknown) => e,
      );
      expect((lying as { constraint?: string }).constraint).toBe('artefacts_size_matches');
    });
  });

  it('fails fast instead of running while another migration holds the lock', async () => {
    const url = await freshDatabase();
    await withClient(url, async (holder) => {
      await holder.query(`select pg_advisory_lock(${PG_MIGRATE_LOCK_ID})`);
      await expect(migrate({ databaseUrl: url })).rejects.toThrow();
      await holder.query(`select pg_advisory_unlock(${PG_MIGRATE_LOCK_ID})`);
    });
    expect(await migrate({ databaseUrl: url })).toEqual(MIGRATIONS);
  });
});
