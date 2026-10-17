import { z } from 'zod';

/** A repository synced from GitHub; new repositories arrive disabled (D-016). */
export const RepositorySchema = z.object({
  repoId: z.number(),
  fullName: z.string(),
  private: z.boolean(),
  enabled: z.boolean(),
});

/** A reviewer's effective on/off state for one repository. */
export const RepositoryReviewerSchema = z.object({
  reviewerId: z.string(),
  name: z.string(),
  enabled: z.boolean(),
});

/** The body of one reviewer toggle in `PUT /api/repositories/:repoId/reviewers`. */
export const RepositoryReviewerUpdateSchema = z.object({
  reviewerId: z.string(),
  enabled: z.boolean(),
});

/** One open pull request in the manual try-run picker. */
export const RepositoryPullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  headSha: z.string(),
  authorLogin: z.string().nullable(),
  draft: z.boolean(),
});
