import { z } from 'zod';

/** D-001: the two provider request/response flavors the engine understands. */
export const ProviderFlavorSchema = z.enum(['openai', 'anthropic']);

export const FindingSeveritySchema = z.enum(['info', 'warning', 'error']);

/**
 * One review finding (D-009/D-020). `line` and `startLine` are optional: the model may omit a
 * line, and the consolidator drops an invalid `startLine` before the finding is stored.
 */
export const FindingSchema = z.object({
  file: z.string(),
  line: z.number().optional(),
  startLine: z.number().optional(),
  severity: FindingSeveritySchema,
  title: z.string(),
  body: z.string(),
});

/** D-020: normalized token usage; a field is null when the provider did not report it. */
export const ProviderUsageSchema = z.object({
  promptTokens: z.number().nullable(),
  completionTokens: z.number().nullable(),
  totalTokens: z.number().nullable(),
});

export const RunStatusSchema = z.enum(['running', 'completed', 'failed', 'skipped']);

export const RunModeSchema = z.enum(['auto', 'manual']);

/** `GET /api/health`. */
export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  name: z.string(),
});
