import { z } from 'zod';
import { FindingSchema, ProviderUsageSchema, RunModeSchema, RunStatusSchema } from './common';

/** The `runs` row as the list and detail endpoints expose it. */
export const RunSummarySchema = z.object({
  id: z.string(),
  repoId: z.number(),
  prNumber: z.number(),
  headSha: z.string(),
  event: z.string(),
  status: RunStatusSchema,
  mode: RunModeSchema,
  error: z.string().nullable(),
  reviewUrl: z.string().nullable(),
  createdAt: z.number(),
  finishedAt: z.number().nullable(),
});

/** `GET /api/runs`. */
export const RunsPageSchema = z.object({
  runs: z.array(RunSummarySchema),
  nextCursor: z.string().nullable(),
});

export const RunReviewerStatusSchema = z.enum(['pending', 'completed', 'failed']);

/** D-032: the scope record a run keeps for one reviewer. */
export const RunReviewerScopeSchema = z.object({
  pathsInclude: z.array(z.string()),
  pathsExclude: z.array(z.string()),
  contextPaths: z.array(z.string()),
  visibleFiles: z.number(),
  referenceFiles: z.array(z.string()),
});

/** D-032: a reviewer a run's path filters dropped, and the patterns that dropped it. */
export const RunSkippedReviewerSchema = z.object({
  reviewerId: z.string(),
  name: z.string(),
  pathsInclude: z.array(z.string()),
  pathsExclude: z.array(z.string()),
});

/** One reviewer's outcome within a run. */
export const RunReviewerOutcomeSchema = z.object({
  reviewerId: z.string(),
  status: RunReviewerStatusSchema,
  findings: z.array(FindingSchema).nullable(),
  summary: z.string().nullable(),
  usage: ProviderUsageSchema.nullable(),
  scope: RunReviewerScopeSchema.nullable(),
  error: z.string().nullable(),
});

/** `GET /api/runs/:id`. */
export const RunDetailSchema = z.object({
  run: RunSummarySchema,
  reviewers: z.array(RunReviewerOutcomeSchema),
  skippedReviewers: z.array(RunSkippedReviewerSchema),
  changedFiles: z.number(),
});

/** The body of `POST /api/runs/try`. */
export const TryRunRequestSchema = z.object({
  repoId: z.number(),
  prNumber: z.number(),
  reviewerIds: z.array(z.string()),
});

/** `POST /api/runs/try` (202). */
export const TryRunResponseSchema = z.object({
  runId: z.string(),
});
