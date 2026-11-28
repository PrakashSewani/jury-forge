// The master-key probe row (migration 0007; first-run-setup Stage 0). The store only reads and
// writes the sealed bytes; sealing and opening are the `crypto` package's, wired in `apps/server`.

import { instanceOrgId } from './origin.ts';
import type { Store } from './store.ts';

export interface SealedRecord {
  ciphertext: Buffer;
  wrappedDek: Buffer;
  keyId: string;
}

export interface KeyProbe extends SealedRecord {
  orgId: string;
}

export async function readKeyProbe(store: Store): Promise<KeyProbe | null> {
  const orgId = await instanceOrgId(store);
  const row = await store
    .forOrg(orgId)
    .selectFrom('secrets')
    .select(['ciphertext', 'wrapped_dek', 'key_id'])
    .where('kind', '=', 'key_probe')
    .executeTakeFirst();
  if (row === undefined) return null;
  return { orgId, ciphertext: row.ciphertext, wrappedDek: row.wrapped_dek, keyId: row.key_id };
}

/**
 * Writes the probe if none exists yet and returns the one that is stored, which is another
 * process's when two start together (the partial unique index of migration 0007 decides).
 */
export async function ensureKeyProbe(
  store: Store,
  create: (orgId: string) => SealedRecord,
): Promise<KeyProbe> {
  const existing = await readKeyProbe(store);
  if (existing !== null) return existing;
  const orgId = await instanceOrgId(store);
  const sealed = create(orgId);
  await store
    .forOrg(orgId)
    .insertInto('secrets', {
      kind: 'key_probe',
      ciphertext: sealed.ciphertext,
      wrapped_dek: sealed.wrappedDek,
      key_id: sealed.keyId,
    })
    .onConflict((conflict) => conflict.column('org_id').where('kind', '=', 'key_probe').doNothing())
    .execute();
  const stored = await readKeyProbe(store);
  if (stored === null) throw new Error('The key probe was not stored.');
  return stored;
}
