// WP 1-11: the TurnStore implementation against a real PostgreSQL 17.
import { requireContainerRuntime, startPostgres } from '@jury-forge/testkit';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrations.ts';
import { createStore, type Store, type TenantScope } from './store.ts';
import { createTurnStore } from './turns.ts';

const runtime = await requireContainerRuntime();

let container: Awaited<ReturnType<typeof startPostgres>>;
let databaseCount = 0;

async function freshStore(): Promise<Store> {
  const name = `wp111_${++databaseCount}`;
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
  return createStore({ databaseUrl: url.toString(), maxConnections: 4 });
}

async function session(scope: TenantScope, generation = 0): Promise<string> {
  const installation = await scope
    .insertInto('installations', {
      forge: 'github',
      base_url: 'https://api.github.com',
      external_id: 1,
      account_login: 'acme',
      account_type: 'organization',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const repository = await scope
    .insertInto('repositories', {
      installation_id: installation.id,
      external_id: 10,
      full_name: 'acme/app',
      private: true,
      default_branch: 'main',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const row = await scope
    .insertInto('pr_sessions', {
      installation_id: installation.id,
      repository_id: repository.id,
      pr_number: 7,
      generation,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

async function addTurn(
  scope: TenantScope,
  sessionId: string,
  generation: number,
  status = 'queued',
) {
  const row = await scope
    .insertInto('session_turns', { session_id: sessionId, generation, trigger: 'label', status })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

describe.runIf(runtime)('TurnStore (WP 1-11)', () => {
  beforeAll(async () => {
    container = await startPostgres();
  });
  afterAll(async () => {
    await container?.stop();
  });

  it('loads a turn only in its org, and reads the session generation', async () => {
    const store = await freshStore();
    try {
      const orgId = (await store.instance.selectFrom('orgs').select('id').executeTakeFirstOrThrow())
        .id;
      const other = await store.instance
        .insertInto('orgs')
        .values({ slug: 'other' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const scope = store.forOrg(orgId);
      const sessionId = await session(scope, 4);
      const turnId = await addTurn(scope, sessionId, 4);
      const turns = createTurnStore(store);
      expect(await turns.loadTurn(orgId, turnId)).toEqual({
        orgId,
        turnId,
        sessionId,
        generation: 4,
        status: 'queued',
      });
      expect(await turns.loadTurn(other.id, turnId)).toBeNull();
      expect(await turns.sessionGeneration(orgId, sessionId)).toBe(4);
      expect(await turns.sessionGeneration(other.id, sessionId)).toBeNull();
    } finally {
      await store.destroy();
    }
  });

  it('begins a turn once, keeps its first start time, and never reopens a finished one', async () => {
    const store = await freshStore();
    try {
      const orgId = (await store.instance.selectFrom('orgs').select('id').executeTakeFirstOrThrow())
        .id;
      const scope = store.forOrg(orgId);
      const turnId = await addTurn(scope, await session(scope), 0);
      const turns = createTurnStore(store);
      expect(await turns.beginTurn(orgId, turnId)).toBe(true);
      const first = await scope
        .selectFrom('session_turns')
        .select('started_at')
        .where('id', '=', turnId)
        .executeTakeFirstOrThrow();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(await turns.beginTurn(orgId, turnId)).toBe(true); // a retry of the same turn
      const second = await scope
        .selectFrom('session_turns')
        .select('started_at')
        .where('id', '=', turnId)
        .executeTakeFirstOrThrow();
      expect(second.started_at).toEqual(first.started_at);
      expect(await turns.finishTurn(orgId, turnId, 'completed', null)).toBe(true);
      expect(await turns.beginTurn(orgId, turnId)).toBe(false);
      expect(await turns.finishTurn(orgId, turnId, 'failed', 'late')).toBe(false);
    } finally {
      await store.destroy();
    }
  });

  it('keeps the first recorded step, keeps JSON arrays, and sums step tokens into the turn', async () => {
    const store = await freshStore();
    try {
      const orgId = (await store.instance.selectFrom('orgs').select('id').executeTakeFirstOrThrow())
        .id;
      const scope = store.forOrg(orgId);
      const turnId = await addTurn(scope, await session(scope), 0, 'running');
      const turns = createTurnStore(store);
      const first = { step: 'fetch', inputHash: 'h1', output: ['a', { b: 1 }], tokens: 100, ms: 5 };
      expect(await turns.recordStep(orgId, turnId, first)).toEqual(first);
      expect(
        await turns.recordStep(orgId, turnId, { ...first, output: 'second', tokens: 1 }),
      ).toEqual(first);
      await turns.recordStep(orgId, turnId, {
        step: 'plan',
        inputHash: 'h2',
        output: null,
        tokens: 23,
        ms: 1,
      });
      expect(await turns.readStep(orgId, turnId, 'plan')).toEqual({
        step: 'plan',
        inputHash: 'h2',
        output: null,
        tokens: 23,
        ms: 1,
      });
      expect(await turns.readStep(orgId, turnId, 'missing')).toBeNull();
      await turns.finishTurn(orgId, turnId, 'completed', null);
      const row = await scope
        .selectFrom('session_turns')
        .select(['status', 'stop_reason', 'tokens', 'finished_at'])
        .where('id', '=', turnId)
        .executeTakeFirstOrThrow();
      expect(row).toMatchObject({ status: 'completed', stop_reason: null, tokens: '123' });
      expect(row.finished_at).toBeInstanceOf(Date);
    } finally {
      await store.destroy();
    }
  });

  it('closes only older unfinished turns: coalesced, generation moved, or orphaned (spike S-A R2)', async () => {
    const store = await freshStore();
    try {
      const orgId = (await store.instance.selectFrom('orgs').select('id').executeTakeFirstOrThrow())
        .id;
      const scope = store.forOrg(orgId);
      const sessionId = await session(scope, 2);
      const queuedOld = await addTurn(scope, sessionId, 2, 'queued');
      const runningOldGeneration = await addTurn(scope, sessionId, 1, 'running');
      const runningSameGeneration = await addTurn(scope, sessionId, 2, 'running');
      const finishedOld = await addTurn(scope, sessionId, 2, 'completed');
      const current = await addTurn(scope, sessionId, 2, 'running');
      const newer = await addTurn(scope, sessionId, 2, 'queued');
      const turns = createTurnStore(store);
      const turn = await turns.loadTurn(orgId, current);
      expect(await turns.closeOlderTurns(orgId, turn as NonNullable<typeof turn>)).toBe(3);
      const rows = await scope
        .selectFrom('session_turns')
        .select(['id', 'status', 'stop_reason'])
        .execute();
      const byId = new Map(rows.map((r) => [r.id, [r.status, r.stop_reason]]));
      expect(byId.get(queuedOld)).toEqual(['superseded', 'coalesced']);
      expect(byId.get(runningOldGeneration)).toEqual(['superseded', 'generation_moved']);
      expect(byId.get(runningSameGeneration)).toEqual(['failed', 'orphaned']);
      expect(byId.get(finishedOld)).toEqual(['completed', null]);
      expect(byId.get(current)).toEqual(['running', null]);
      expect(byId.get(newer)).toEqual(['queued', null]);
    } finally {
      await store.destroy();
    }
  });
});
