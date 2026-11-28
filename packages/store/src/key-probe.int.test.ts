// WP 1-15a: the master-key probe row against a real PostgreSQL 17 (migration 0007).
import { requireContainerRuntime, startPostgres } from '@jury-forge/testkit';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureKeyProbe, readKeyProbe, type SealedRecord } from './key-probe.ts';
import { migrate } from './migrations.ts';
import { createStore, type Store } from './store.ts';

const runtime = await requireContainerRuntime();

let container: Awaited<ReturnType<typeof startPostgres>>;
let databaseCount = 0;

async function freshStore(): Promise<{ store: Store; url: string }> {
  const name = `wp115_probe_${++databaseCount}`;
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

const sealed = (tag: string): SealedRecord => ({
  ciphertext: Buffer.from(`ct-${tag}`),
  wrappedDek: Buffer.from(`dek-${tag}`),
  keyId: `k1-${tag}`,
});

describe.runIf(runtime)('key probe (WP 1-15a)', () => {
  beforeAll(async () => {
    container = await startPostgres();
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('is absent on a fresh instance, then written once and read back', async () => {
    const { store } = await freshStore();
    try {
      expect(await readKeyProbe(store)).toBeNull();
      const created: string[] = [];
      const first = await ensureKeyProbe(store, (orgId) => {
        created.push(orgId);
        return sealed('a');
      });
      expect(first).toMatchObject({ keyId: 'k1-a', orgId: created[0] });
      expect(first.ciphertext.toString()).toBe('ct-a');
      const again = await ensureKeyProbe(store, () => sealed('b'));
      expect(again.keyId).toBe('k1-a');
      expect(created).toHaveLength(1);
    } finally {
      await store.destroy();
    }
  });

  it('keeps exactly one probe when two processes start together', async () => {
    const { store, url } = await freshStore();
    const other = createStore({ databaseUrl: url, maxConnections: 2 });
    try {
      const [a, b] = await Promise.all([
        ensureKeyProbe(store, () => sealed('a')),
        ensureKeyProbe(other, () => sealed('b')),
      ]);
      expect(a.keyId).toBe(b.keyId);
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      try {
        const rows = await client.query(
          "select count(*)::int as n from secrets where kind = 'key_probe'",
        );
        expect(rows.rows[0].n).toBe(1);
        const dup = await client
          .query(
            "insert into secrets (org_id, kind, ciphertext, wrapped_dek, key_id) select id, 'key_probe', 'x', 'y', 'z' from orgs",
          )
          .catch((error: { code?: string }) => error.code);
        expect(dup).toBe('23505');
      } finally {
        await client.end();
      }
    } finally {
      await other.destroy();
      await store.destroy();
    }
  });
});
