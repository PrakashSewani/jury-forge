import { z } from 'zod';

export const InstanceReadinessStepKeySchema = z.enum([
  'claim',
  'install-app',
  'enable-repo',
  'add-reviewer',
  'first-run',
]);

/** One checklist line in the computed readiness (D-028). */
export const InstanceReadinessStepSchema = z.object({
  key: InstanceReadinessStepKeySchema,
  label: z.string(),
  href: z.string(),
  done: z.boolean(),
});

/** The single next action, or the closing `done` state once all five steps are complete. */
export const InstanceReadinessNextStepSchema = z.object({
  key: z.enum(['claim', 'install-app', 'enable-repo', 'add-reviewer', 'first-run', 'done']),
  title: z.string(),
  body: z.string(),
  href: z.string(),
  label: z.string(),
});

/** `GET /api/instance/readiness`. */
export const InstanceReadinessSchema = z.object({
  claimed: z.boolean(),
  appInstalled: z.boolean(),
  reposEnabled: z.number(),
  reviewersWithKey: z.number(),
  repoReviewerPairs: z.number(),
  firstRunAt: z.number().nullable(),
  completed: z.number(),
  total: z.number(),
  steps: z.array(InstanceReadinessStepSchema),
  nextStep: InstanceReadinessNextStepSchema,
});
