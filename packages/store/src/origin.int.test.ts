// WP 1-14: the stored origin and TLS mode against a real PostgreSQL 17 (ADR-0021, ADR-0036).
import { requireContainerRuntime, startPostgres } from '@jury-forge/testkit';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrations.ts';
import {
  instanceOrgId,
  OriginConflictError,
  OriginSettingError,
  readOriginSetting,
  writeOriginSetting,
} from './origin.ts';
import { createStore, type Store } from './store.ts';

const runtime = await requireContainerRuntime();

let container: Awaited<ReturnType<typeof startPostgres>>;
let databaseCount = 0;

async function freshStore(): Promise<{ store: Store; url: string }> {
  const name = `wp114_${++databaseCount}`;
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

async function auditActions(
  url: string,
): Promise<{ action: string; before: unknown; after: unknown }[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query(
      "select action, before, after from audit_events where target_id = 'origin' order by at, id",
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

const bootstrap = { type: 'bootstrap' };

describe.runIf(runtime)('origin setting (WP 1-14)', () => {
  beforeAll(async () => {
    container = await startPostgres();
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('is absent on a fresh instance', async () => {
    const { store } = await freshStore();
    try {
      expect(await readOriginSetting(store)).toBeNull();
      expect(await instanceOrgId(store)).toEqual(expect.any(String));
    } finally {
      await store.destroy();
    }
  });

  it('sets, changes, and switches mode with a compare-and-set and an audit event each', async () => {
    const { store, url } = await freshStore();
    try {
      const v1 = await writeOriginSetting(store, {
        url: 'https://review.example.com',
        tlsMode: 'caddy',
        expectedVersion: null,
        actor: bootstrap,
        ip: '127.0.0.1',
      });
      expect(v1).toBe(1);
      expect(await readOriginSetting(store)).toEqual({
        url: 'https://review.example.com',
        tlsMode: 'caddy',
        version: 1,
      });

      const v2 = await writeOriginSetting(store, {
        url: 'https://jury.example.org',
        tlsMode: 'front',
        expectedVersion: 1,
        actor: { type: 'user', id: 'u-1' },
      });
      expect(v2).toBe(2);

      // The same values again: a new version, but nothing changed, so nothing is audited.
      expect(
        await writeOriginSetting(store, {
          url: 'https://jury.example.org',
          tlsMode: 'front',
          expectedVersion: 2,
          actor: bootstrap,
        }),
      ).toBe(3);

      expect(await auditActions(url)).toEqual([
        { action: 'origin.set', before: null, after: { url: 'https://review.example.com' } },
        { action: 'origin.tls_mode_set', before: null, after: { tls_mode: 'caddy' } },
        {
          action: 'origin.changed',
          before: { url: 'https://review.example.com' },
          after: { url: 'https://jury.example.org' },
        },
        {
          action: 'origin.tls_mode_set',
          before: { tls_mode: 'caddy' },
          after: { tls_mode: 'front' },
        },
      ]);
    } finally {
      await store.destroy();
    }
  });

  it('stores a mode without a URL when PUBLIC_URL freezes the origin', async () => {
    const { store, url } = await freshStore();
    try {
      await writeOriginSetting(store, {
        url: null,
        tlsMode: 'front',
        expectedVersion: null,
        actor: bootstrap,
      });
      expect(await readOriginSetting(store)).toEqual({ url: null, tlsMode: 'front', version: 1 });
      expect((await auditActions(url)).map((row) => row.action)).toEqual(['origin.tls_mode_set']);
    } finally {
      await store.destroy();
    }
  });

  it('refuses a stale version and a racing first write, and writes nothing', async () => {
    const { store, url } = await freshStore();
    try {
      const first = {
        url: 'https://review.example.com',
        tlsMode: 'caddy' as const,
        actor: bootstrap,
      };
      const results = await Promise.allSettled([
        writeOriginSetting(store, { ...first, expectedVersion: null }),
        writeOriginSetting(store, {
          ...first,
          url: 'https://other.example.com',
          expectedVersion: null,
        }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
      const rejected = results.find((result) => result.status === 'rejected');
      expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(OriginConflictError);

      await expect(
        writeOriginSetting(store, { ...first, expectedVersion: 7 }),
      ).rejects.toBeInstanceOf(OriginConflictError);
      await expect(
        writeOriginSetting(store, { ...first, expectedVersion: null }),
      ).rejects.toBeInstanceOf(OriginConflictError);
      expect((await readOriginSetting(store))?.version).toBe(1);
      expect(await auditActions(url)).toHaveLength(2);
    } finally {
      await store.destroy();
    }
  });

  it('refuses a non-canonical URL or an unknown mode on write and on read', async () => {
    const { store, url } = await freshStore();
    try {
      for (const bad of [
        'https://Review.example.com',
        'https://review.example.com/',
        'http://a.example',
      ]) {
        await expect(
          writeOriginSetting(store, {
            url: bad,
            tlsMode: 'caddy',
            expectedVersion: null,
            actor: bootstrap,
          }),
        ).rejects.toBeInstanceOf(OriginSettingError);
      }
      await expect(
        writeOriginSetting(store, {
          url: 'https://review.example.com',
          tlsMode: 'tunnel' as never,
          expectedVersion: null,
          actor: bootstrap,
        }),
      ).rejects.toBeInstanceOf(OriginSettingError);

      const client = new pg.Client({ connectionString: url });
      await client.connect();
      try {
        await client.query(
          `insert into instance_settings (org_id, key, value)
           select id, 'origin', '{"url":"https://evil.example.com/x","tls_mode":"caddy"}' from orgs`,
        );
      } finally {
        await client.end();
      }
      await expect(readOriginSetting(store)).rejects.toBeInstanceOf(OriginSettingError);
    } finally {
      await store.destroy();
    }
  });
});
