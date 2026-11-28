// The stored public origin and its TLS mode (ADR-0021, ADR-0036): one row in `instance_settings`
// under the instance org, key `origin`. Every write is a compare-and-set on the row's version
// (first-run-setup invariant 1) and is audited in the same transaction: `origin.set` the first
// time, `origin.changed` when the URL moves, and `origin.tls_mode_set` when the mode is chosen or
// changes. `PUBLIC_URL` freezes the URL, not the mode, so the row can hold a mode without a URL.

import { parseOrigin, TLS_MODES, type TlsMode } from '@jury-forge/domain';
import { appendAudit } from './audit.ts';
import type { Store } from './store.ts';

export const ORIGIN_SETTING_KEY = 'origin';

export interface OriginSetting {
  /** Canonical `https://<host>`, or null when only the mode is stored (origin frozen by env). */
  url: string | null;
  tlsMode: TlsMode;
  /** The row's version, for the next compare-and-set. */
  version: number;
}

export interface OriginWrite {
  url: string | null;
  tlsMode: TlsMode;
  /** The version read before this write, or null when no row exists yet. */
  expectedVersion: number | null;
  actor: { type: string; id?: string | null };
  ip?: string | null;
  requestId?: string | null;
}

export class OriginSettingError extends Error {
  override name = 'OriginSettingError';
}

/** Another writer changed the setting since it was read; read it again and decide again. */
export class OriginConflictError extends OriginSettingError {
  override name = 'OriginConflictError';
}

/** v1 is one org per instance; the instance org is the one the first migration creates. */
export async function instanceOrgId(store: Store): Promise<string> {
  const row = await store.instance
    .selectFrom('orgs')
    .select('id')
    .orderBy('created_at')
    .orderBy('id')
    .limit(1)
    .executeTakeFirst();
  if (row === undefined) throw new OriginSettingError('The instance org is missing; run migrate.');
  return row.id;
}

export async function readOriginSetting(store: Store): Promise<OriginSetting | null> {
  const orgId = await instanceOrgId(store);
  const row = await store
    .forOrg(orgId)
    .selectFrom('instance_settings')
    .select(['value', 'version'])
    .where('key', '=', ORIGIN_SETTING_KEY)
    .executeTakeFirst();
  if (row === undefined) return null;
  return { ...decode(row.value), version: row.version };
}

/** Writes the setting with a compare-and-set and audits the change. Returns the new version. */
export async function writeOriginSetting(store: Store, write: OriginWrite): Promise<number> {
  const value = encode(write.url, write.tlsMode);
  return store.transaction(async (tx) => {
    const orgId = await instanceOrgId(tx);
    const scope = tx.forOrg(orgId);
    const current = await scope
      .selectFrom('instance_settings')
      .select(['value', 'version'])
      .where('key', '=', ORIGIN_SETTING_KEY)
      .forUpdate()
      .executeTakeFirst();
    const currentVersion = current?.version ?? null;
    if (currentVersion !== write.expectedVersion) {
      throw new OriginConflictError(
        `The origin setting is at version ${currentVersion}, not ${write.expectedVersion}.`,
      );
    }
    const before = current === undefined ? null : decode(current.value);
    let version: number;
    if (current === undefined) {
      try {
        await scope
          .insertInto('instance_settings', {
            key: ORIGIN_SETTING_KEY,
            value: JSON.stringify(value),
          })
          .execute();
      } catch (error) {
        // A concurrent first write won the primary key.
        if (isUniqueViolation(error)) {
          throw new OriginConflictError('The origin setting was created by another writer.');
        }
        throw error;
      }
      version = 1;
    } else {
      version = current.version + 1;
      await scope
        .update('instance_settings', {
          value: JSON.stringify(value),
          version,
          updated_at: new Date(),
        })
        .where('key', '=', ORIGIN_SETTING_KEY)
        .where('version', '=', current.version)
        .execute();
    }

    const audit = {
      actorType: write.actor.type,
      actorId: write.actor.id ?? null,
      targetType: 'instance_setting',
      targetId: ORIGIN_SETTING_KEY,
      ip: write.ip ?? null,
      requestId: write.requestId ?? null,
    };
    if ((before?.url ?? null) !== write.url) {
      await appendAudit(scope, {
        ...audit,
        action: before?.url == null ? 'origin.set' : 'origin.changed',
        before: before?.url == null ? null : { url: before.url },
        after: { url: write.url },
      });
    }
    if (before?.tlsMode !== write.tlsMode) {
      await appendAudit(scope, {
        ...audit,
        action: 'origin.tls_mode_set',
        before: before === null ? null : { tls_mode: before.tlsMode },
        after: { tls_mode: write.tlsMode },
      });
    }
    return version;
  });
}

function encode(url: string | null, tlsMode: TlsMode): { url: string | null; tls_mode: TlsMode } {
  if (url !== null) {
    const parsed = parseOrigin(url);
    if (!parsed.ok || parsed.origin.url !== url) {
      throw new OriginSettingError('Store only a canonical origin from parseOrigin.');
    }
  }
  if (!TLS_MODES.includes(tlsMode)) throw new OriginSettingError(`Unknown TLS mode: ${tlsMode}`);
  return { url, tls_mode: tlsMode };
}

function decode(value: unknown): { url: string | null; tlsMode: TlsMode } {
  if (typeof value !== 'object' || value === null) {
    throw new OriginSettingError('The stored origin setting is not an object.');
  }
  const { url, tls_mode: tlsMode } = value as { url?: unknown; tls_mode?: unknown };
  if (url !== null && typeof url !== 'string') {
    throw new OriginSettingError('The stored origin URL is not a string.');
  }
  if (typeof tlsMode !== 'string' || !(TLS_MODES as readonly string[]).includes(tlsMode)) {
    throw new OriginSettingError('The stored TLS mode is not caddy or front.');
  }
  if (url !== null) {
    const parsed = parseOrigin(url);
    if (!parsed.ok || parsed.origin.url !== url) {
      throw new OriginSettingError('The stored origin is not canonical.');
    }
  }
  return { url, tlsMode: tlsMode as TlsMode };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
