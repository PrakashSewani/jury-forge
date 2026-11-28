// Artefacts: bounded bytes kept in Postgres with an expiry (technical-approach §3.2, data-model.md).
// Raw diffs, redacted provider requests and responses, webhook payloads, and exports. Never logged
// and never a span attribute. The daily retention job removes expired rows
// (`Store.deleteExpiredArtefacts`).

import { createHash } from 'node:crypto';
import type { TenantScope } from './store.ts';

/** 2 MiB, the same cap as the `artefacts_size_cap` constraint. */
export const ARTEFACT_MAX_BYTES = 2_097_152;

export const ARTEFACT_KINDS = [
  'diff',
  'provider_request',
  'provider_response',
  'webhook_payload',
  'export',
] as const;
export type ArtefactKind = (typeof ARTEFACT_KINDS)[number];

export interface NewArtefact {
  kind: ArtefactKind;
  bytes: Uint8Array;
  /** Whether redaction ran on these bytes. Required: the writer must say. */
  redacted: boolean;
  /** When the retention job may delete it. Must be in the future. */
  expiresAt: Date;
}

export interface StoredArtefact {
  id: string;
  kind: ArtefactKind;
  size: number;
  /** Hex SHA-256 of the bytes. */
  sha256: string;
  redacted: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export class ArtefactError extends Error {
  override name = 'ArtefactError';
}

export async function putArtefact(
  scope: TenantScope,
  artefact: NewArtefact,
  now = new Date(),
): Promise<StoredArtefact> {
  if (!ARTEFACT_KINDS.includes(artefact.kind)) {
    throw new ArtefactError('Unknown artefact kind.');
  }
  if (artefact.bytes.byteLength > ARTEFACT_MAX_BYTES) {
    throw new ArtefactError(
      `An artefact is at most ${ARTEFACT_MAX_BYTES} bytes; got ${artefact.bytes.byteLength}.`,
    );
  }
  if (!(artefact.expiresAt.getTime() > now.getTime())) {
    throw new ArtefactError('An artefact needs an expiry in the future.');
  }
  const bytes = Buffer.from(artefact.bytes);
  const digest = createHash('sha256').update(bytes).digest();
  const row = await scope
    .insertInto('artefacts', {
      kind: artefact.kind,
      bytes,
      size: bytes.byteLength,
      sha256: digest,
      redacted: artefact.redacted,
      expires_at: artefact.expiresAt,
    })
    .returning(['id', 'created_at'])
    .executeTakeFirstOrThrow();
  return {
    id: row.id,
    kind: artefact.kind,
    size: bytes.byteLength,
    sha256: digest.toString('hex'),
    redacted: artefact.redacted,
    createdAt: row.created_at,
    expiresAt: artefact.expiresAt,
  };
}

/** The artefact and its bytes, or null when it does not exist in this org or has expired. */
export async function getArtefact(
  scope: TenantScope,
  id: string,
  now = new Date(),
): Promise<(StoredArtefact & { bytes: Buffer }) | null> {
  const row = await scope
    .selectFrom('artefacts')
    .select(['id', 'kind', 'bytes', 'size', 'sha256', 'redacted', 'created_at', 'expires_at'])
    .where('id', '=', id)
    .where('expires_at', '>', now)
    .executeTakeFirst();
  if (row === undefined) return null;
  return {
    id: row.id,
    kind: row.kind as ArtefactKind,
    bytes: row.bytes,
    size: row.size,
    sha256: row.sha256.toString('hex'),
    redacted: row.redacted,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
