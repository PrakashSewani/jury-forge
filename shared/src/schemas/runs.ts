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

/** One reviewer's outcome within a run. */
export const RunReviewerOutcomeSchema = z.object({
  reviewerId: z.string(),
  status: RunReviewerStatusSchema,
  findings: z.array(FindingSchema).nullable(),
  summary: z.string().nullable(),
  usage: ProviderUsageSchema.nullable(),
  error: z.string().nullable(),
});

/** `GET /api/runs/:id`. */
export const RunDetailSchema = z.object({
  run: RunSummarySchema,
  reviewers: z.array(RunReviewerOutcomeSchema),
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
