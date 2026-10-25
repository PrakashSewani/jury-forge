import { z } from 'zod';

/** A repository synced from GitHub; new repositories arrive disabled (D-016). */
export const RepositorySchema = z.object({
  repoId: z.number(),
  fullName: z.string(),
  private: z.boolean(),
  enabled: z.boolean(),
});

/**
 * A repository-relative glob (D-031): no leading slash and no `.`/`..` segment, so a pattern can
 * never select a path outside the repository. The worker matches these with its own small matcher.
 */
const scopePattern = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.split('/').some((segment) => segment === '.' || segment === '..'),
    'must be a repository-relative pattern',
  );

const scopePatterns = z.array(scopePattern).max(20);

/** A reviewer's effective state for one repository: the toggle plus its D-031 scope. */
export const RepositoryReviewerSchema = z.object({
  reviewerId: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  pathsInclude: z.array(z.string()),
  pathsExclude: z.array(z.string()),
  contextPaths: z.array(z.string()),
});

/** The body of one reviewer entry in `PUT /api/repositories/:repoId/reviewers`. */
export const RepositoryReviewerUpdateSchema = z.object({
  reviewerId: z.string().min(1),
  enabled: z.boolean(),
  pathsInclude: scopePatterns.optional(),
  pathsExclude: scopePatterns.optional(),
  contextPaths: scopePatterns.optional(),
});

/** D-032: the patterns to test, matched against the newest run's changed files. */
export const ScopePreviewRequestSchema = z.object({
  pathsInclude: scopePatterns.default([]),
  pathsExclude: scopePatterns.default([]),
});

/** `POST /api/repositories/:repoId/scope-preview`. */
export const ScopePreviewResponseSchema = z.object({
  runId: z.string().nullable(),
  headSha: z.string().nullable(),
  total: z.number(),
  matched: z.array(z.string()),
});

/** One open pull request in the manual try-run picker. */
export const RepositoryPullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  headSha: z.string(),
  authorLogin: z.string().nullable(),
  draft: z.boolean(),
});
