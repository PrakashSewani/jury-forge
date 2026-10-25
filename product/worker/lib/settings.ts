import type { InstanceSettings } from '@jury-forge/shared';
import { z } from 'zod';

interface SettingSpec<T> {
  schema: z.ZodType<T>;
  defaultValue: T;
}

// D-021: every key's parser, bounds, and default. `loadSettings` falls back to the default
// whenever a stored row is missing, unparseable, or outside these bounds.
const SETTING_SPECS: { [K in keyof InstanceSettings]: SettingSpec<InstanceSettings[K]> } = {
  inlineCommentsPerReviewer: {
    schema: z.number().int().min(1).max(50),
    defaultValue: 10,
  },
  inlineCommentsPerRun: {
    schema: z.number().int().min(1).max(100),
    defaultValue: 25,
  },
  contextTotalBytes: {
    schema: z.number().int().min(20_000).max(1_000_000),
    defaultValue: 200_000,
  },
  contextFileBytes: {
    schema: z.number().int().min(4_000).max(200_000),
    defaultValue: 32_000,
  },
  descriptionLimit: {
    schema: z.number().int().min(500).max(20_000),
    defaultValue: 4_096,
  },
  blockingMode: {
    schema: z.boolean(),
    defaultValue: false,
  },
  blockingErrorThreshold: {
    schema: z.number().int().min(1).max(50),
    defaultValue: 1,
  },
  repoInstructions: {
    schema: z.boolean(),
    defaultValue: false,
  },
  repoInstructionsMaxBytes: {
    schema: z.number().int().min(1_000).max(50_000),
    defaultValue: 8_000,
  },
  referenceContextFiles: {
    schema: z.number().int().min(1).max(100),
    defaultValue: 50,
  },
  referenceContextFileBytes: {
    // Capped at 100 KB to stay inside a Durable Object storage value (128 KiB).
    schema: z.number().int().min(1_000).max(100_000),
    defaultValue: 32_000,
  },
  referenceContextTotalBytes: {
    schema: z.number().int().min(10_000).max(1_000_000),
    defaultValue: 100_000,
  },
};

export const DEFAULT_SETTINGS: InstanceSettings = {
  inlineCommentsPerReviewer: SETTING_SPECS.inlineCommentsPerReviewer.defaultValue,
  inlineCommentsPerRun: SETTING_SPECS.inlineCommentsPerRun.defaultValue,
  contextTotalBytes: SETTING_SPECS.contextTotalBytes.defaultValue,
  contextFileBytes: SETTING_SPECS.contextFileBytes.defaultValue,
  descriptionLimit: SETTING_SPECS.descriptionLimit.defaultValue,
  blockingMode: SETTING_SPECS.blockingMode.defaultValue,
  blockingErrorThreshold: SETTING_SPECS.blockingErrorThreshold.defaultValue,
  repoInstructions: SETTING_SPECS.repoInstructions.defaultValue,
  repoInstructionsMaxBytes: SETTING_SPECS.repoInstructionsMaxBytes.defaultValue,
  referenceContextFiles: SETTING_SPECS.referenceContextFiles.defaultValue,
  referenceContextFileBytes: SETTING_SPECS.referenceContextFileBytes.defaultValue,
  referenceContextTotalBytes: SETTING_SPECS.referenceContextTotalBytes.defaultValue,
};

export type SettingsPatchResult =
  | { ok: true; patch: Partial<InstanceSettings> }
  | { ok: false; error: 'invalid_request' | 'unknown_key' | 'invalid_value' };

export function validateSettingsPatch(input: unknown): SettingsPatchResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'invalid_request' };
  }
  const patch: Partial<InstanceSettings> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(key in SETTING_SPECS)) {
      return { ok: false, error: 'unknown_key' };
    }
    const typedKey = key as keyof InstanceSettings;
    const parsed = SETTING_SPECS[typedKey].schema.safeParse(value);
    if (!parsed.success) {
      return { ok: false, error: 'invalid_value' };
    }
    applyValue(patch, typedKey, parsed.data);
  }
  return { ok: true, patch };
}

export async function loadSettings(db: D1Database): Promise<InstanceSettings> {
  const rows = await db
    .prepare('SELECT key, value FROM instance_settings')
    .all<{ key: string; value: string }>();
  const settings: InstanceSettings = { ...DEFAULT_SETTINGS };
  for (const row of rows.results) {
    if (!(row.key in SETTING_SPECS)) {
      continue;
    }
    applyStored(settings, row.key as keyof InstanceSettings, row.value);
  }
  return settings;
}

export async function updateSettings(
  db: D1Database,
  patch: Partial<InstanceSettings>,
): Promise<InstanceSettings> {
  const result = validateSettingsPatch(patch);
  if (!result.ok) {
    throw new Error(result.error);
  }
  const statements = Object.entries(result.patch).map(([key, value]) =>
    db
      .prepare(
        'INSERT INTO instance_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()',
      )
      .bind(key, JSON.stringify(value)),
  );
  if (statements.length > 0) {
    await db.batch(statements);
  }
  return loadSettings(db);
}

function applyStored<K extends keyof InstanceSettings>(
  settings: InstanceSettings,
  key: K,
  raw: string,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const result = SETTING_SPECS[key].schema.safeParse(parsed);
  if (result.success) {
    settings[key] = result.data;
  }
}

function applyValue<K extends keyof InstanceSettings>(
  patch: Partial<InstanceSettings>,
  key: K,
  value: InstanceSettings[K],
): void {
  patch[key] = value;
}
