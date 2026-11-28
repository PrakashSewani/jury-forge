// Input checks of the graphile-worker adapter. They run before any database call, so the store
// below never connects (pg opens connections lazily).
import type { JobSpec } from '@jury-forge/contracts';
import { afterAll, describe, expect, it } from 'vitest';
import { GraphileJobQueue, QueueUsageError } from './queue.ts';
import { createStore } from './store.ts';

const databaseUrl = 'postgres://nobody@127.0.0.1:1/never';
const store = createStore({ databaseUrl, maxConnections: 1 });
const queue = () => new GraphileJobQueue(store, { databaseUrl });
const job = (overrides: Partial<JobSpec> = {}): JobSpec => ({
  task: 'test.turn',
  payload: { org_id: 'org-1', session_id: 's-1' },
  maxAttempts: 3,
  ...overrides,
});

afterAll(async () => {
  await store.destroy();
});

describe('GraphileJobQueue input checks', () => {
  it('refuses a payload without org_id (ADR-0035)', async () => {
    await expect(queue().enqueue(job({ payload: { org_id: '' } }))).rejects.toThrow(
      QueueUsageError,
    );
    await expect(queue().enqueue(job({ payload: {} as never }))).rejects.toThrow(/org_id/);
  });

  it('requires an explicit maxAttempts of at least 1 (spike S-A R7)', async () => {
    for (const maxAttempts of [0, -1, 1.5, Number.NaN]) {
      await expect(queue().enqueue(job({ maxAttempts }))).rejects.toThrow(/maxAttempts/);
    }
  });

  it('needs a serial key to coalesce, and a non-empty one', async () => {
    await expect(queue().enqueue(job({ coalesce: true }))).rejects.toThrow(/coalesce needs/);
    await expect(queue().enqueue(job({ serialKey: '' }))).rejects.toThrow(/serial key/);
    await expect(queue().cancel('')).rejects.toThrow(/serial key/);
    await expect(queue().enqueue(job({ task: '' }))).rejects.toThrow(/task/);
  });

  it('validates cron registrations against graphile-worker’s grammar', () => {
    const q = queue();
    expect(() => q.schedule('cron.retention', '0 3 * * *')).toThrow(/cron task name/);
    expect(() => q.schedule('cron:retention', '0 3 * *')).toThrow(/five fields/);
    q.schedule('cron:retention', '0 3 * * *');
    expect(() => q.schedule('cron:retention', '0 4 * * *')).toThrow(/already scheduled/);
  });

  it('refuses a duplicate or unnamed handler, and a cron task without one', async () => {
    const q = queue();
    q.onJob('test.turn', async () => {});
    expect(() => q.onJob('test.turn', async () => {})).toThrow(/already registered/);
    expect(() => q.onJob('', async () => {})).toThrow(/needs a name/);
    q.schedule('cron:orphan', '* * * * *');
    await expect(q.start()).rejects.toThrow(/no handler: cron:orphan/);
  });
});
