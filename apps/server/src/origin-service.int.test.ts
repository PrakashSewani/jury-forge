// WP 1-14: the effective origin, Caddy's ask, and the readiness states against a real PostgreSQL 17
// (ADR-0021, ADR-0036).
import { createStore, migrate, type Store, writeOriginSetting } from '@jury-forge/store';
import { requireContainerRuntime, startPostgres } from '@jury-forge/testkit';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ASK_BURST, OriginService } from './origin-service.ts';
import type { TlsProbe, TlsProbeResult } from './tls-probe.ts';

const runtime = await requireContainerRuntime();

let container: Awaited<ReturnType<typeof startPostgres>>;
let databaseCount = 0;

async function freshStore(): Promise<Store> {
  const name = `wp114_origin_${++databaseCount}`;
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
  return createStore({ databaseUrl: url.toString(), maxConnections: 2 });
}

const bootstrap = { type: 'bootstrap' };
const FROZEN = { url: 'https://frozen.example.com', host: 'frozen.example.com' };

function fakeProbe(results: TlsProbeResult[]): TlsProbe & { calls: string[] } {
  const calls: string[] = [];
  const probe = async (servername: string) => {
    calls.push(servername);
    return results[Math.min(calls.length - 1, results.length - 1)] as TlsProbeResult;
  };
  return Object.assign(probe, { calls });
}

const pending: TlsProbeResult = { issued: false, reason: 'ECONNRESET' };
const issued: TlsProbeResult = { issued: true, issuer: 'Test CA', validTo: 'Jan 1 2100' };

describe.runIf(runtime)('origin service (WP 1-14)', () => {
  beforeAll(async () => {
    container = await startPostgres();
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('is unset on a fresh instance: ask refuses, readiness says origin_unset', async () => {
    const store = await freshStore();
    try {
      const probe = fakeProbe([issued]);
      const service = new OriginService({ store, publicUrl: null, probe });
      expect(await service.current()).toEqual({ origin: null, frozen: false, tlsMode: 'caddy' });
      expect(await service.ask('review.example.com')).toBe('not_configured');
      expect(await service.readiness()).toEqual({
        state: 'origin_unset',
        frozen: false,
        tls_mode: 'caddy',
      });
      expect(probe.calls).toEqual([]);
    } finally {
      await store.destroy();
    }
  });

  it('uses the stored origin, caches it, and sees a write after invalidate()', async () => {
    const store = await freshStore();
    try {
      let now = 0;
      const service = new OriginService({
        store,
        publicUrl: null,
        probe: fakeProbe([pending]),
        now: () => now,
      });
      expect((await service.current()).origin).toBeNull();
      await writeOriginSetting(store, {
        url: 'https://review.example.com',
        tlsMode: 'caddy',
        expectedVersion: null,
        actor: bootstrap,
      });
      now = 4999;
      expect((await service.current()).origin).toBeNull(); // still cached
      service.invalidate();
      expect((await service.current()).origin).toEqual({
        url: 'https://review.example.com',
        host: 'review.example.com',
      });
    } finally {
      await store.destroy();
    }
  });

  it('ask allows only the origin, case- and dot-insensitively, ASK_BURST times per period', async () => {
    const store = await freshStore();
    try {
      await writeOriginSetting(store, {
        url: 'https://review.example.com',
        tlsMode: 'caddy',
        expectedVersion: null,
        actor: bootstrap,
      });
      let now = 1_000_000;
      const service = new OriginService({
        store,
        publicUrl: null,
        probe: fakeProbe([pending]),
        now: () => now,
      });
      expect(await service.ask('other.example.com')).toBe('other_name');
      expect(await service.ask('example.com')).toBe('other_name');
      expect(await service.ask('sub.review.example.com')).toBe('other_name');
      const decisions: string[] = [];
      for (let i = 0; i < ASK_BURST + 1; i += 1) {
        decisions.push(
          await service.ask(i % 2 === 0 ? 'Review.Example.COM' : 'review.example.com.'),
        );
      }
      expect(decisions).toEqual([...Array(ASK_BURST).fill('allow'), 'rate_limited']);
      // Refused names do not spend the budget; time refills it.
      now += 24_000;
      expect(await service.ask('review.example.com')).toBe('allow');
      expect(await service.ask('review.example.com')).toBe('rate_limited');
    } finally {
      await store.destroy();
    }
  });

  it('caddy mode: tls_pending until the probe sees a valid certificate, then tls_issued', async () => {
    const store = await freshStore();
    try {
      await writeOriginSetting(store, {
        url: 'https://review.example.com',
        tlsMode: 'caddy',
        expectedVersion: null,
        actor: bootstrap,
      });
      let now = 0;
      const probe = fakeProbe([pending, issued]);
      const service = new OriginService({ store, publicUrl: null, probe, now: () => now });
      expect(await service.readiness()).toEqual({
        state: 'tls_pending',
        frozen: false,
        tls_mode: 'caddy',
        reason: 'ECONNRESET',
      });
      now = 29_999;
      expect((await service.readiness()).state).toBe('tls_pending'); // cached, no second probe
      expect(probe.calls).toEqual(['review.example.com']);
      now = 30_000;
      expect(await service.readiness()).toEqual({
        state: 'tls_issued',
        frozen: false,
        tls_mode: 'caddy',
        issuer: 'Test CA',
        valid_to: 'Jan 1 2100',
      });
      now = 30_000 + 9 * 60_000;
      await service.readiness();
      expect(probe.calls).toHaveLength(2); // issued is reused for 10 minutes
    } finally {
      await store.destroy();
    }
  });

  it('front mode: ask refuses every name and readiness is tls_front_unverified', async () => {
    const store = await freshStore();
    try {
      await writeOriginSetting(store, {
        url: 'https://review.example.com',
        tlsMode: 'front',
        expectedVersion: null,
        actor: bootstrap,
      });
      const probe = fakeProbe([issued]);
      const service = new OriginService({ store, publicUrl: null, probe });
      expect(await service.ask('review.example.com')).toBe('front_mode');
      expect(await service.readiness()).toEqual({
        state: 'tls_front_unverified',
        frozen: false,
        tls_mode: 'front',
      });
      expect(probe.calls).toEqual([]);
    } finally {
      await store.destroy();
    }
  });

  it('PUBLIC_URL freezes the origin over the stored one; the stored mode still applies', async () => {
    const store = await freshStore();
    try {
      const probe = fakeProbe([issued]);
      const frozenOnly = new OriginService({ store, publicUrl: FROZEN, probe });
      expect(await frozenOnly.current()).toEqual({
        origin: FROZEN,
        frozen: true,
        tlsMode: 'caddy',
      });
      expect(await frozenOnly.ask('frozen.example.com')).toBe('allow');

      await writeOriginSetting(store, {
        url: 'https://review.example.com',
        tlsMode: 'front',
        expectedVersion: null,
        actor: bootstrap,
      });
      const service = new OriginService({ store, publicUrl: FROZEN, probe });
      expect(await service.current()).toEqual({ origin: FROZEN, frozen: true, tlsMode: 'front' });
      expect(await service.ask('review.example.com')).toBe('other_name');
      expect(await service.readiness()).toEqual({
        state: 'tls_front_unverified',
        frozen: true,
        tls_mode: 'front',
      });
    } finally {
      await store.destroy();
    }
  });
});
