// WP 1-09: the tenant-scoped store, the audit guard, and the artefact repository against a real
// PostgreSQL 17 (security.md T-12, ADR-0035, data-model.md).
import { createHash } from 'node:crypto';
import { requireContainerRuntime, startPostgres } from '@jury-forge/testkit';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ARTEFACT_KINDS,
  ARTEFACT_MAX_BYTES,
  ArtefactError,
  getArtefact,
  putArtefact,
} from './artefacts.ts';
import { appendAudit } from './audit.ts';
import { migrate } from './migrations.ts';
import {
  createStore,
  type Store,
  StoreUsageError,
  TENANT_TABLES,
  type TenantScope,
} from './store.ts';

const runtime = await requireContainerRuntime();

let container: Awaited<ReturnType<typeof startPostgres>>;
let databaseCount = 0;

async function freshStore(): Promise<{ store: Store; url: string }> {
  const name = `wp109_${++databaseCount}`;
  const admin = new pg.Client({ connectionString: container.getConnectionUri() });
  await admin.connect();
  try {
    await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(container.getConnectionUri());
  url.pathname = `/${name}`;
  await migrate({ databaseUrl: url.toString() });
  return {
    store: createStore({ databaseUrl: url.toString(), maxConnections: 4 }),
    url: url.toString(),
  };
}

async function rawQuery(url: string, text: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await client.query(text, values);
  } finally {
    await client.end();
  }
}

function pgCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

async function twoOrgs(store: Store): Promise<{ a: TenantScope; b: TenantScope }> {
  const instanceOrg = await store.instance
    .selectFrom('orgs')
    .select('id')
    .executeTakeFirstOrThrow();
  const other = await store.instance
    .insertInto('orgs')
    .values({ slug: 'other' })
    .returning('id')
    .executeTakeFirstOrThrow();
  return { a: store.forOrg(instanceOrg.id), b: store.forOrg(other.id) };
}

async function addInstallation(scope: TenantScope, externalId: number): Promise<string> {
  const row = await scope
    .insertInto('installations', {
      forge: 'github',
      base_url: 'https://api.github.com',
      external_id: externalId,
      account_login: `acct-${externalId}`,
      account_type: 'organization',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

const inADay = () => new Date(Date.now() + 86_400_000);

describe.runIf(runtime)('tenant-scoped store (WP 1-09)', () => {
  beforeAll(async () => {
    container = await startPostgres();
  });
  afterAll(async () => {
    await container?.stop();
  });

  it('lists as tenant tables exactly the tables that have org_id', async () => {
    const { store, url } = await freshStore();
    try {
      const { rows } = await rawQuery(
        url,
        `select c.relname as name from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
         where n.nspname = 'public' and c.relkind = 'r' order by 1`,
      );
      expect([...TENANT_TABLES].sort()).toEqual(rows.map((row) => row.name));
    } finally {
      await store.destroy();
    }
  });

  it("reads only the scope's org", async () => {
    const { store } = await freshStore();
    try {
      const { a, b } = await twoOrgs(store);
      const aInstallation = await addInstallation(a, 1);
      const bInstallation = await addInstallation(b, 2);
      const seenByA = await a.selectFrom('installations').select(['id', 'org_id']).execute();
      const seenByB = await b.selectFrom('installations').select(['id', 'org_id']).execute();
      expect(seenByA).toEqual([{ id: aInstallation, org_id: a.orgId }]);
      expect(seenByB).toEqual([{ id: bInstallation, org_id: b.orgId }]);
    } finally {
      await store.destroy();
    }
  });

  it("cannot update or delete another org's row", async () => {
    const { store } = await freshStore();
    try {
      const { a, b } = await twoOrgs(store);
      const bInstallation = await addInstallation(b, 2);
      const updated = await a
        .update('installations', { account_login: 'taken-over' })
        .where('id', '=', bInstallation)
        .executeTakeFirst();
      expect(updated.numUpdatedRows).toBe(0n);
      const deleted = await a
        .deleteFrom('installations')
        .where('id', '=', bInstallation)
        .executeTakeFirst();
      expect(deleted.numDeletedRows).toBe(0n);
      const row = await b
        .selectFrom('installations')
        .select('account_login')
        .where('id', '=', bInstallation)
        .executeTakeFirstOrThrow();
      expect(row.account_login).toBe('acct-2');
    } finally {
      await store.destroy();
    }
  });

  it("writes the scope's org on insert, even when a caller smuggles another org_id", async () => {
    const { store } = await freshStore();
    try {
      const { a, b } = await twoOrgs(store);
      const smuggled = { actor_type: 'system', action: 'test.smuggle', org_id: b.orgId };
      const row = await a
        .insertInto('audit_events', smuggled as never)
        .returning('org_id')
        .executeTakeFirstOrThrow();
      expect(row.org_id).toBe(a.orgId);
      // @ts-expect-error org_id is supplied by the scope and is not part of the insert type.
      a.insertInto('audit_events', { actor_type: 'system', action: 'x', org_id: b.orgId });
    } finally {
      await store.destroy();
    }
  });

  it('refuses an update that would move a row to another org', async () => {
    const { store } = await freshStore();
    try {
      const { a, b } = await twoOrgs(store);
      expect(() => a.update('installations', { org_id: b.orgId } as never)).toThrow(
        StoreUsageError,
      );
      expect(() => store.forOrg('')).toThrow(StoreUsageError);
    } finally {
      await store.destroy();
    }
  });

  it("rejects, in the database, a child row that points at another org's parent", async () => {
    const { store } = await freshStore();
    try {
      const { a, b } = await twoOrgs(store);
      const bInstallation = await addInstallation(b, 2);
      const error = await a
        .insertInto('repositories', {
          installation_id: bInstallation,
          external_id: 10,
          full_name: 'acme/leak',
          private: false,
          default_branch: 'main',
        })
        .execute()
        .catch((e: unknown) => e);
      expect(pgCode(error)).toBe('23503');
    } finally {
      await store.destroy();
    }
  });

  it('commits a transaction that resolves, rolls back one that throws, and refuses nesting', async () => {
    const { store } = await freshStore();
    try {
      const { a } = await twoOrgs(store);
      await store.transaction(async (tx) => {
        await addInstallation(tx.forOrg(a.orgId), 1);
      });
      await expect(
        store.transaction(async (tx) => {
          await addInstallation(tx.forOrg(a.orgId), 2);
          throw new Error('roll back');
        }),
      ).rejects.toThrow('roll back');
      const rows = await a.selectFrom('installations').select('external_id').execute();
      expect(rows).toEqual([{ external_id: '1' }]);
      await expect(store.transaction((tx) => tx.transaction(async () => 1))).rejects.toThrow(
        StoreUsageError,
      );
    } finally {
      await store.destroy();
    }
  });

  it('keeps the audit log append-only unless a transaction names its delete reason', async () => {
    const { store, url } = await freshStore();
    try {
      const { a } = await twoOrgs(store);
      const id = await appendAudit(a, {
        actorType: 'user',
        actorId: 'octo',
        action: 'origin.set',
        before: null,
        after: ['https://review.example.test'],
        ip: '203.0.113.7',
      });
      const row = await a
        .selectFrom('audit_events')
        .select(['action', 'after', 'ip'])
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      expect(row).toEqual({
        action: 'origin.set',
        after: ['https://review.example.test'],
        ip: '203.0.113.7',
      });

      const update = await rawQuery(url, "update audit_events set action = 'x'").catch(
        (e: unknown) => e,
      );
      expect(pgCode(update)).toBe('JF001');
      const truncate = await rawQuery(url, 'truncate audit_events').catch((e: unknown) => e);
      expect(pgCode(truncate)).toBe('JF001');
      const unflagged = await a
        .deleteFrom('audit_events')
        .execute()
        .catch((e: unknown) => e);
      expect(pgCode(unflagged)).toBe('JF001');
      await expect(store.allowAuditDelete('retention')).rejects.toThrow(StoreUsageError);

      const deleted = await store.transaction(async (tx) => {
        await tx.allowAuditDelete('retention');
        return tx.forOrg(a.orgId).deleteFrom('audit_events').executeTakeFirst();
      });
      expect(deleted.numDeletedRows).toBe(1n);

      // The flag is local to that transaction: the next delete is refused again.
      await appendAudit(a, { actorType: 'system', action: 'test.again' });
      const after = await a
        .deleteFrom('audit_events')
        .execute()
        .catch((e: unknown) => e);
      expect(pgCode(after)).toBe('JF001');
    } finally {
      await store.destroy();
    }
  });

  it('stores an artefact with its size and hash, and returns it only to its org before it expires', async () => {
    const { store } = await freshStore();
    try {
      const { a, b } = await twoOrgs(store);
      const bytes = new TextEncoder().encode('diff --git a/x b/x');
      const stored = await putArtefact(a, {
        kind: 'diff',
        bytes,
        redacted: true,
        expiresAt: inADay(),
      });
      expect(stored.size).toBe(bytes.byteLength);
      expect(stored.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      const read = await getArtefact(a, stored.id);
      expect(read?.bytes.equals(Buffer.from(bytes))).toBe(true);
      expect(read?.sha256).toBe(stored.sha256);
      expect(await getArtefact(b, stored.id)).toBeNull();
      expect(await getArtefact(a, stored.id, new Date(Date.now() + 2 * 86_400_000))).toBeNull();
    } finally {
      await store.destroy();
    }
  });

  it('accepts every artefact kind the schema allows and refuses oversize or already-expired bytes', async () => {
    const { store } = await freshStore();
    try {
      const { a } = await twoOrgs(store);
      for (const kind of ARTEFACT_KINDS) {
        await putArtefact(a, {
          kind,
          bytes: new Uint8Array([1]),
          redacted: false,
          expiresAt: inADay(),
        });
      }
      await expect(
        putArtefact(a, {
          kind: 'diff',
          bytes: new Uint8Array(ARTEFACT_MAX_BYTES + 1),
          redacted: false,
          expiresAt: inADay(),
        }),
      ).rejects.toThrow(ArtefactError);
      await expect(
        putArtefact(a, {
          kind: 'diff',
          bytes: new Uint8Array(1),
          redacted: false,
          expiresAt: new Date(0),
        }),
      ).rejects.toThrow(ArtefactError);
      const max = await putArtefact(a, {
        kind: 'export',
        bytes: new Uint8Array(ARTEFACT_MAX_BYTES),
        redacted: false,
        expiresAt: inADay(),
      });
      expect(max.size).toBe(ARTEFACT_MAX_BYTES);
    } finally {
      await store.destroy();
    }
  });

  it('deletes only expired artefacts, across orgs, and clears the references to them', async () => {
    const { store } = await freshStore();
    try {
      const { a, b } = await twoOrgs(store);
      const soon = new Date(Date.now() + 60_000);
      const expiring = await putArtefact(a, {
        kind: 'webhook_payload',
        bytes: new Uint8Array([1]),
        redacted: false,
        expiresAt: soon,
      });
      const otherOrg = await putArtefact(b, {
        kind: 'diff',
        bytes: new Uint8Array([2]),
        redacted: false,
        expiresAt: soon,
      });
      const kept = await putArtefact(a, {
        kind: 'diff',
        bytes: new Uint8Array([3]),
        redacted: false,
        expiresAt: inADay(),
      });
      await a
        .insertInto('webhook_deliveries', {
          delivery_id: 'd-1',
          event: 'pull_request',
          payload_artefact_id: expiring.id,
        })
        .execute();

      const removed = await store.deleteExpiredArtefacts({ now: new Date(Date.now() + 120_000) });
      expect(removed).toBe(2);
      expect(await getArtefact(a, kept.id)).not.toBeNull();
      expect(await getArtefact(b, otherOrg.id)).toBeNull();
      const delivery = await a
        .selectFrom('webhook_deliveries')
        .select('payload_artefact_id')
        .where('delivery_id', '=', 'd-1')
        .executeTakeFirstOrThrow();
      expect(delivery.payload_artefact_id).toBeNull();
    } finally {
      await store.destroy();
    }
  });
});
