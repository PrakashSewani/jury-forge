import { z } from 'zod';
import { ProviderFlavorSchema } from './common';

/** A stored reviewer, minus its API key; `repositories` are the enabled repos it will run on. */
export const ReviewerSchema = z.object({
  id: z.string(),
  name: z.string(),
  instructions: z.string(),
  rules: z.string(),
  flavor: ProviderFlavorSchema,
  baseUrl: z.string(),
  model: z.string(),
  params: z.record(z.string(), z.unknown()),
  enabled: z.boolean(),
  hasApiKey: z.boolean(),
  repositories: z.array(z.string()),
});

/** One reviewer in an export document; deliberately carries no key material. */
export const ReviewerExportSchema = z.object({
  name: z.string(),
  instructions: z.string(),
  rules: z.string(),
  flavor: ProviderFlavorSchema,
  baseUrl: z.string(),
  model: z.string(),
  params: z.record(z.string(), z.unknown()),
  enabled: z.boolean(),
});

/** `GET /api/reviewers/export`. */
export const ReviewersExportDocumentSchema = z.object({
  version: z.number(),
  exportedAt: z.number(),
  reviewers: z.array(ReviewerExportSchema),
});

/** `POST /api/reviewers/import`. */
export const ReviewersImportResultSchema = z.object({
  created: z.number(),
  updated: z.number(),
  unchanged: z.number(),
  skipped: z.number(),
});
