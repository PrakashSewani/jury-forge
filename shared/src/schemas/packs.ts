import { z } from 'zod';

/** A display/filter label; behaviour is not attached to it in v1. */
export const PackKindSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

export const PackApplySchema = z.enum(['always', 'paths']);

export const PackGrantScopeSchema = z.enum(['global', 'repository', 'reviewer']);

/** The validated frontmatter of a pack manifest, with the Markdown body kept separately. */
export const PackManifestSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(2_000),
  kind: PackKindSchema,
  apply: PackApplySchema,
  /** Repository-relative globs, used only when `apply` is `paths`. */
  paths: z.array(z.string().max(200)).max(20),
  /** Pack-relative globs over `docs/`; matching files are stored but never injected. */
  neverQuote: z.array(z.string().max(200)).max(50),
  owner: z.string().max(200),
});

/** One stored `docs/` file, without its text. */
export const PackFileSchema = z.object({
  path: z.string(),
  bytes: z.number(),
  neverQuote: z.boolean(),
});

/** A version's identity and sizes, without its content. */
export const PackVersionSummarySchema = z.object({
  id: z.string(),
  hash: z.string(),
  manifestPath: z.string(),
  createdAt: z.number(),
  createdBy: z.string().nullable(),
  manifestBytes: z.number(),
  docsBytes: z.number(),
  totalBytes: z.number(),
  fileCount: z.number(),
});

/** A version's manifest and body, without its doc texts. */
export const PackVersionContentSchema = PackVersionSummarySchema.extend({
  manifest: PackManifestSchema,
  body: z.string(),
});

/** One version for audit, including every doc's text. */
export const PackVersionDetailSchema = PackVersionContentSchema.extend({
  files: z.array(PackFileSchema.extend({ text: z.string() })),
});

/** A pack's latest version in the list payload. */
export const PackSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  grantCount: z.number(),
  latest: PackVersionSummarySchema.extend({ manifest: PackManifestSchema }),
});

export const PackGrantSchema = z.object({
  id: z.string(),
  scope: PackGrantScopeSchema,
  targetId: z.string().nullable(),
  targetLabel: z.string().nullable(),
  precedence: z.number(),
  enabled: z.boolean(),
});

/** `GET /api/packs/:id`. */
export const PackDetailSchema = z.object({
  pack: PackSummarySchema,
  versions: z.array(PackVersionSummarySchema),
  grants: z.array(PackGrantSchema),
  latest: PackVersionContentSchema.extend({ files: z.array(PackFileSchema) }),
});

/** The body of `PUT /api/packs/:id/grants`. */
export const PackGrantInputSchema = z.object({
  scope: PackGrantScopeSchema,
  targetId: z.string().max(200).nullable().optional(),
  precedence: z.number().int().min(0).max(1_000).optional(),
  enabled: z.boolean().optional(),
});

export const PackGrantsUpdateSchema = z.object({
  grants: z.array(PackGrantInputSchema).max(200),
});

/** One uploaded text file. The route enforces the total request size. */
export const PackInputFileSchema = z.object({
  path: z.string().min(1).max(300),
  text: z.string().max(1_000_000),
});

/** The body of `POST /api/packs/preview` and `POST /api/packs`. */
export const PackPreviewRequestSchema = z.object({
  files: z.array(PackInputFileSchema).min(1).max(1_000),
  root: z.string().max(300).optional(),
  packId: z.string().min(1).max(200).optional(),
  /** Store as a separate pack with a suffixed slug instead of a version of a same-named pack. */
  forceNew: z.boolean().optional(),
});

export const PackRootCandidateSchema = z.object({
  root: z.string(),
  manifestPath: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
});

export const PackExistingSchema = z.object({
  id: z.string(),
  slug: z.string(),
  versionCount: z.number(),
  latestHash: z.string().nullable(),
});

/** `POST /api/packs/preview`. A 200 body even when the document is invalid. */
export const PackPreviewSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  manifest: PackManifestSchema.nullable(),
  hash: z.string().nullable(),
  files: z.array(PackFileSchema),
  ignoredFiles: z.array(z.string()),
  ignoredCount: z.number(),
  candidates: z.array(PackRootCandidateSchema),
  existingPack: PackExistingSchema.nullable(),
});

/** `POST /api/packs`. */
export const PackCreateResultSchema = z.object({
  pack: PackSummarySchema,
  version: PackVersionSummarySchema,
  createdVersion: z.boolean(),
});

export const PackDroppedFileSchema = z.object({
  path: z.string(),
  reason: z.enum(['budget', 'file-limit', 'too-large']),
});

export const RunAppliedPackSchema = z.object({
  slug: z.string(),
  hash: z.string(),
  name: z.string(),
  scope: PackGrantScopeSchema,
  precedence: z.number(),
  bytes: z.number(),
  manifestBytes: z.number(),
  docBytes: z.number(),
  includedFiles: z.array(z.string()),
  droppedFiles: z.array(PackDroppedFileSchema),
  withheldFiles: z.array(z.string()),
});

export const RunNotAppliedPackSchema = z.object({
  slug: z.string(),
  hash: z.string(),
  scope: PackGrantScopeSchema,
  precedence: z.number(),
  reason: z.enum(['paths', 'pack-limit']),
});

/** What one reviewer knew on one run (D-034). */
export const RunReviewerKnowledgeSchema = z.object({
  applied: z.array(RunAppliedPackSchema),
  notApplied: z.array(RunNotAppliedPackSchema),
  totalBytes: z.number(),
  budgetBytes: z.number(),
  overBudget: z.boolean(),
});

export const RunKnowledgePackSchema = z.object({
  slug: z.string(),
  hash: z.string(),
  bytes: z.number(),
  reviewers: z.number(),
});

/** The deduped pack set a run injected. */
export const RunKnowledgeSummarySchema = z.object({
  packs: z.array(RunKnowledgePackSchema),
  totalBytes: z.number(),
});
