// The master-key probe check (first-run-setup Stage 0 and the recovery table; acceptance
// criterion 3). At start, `app` and `worker` write the probe if none exists, sealed with the
// loaded key, then open it. If it does not open, the process refuses to start with
// `encryption_key_mismatch`, before any real secret is read. `/readyz` repeats the open (no write)
// as its `master_key` component, so a database restored under another key shows up.

import {
  EncryptionKeyMismatchError,
  type MasterKey,
  open,
  SecretIntegrityError,
  seal,
} from '@jury-forge/crypto';
import {
  type ComponentState,
  ensureKeyProbe,
  type KeyProbe,
  readKeyProbe,
  type Store,
} from '@jury-forge/store';

const PROBE_TEXT = 'jury-forge master key probe v1';

export type MasterKeyFailure = 'encryption_key_mismatch' | 'key_probe_corrupt';

export class MasterKeyCheckError extends Error {
  override name = 'MasterKeyCheckError';
  readonly code: MasterKeyFailure;
  constructor(code: MasterKeyFailure, message: string) {
    super(message);
    this.code = code;
  }
}

function contextOf(orgId: string): string {
  return `${orgId}/key_probe`;
}

/** Writes the probe if needed and opens it. Throws MasterKeyCheckError; database errors pass. */
export async function verifyMasterKeyAtStart(store: Store, key: MasterKey): Promise<void> {
  const probe = await ensureKeyProbe(store, (orgId) => seal(key, PROBE_TEXT, contextOf(orgId)));
  openProbe(key, probe);
}

/** For `/readyz`: `ok` when the stored probe opens with the loaded key. */
export async function masterKeyReadiness(store: Store, key: MasterKey): Promise<ComponentState> {
  const probe = await readKeyProbe(store);
  if (probe === null) return 'pending';
  try {
    openProbe(key, probe);
    return 'ok';
  } catch {
    return 'error';
  }
}

function openProbe(key: MasterKey, probe: KeyProbe): void {
  let text: string;
  try {
    text = open(key, probe, contextOf(probe.orgId)).toString('utf8');
  } catch (error) {
    if (error instanceof EncryptionKeyMismatchError) {
      throw new MasterKeyCheckError(
        'encryption_key_mismatch',
        `The master key file holds key ${key.keyId}, but this database was set up with ${probe.keyId}. Restore the matching key file; see the recovery table.`,
      );
    }
    if (error instanceof SecretIntegrityError) {
      throw new MasterKeyCheckError(
        'key_probe_corrupt',
        'The stored master-key probe does not verify.',
      );
    }
    throw error;
  }
  if (text !== PROBE_TEXT) {
    throw new MasterKeyCheckError(
      'key_probe_corrupt',
      'The stored master-key probe is not the probe.',
    );
  }
}
