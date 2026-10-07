import type { ProviderFlavor, Reviewer } from '@jury-forge/shared';
import { z } from 'zod';
import { encryptSecret } from './crypto';

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

export const reviewerCreate = z.object({
  name: z.string().min(1).max(120),
  instructions: z.string().max(20_000).default(''),
  rules: z.string().max(20_000).default(''),
  flavor: z.enum(['openai', 'anthropic']),
  baseUrl,
  model: z.string().min(1).max(200),
  apiKey: z.string().min(1).max(4_000).optional(),
  params: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

export const reviewerUpdate = z.object({
  name: z.string().min(1).max(120).optional(),
  instructions: z.string().max(20_000).optional(),
  rules: z.string().max(20_000).optional(),
  flavor: z.enum(['openai', 'anthropic']).optional(),
  baseUrl: baseUrl.optional(),
  model: z.string().min(1).max(200).optional(),
  apiKey: z.string().min(1).max(4_000).nullable().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

export type ReviewerCreate = z.infer<typeof reviewerCreate>;
export type ReviewerUpdate = z.infer<typeof reviewerUpdate>;

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

function fromRow(row: ReviewerRow): Reviewer {
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
  };
}

export async function listReviewers(db: D1Database): Promise<Reviewer[]> {
  const result = await db
    .prepare(`SELECT ${REVIEWER_COLUMNS} FROM reviewers ORDER BY name COLLATE NOCASE, id`)
    .all<ReviewerRow>();
  return result.results.map(fromRow);
}

export async function getReviewer(db: D1Database, id: string): Promise<Reviewer | null> {
  const row = await db
    .prepare(`SELECT ${REVIEWER_COLUMNS} FROM reviewers WHERE id = ?`)
    .bind(id)
    .first<ReviewerRow>();
  return row === null ? null : fromRow(row);
}

export async function insertReviewer(
  db: D1Database,
  id: string,
  encryptionKey: CryptoKey | null,
  input: ReviewerCreate,
): Promise<void> {
  const apiKeyEnc =
    input.apiKey === undefined ? '' : await encryptKeyValue(encryptionKey, input.apiKey);
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
  encryptionKey: CryptoKey | null,
  patch: ReviewerUpdate,
): Promise<void> {
  const assignments: string[] = [];
  const values: (string | number)[] = [];
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
  if (patch.apiKey !== undefined) {
    assignments.push('api_key_enc = ?');
    values.push(patch.apiKey === null ? '' : await encryptKeyValue(encryptionKey, patch.apiKey));
  }
  if (assignments.length === 0) {
    return;
  }
  assignments.push('updated_at = unixepoch()');
  await db
    .prepare(`UPDATE reviewers SET ${assignments.join(', ')} WHERE id = ?`)
    .bind(...values, id)
    .run();
}

export async function deleteReviewerRow(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM reviewers WHERE id = ?').bind(id).run();
  return (result.meta.changes ?? 0) > 0;
}

async function encryptKeyValue(encryptionKey: CryptoKey | null, value: string): Promise<string> {
  if (encryptionKey === null) {
    throw new Error('an encryption key is required to store provider API keys');
  }
  return encryptSecret(encryptionKey, value);
}
