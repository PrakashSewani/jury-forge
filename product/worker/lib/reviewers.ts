import type {
  ProviderFlavor,
  Reviewer,
  ReviewerExport,
  ReviewersExportDocument,
  ReviewersImportResult,
} from '@jury-forge/shared';
import { z } from 'zod';
import {
  encryptSecret,
  isCurrentCiphertext,
  reencryptSecret,
  type EncryptionKeyRing,
} from './crypto';

const baseUrl = z
  .string()
  .min(1)
  .max(2_000)
  .refine((value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, 'must be a URL');

/** One of the two ways to set a model key; never sent together with `apiKey`. */
const apiKeyFromReviewerId = z.string().min(1).max(200).optional();

/** A key is either pasted or copied from another reviewer — sending both is a request error. */
function oneKeySourceAtMost(value: { apiKey?: unknown; apiKeyFromReviewerId?: unknown }): boolean {
  return value.apiKey === undefined || value.apiKeyFromReviewerId === undefined;
}

export const reviewerCreate = z
  .object({
    name: z.string().min(1).max(120),
    instructions: z.string().max(20_000).default(''),
    rules: z.string().max(20_000).default(''),
    flavor: z.enum(['openai', 'anthropic']),
    baseUrl,
    model: z.string().min(1).max(200),
    apiKey: z.string().min(1).max(4_000).optional(),
    apiKeyFromReviewerId,
    params: z.record(z.string(), z.unknown()).default({}),
    enabled: z.boolean().default(true),
  })
  .refine(oneKeySourceAtMost);

export const reviewerUpdate = z
  .object({
    name: z.string().min(1).max(120).optional(),
    instructions: z.string().max(20_000).optional(),
    rules: z.string().max(20_000).optional(),
    flavor: z.enum(['openai', 'anthropic']).optional(),
    baseUrl: baseUrl.optional(),
    model: z.string().min(1).max(200).optional(),
    apiKey: z.string().min(1).max(4_000).nullable().optional(),
    apiKeyFromReviewerId,
    params: z.record(z.string(), z.unknown()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine(oneKeySourceAtMost);

export type ReviewerCreate = z.infer<typeof reviewerCreate>;
export type ReviewerUpdate = z.infer<typeof reviewerUpdate>;

export const REVIEWERS_IMPORT_VERSION = 1;
export const REVIEWERS_IMPORT_MAX = 100;

const importEntry = z.object({
  name: z.string().max(120).optional(),
  instructions: z.string().max(20_000).default(''),
  rules: z.string().max(20_000).default(''),
  flavor: z.enum(['openai', 'anthropic']),
  baseUrl,
  model: z.string().min(1).max(200),
  params: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

/**
 * An exported reviewer document. Unknown keys are stripped by zod, so an imported entry that
 * carries an `apiKey` never stores one.
 */
export const reviewersImportDocument = z.object({
  version: z.literal(REVIEWERS_IMPORT_VERSION),
  reviewers: z.array(importEntry).max(REVIEWERS_IMPORT_MAX),
});

export type ReviewersImportDocument = z.infer<typeof reviewersImportDocument>;

export function toReviewerExport(reviewer: Reviewer): ReviewerExport {
  return {
    name: reviewer.name,
    instructions: reviewer.instructions,
    rules: reviewer.rules,
    flavor: reviewer.flavor,
    baseUrl: reviewer.baseUrl,
    model: reviewer.model,
    params: reviewer.params,
    enabled: reviewer.enabled,
  };
}

/** `listReviewers` already orders by name, so the export keeps that order. */
export function buildExportDocument(
  reviewers: Reviewer[],
  exportedAt: number,
): ReviewersExportDocument {
  return {
    version: REVIEWERS_IMPORT_VERSION,
    exportedAt,
    reviewers: reviewers.map(toReviewerExport),
  };
}

interface ReviewerRow {
  id: string;
  name: string;
  instructions: string;
  rules: string;
  flavor: ProviderFlavor;
  base_url: string;
  api_key_enc: string;
  model: string;
  params_json: string;
  enabled: number;
}

const REVIEWER_COLUMNS =
  'id, name, instructions, rules, flavor, base_url, api_key_enc, model, params_json, enabled';

function fromRow(row: ReviewerRow, repositories: string[]): Reviewer {
  return {
    id: row.id,
    name: row.name,
    instructions: row.instructions,
    rules: row.rules,
    flavor: row.flavor,
    baseUrl: row.base_url,
    model: row.model,
    params: JSON.parse(row.params_json) as Record<string, unknown>,
    enabled: row.enabled === 1,
    hasApiKey: row.api_key_enc !== '',
    repositories,
  };
}

const REVIEWER_REPOSITORIES_SQL =
  'SELECT r.id AS reviewer_id, repo.full_name FROM reviewers r JOIN repositories repo ON repo.enabled = 1 LEFT JOIN reviewer_repositories rr ON rr.reviewer_id = r.id AND rr.repo_id = repo.repo_id WHERE COALESCE(rr.enabled, 1) = 1';

interface ReviewerRepositoriesRow {
  reviewer_id: string;
  full_name: string;
}

function groupRepositories(rows: ReviewerRepositoriesRow[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const list = grouped.get(row.reviewer_id);
    if (list) {
      list.push(row.full_name);
    } else {
      grouped.set(row.reviewer_id, [row.full_name]);
    }
  }
  return grouped;
}

export async function listReviewers(db: D1Database): Promise<Reviewer[]> {
  const [result, repositories] = await Promise.all([
    db
      .prepare(`SELECT ${REVIEWER_COLUMNS} FROM reviewers ORDER BY name COLLATE NOCASE, id`)
      .all<ReviewerRow>(),
    db
      .prepare(`${REVIEWER_REPOSITORIES_SQL} ORDER BY r.id, repo.full_name COLLATE NOCASE`)
      .all<ReviewerRepositoriesRow>(),
  ]);
  const grouped = groupRepositories(repositories.results);
  return result.results.map((row) => fromRow(row, grouped.get(row.id) ?? []));
}

export async function getReviewer(db: D1Database, id: string): Promise<Reviewer | null> {
  const [row, repositories] = await Promise.all([
    db
      .prepare(`SELECT ${REVIEWER_COLUMNS} FROM reviewers WHERE id = ?`)
      .bind(id)
      .first<ReviewerRow>(),
    db
      .prepare(`${REVIEWER_REPOSITORIES_SQL} AND r.id = ? ORDER BY repo.full_name COLLATE NOCASE`)
      .bind(id)
      .all<ReviewerRepositoriesRow>(),
  ]);
  if (row === null) {
    return null;
  }
  const grouped = groupRepositories(repositories.results);
  return fromRow(row, grouped.get(id) ?? []);
}

/**
 * The stored ciphertext of a reviewer's key, or `null` when that reviewer does not exist or holds
 * no key. Deliberately the raw ciphertext: a reuse copies it verbatim and never decrypts it.
 */
export async function storedApiKeyCiphertext(db: D1Database, id: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT api_key_enc FROM reviewers WHERE id = ?')
    .bind(id)
    .first<{ api_key_enc: string }>();
  const stored = row?.api_key_enc ?? '';
  return stored === '' ? null : stored;
}

export async function insertReviewer(
  db: D1Database,
  id: string,
  ring: EncryptionKeyRing | null,
  input: ReviewerCreate,
  copiedCiphertext?: string,
): Promise<void> {
  // A reused key is the source reviewer's ciphertext, byte for byte: this never decrypts it and
  // never sees the plaintext. Lazy rotation (D-023) re-wraps it the next time the row is written.
  const apiKeyEnc =
    copiedCiphertext ??
    (input.apiKey === undefined ? '' : await encryptKeyValue(ring, input.apiKey));
  await db
    .prepare(
      'INSERT INTO reviewers (id, name, instructions, rules, flavor, base_url, api_key_enc, model, params_json, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      id,
      input.name,
      input.instructions,
      input.rules,
      input.flavor,
      input.baseUrl,
      apiKeyEnc,
      input.model,
      JSON.stringify(input.params),
      input.enabled ? 1 : 0,
    )
    .run();
}

export async function updateReviewerRow(
  db: D1Database,
  id: string,
  ring: EncryptionKeyRing | null,
  patch: ReviewerUpdate,
  copiedCiphertext?: string,
): Promise<{ apiKeyReencrypted: boolean }> {
  const assignments: string[] = [];
  const values: (string | number)[] = [];
  let apiKeyReencrypted = false;
  if (patch.name !== undefined) {
    assignments.push('name = ?');
    values.push(patch.name);
  }
  if (patch.instructions !== undefined) {
    assignments.push('instructions = ?');
    values.push(patch.instructions);
  }
  if (patch.rules !== undefined) {
    assignments.push('rules = ?');
    values.push(patch.rules);
  }
  if (patch.flavor !== undefined) {
    assignments.push('flavor = ?');
    values.push(patch.flavor);
  }
  if (patch.baseUrl !== undefined) {
    assignments.push('base_url = ?');
    values.push(patch.baseUrl);
  }
  if (patch.model !== undefined) {
    assignments.push('model = ?');
    values.push(patch.model);
  }
  if (patch.params !== undefined) {
    assignments.push('params_json = ?');
    values.push(JSON.stringify(patch.params));
  }
  if (patch.enabled !== undefined) {
    assignments.push('enabled = ?');
    values.push(patch.enabled ? 1 : 0);
  }
  if (copiedCiphertext !== undefined) {
    assignments.push('api_key_enc = ?');
    values.push(copiedCiphertext);
  } else if (patch.apiKey !== undefined) {
    assignments.push('api_key_enc = ?');
    values.push(patch.apiKey === null ? '' : await encryptKeyValue(ring, patch.apiKey));
  } else if (ring !== null) {
    // D-023 lazy rotation: re-wrap a stored key held under an older version on write.
    const row = await db
      .prepare('SELECT api_key_enc FROM reviewers WHERE id = ?')
      .bind(id)
      .first<{ api_key_enc: string }>();
    const stored = row?.api_key_enc ?? '';
    if (stored !== '' && !isCurrentCiphertext(ring, stored)) {
      const reencrypted = await reencryptSecret(ring, stored);
      if (reencrypted !== null) {
        assignments.push('api_key_enc = ?');
        values.push(reencrypted);
        apiKeyReencrypted = true;
      }
    }
  }
  if (assignments.length === 0) {
    return { apiKeyReencrypted: false };
  }
  assignments.push('updated_at = unixepoch()');
  await db
    .prepare(`UPDATE reviewers SET ${assignments.join(', ')} WHERE id = ?`)
    .bind(...values, id)
    .run();
  return { apiKeyReencrypted };
}

export async function deleteReviewerRow(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM reviewers WHERE id = ?').bind(id).run();
  return (result.meta.changes ?? 0) > 0;
}

async function encryptKeyValue(ring: EncryptionKeyRing | null, value: string): Promise<string> {
  if (ring === null) {
    throw new Error('an encryption key is required to store provider API keys');
  }
  return encryptSecret(ring, value);
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Canonical form so equal param objects compare equal regardless of key order. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

/** Only the fields that differ from the stored reviewer; never `apiKey`. */
function importPatch(current: Reviewer, desired: ReviewerExport): ReviewerUpdate {
  const patch: ReviewerUpdate = {};
  if (current.name !== desired.name) {
    patch.name = desired.name;
  }
  if (current.instructions !== desired.instructions) {
    patch.instructions = desired.instructions;
  }
  if (current.rules !== desired.rules) {
    patch.rules = desired.rules;
  }
  if (current.flavor !== desired.flavor) {
    patch.flavor = desired.flavor;
  }
  if (current.baseUrl !== desired.baseUrl) {
    patch.baseUrl = desired.baseUrl;
  }
  if (current.model !== desired.model) {
    patch.model = desired.model;
  }
  if (stableStringify(current.params) !== stableStringify(desired.params)) {
    patch.params = desired.params;
  }
  if (current.enabled !== desired.enabled) {
    patch.enabled = desired.enabled;
  }
  return patch;
}

/**
 * Merges an exported document by case-insensitive, trimmed name. New names are created without a
 * key; existing reviewers are patched field by field, never touching `api_key_enc`. The document
 * is validated whole before this runs, and an entry with no usable name writes nothing.
 */
export async function importReviewers(
  db: D1Database,
  ring: EncryptionKeyRing | null,
  document: ReviewersImportDocument,
): Promise<ReviewersImportResult> {
  const result: ReviewersImportResult = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
  const existing = new Map<string, Reviewer>();
  for (const reviewer of await listReviewers(db)) {
    existing.set(normalizeName(reviewer.name), reviewer);
  }

  for (const entry of document.reviewers) {
    const name = (entry.name ?? '').trim();
    if (name === '') {
      result.skipped += 1;
      continue;
    }
    const desired: ReviewerExport = {
      name,
      instructions: entry.instructions,
      rules: entry.rules,
      flavor: entry.flavor,
      baseUrl: entry.baseUrl,
      model: entry.model,
      params: entry.params,
      enabled: entry.enabled,
    };
    const key = normalizeName(name);
    const current = existing.get(key);
    if (current === undefined) {
      const id = crypto.randomUUID();
      await insertReviewer(db, id, ring, desired);
      const created = await getReviewer(db, id);
      if (created) {
        existing.set(key, created);
      }
      result.created += 1;
      continue;
    }

    const patch = importPatch(current, desired);
    if (Object.keys(patch).length === 0) {
      result.unchanged += 1;
      continue;
    }
    await updateReviewerRow(db, current.id, ring, patch);
    result.updated += 1;
  }

  return result;
}
