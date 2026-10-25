import type {
  Finding,
  InstanceSettings,
  ProviderFlavor,
  ProviderUsage,
  RunMode,
  RunReviewerScope,
  RunSkippedReviewer,
} from '@jury-forge/shared';
import { DurableObject } from 'cloudflare:workers';
import { consolidateReview, parseReviewerOutput, type ReviewerFindings } from './lib/consolidate';
import {
  buildReferenceContextBlock,
  buildRepoInstructionsBlock,
  buildReviewContext,
  buildReviewPrompt,
  buildSystemPrompt,
  contextNotes,
  isSkippedName,
  prioritizedOrder,
  REPO_INSTRUCTION_FILES,
  truncateToBytes,
  type PullFile,
  type RepoInstructionFile,
  type ReviewContext,
} from './lib/context';
import { decryptSecret, keyRingValues, loadKeyRing } from './lib/crypto';
import {
  GitHubApiError,
  createInstallationToken,
  createPullReview,
  fetchPullFiles,
  fetchPullRequest,
  fetchRepoFileText,
  fetchRepoTree,
  listPullReviews,
  minimizeComment,
  type PullFileEntry,
  type PullRequestInfo,
} from './lib/github';
import { loadGitHubApp } from './lib/github-app';
import { callProvider } from './lib/providers';
import { compareFindings, findingKey } from './lib/resolution';
import {
  contextRoot,
  hasPathFilters,
  parsePatternList,
  referenceCandidates,
  scopedFiles,
} from './lib/scope';
import { DEFAULT_SETTINGS, loadSettings } from './lib/settings';

const FILES_CAP = 300;
const CONTEXT_BATCH_SIZE = 25;
// D-031: reference contents are fetched in small batches so a segment stays inside the free
// plan's 50-subrequest-per-invocation limit (the tree listing costs one more).
const REFERENCE_BATCH_SIZE = 8;
const RETRY_BACKOFF_SECONDS = [10, 60, 300];
const MAX_RETRIES = RETRY_BACKOFF_SECONDS.length;

export interface RunPayload {
  deliveryId: string;
  repoId: number;
  repoFullName: string;
  prNumber: number;
  headSha: string;
  action: string;
  installationId: number;
  mode: RunMode;
  /** Manual runs only: exactly the reviewers to run. */
  reviewerIds?: string[];
}

type Step =
  | 'config'
  | 'files'
  | 'scope'
  | 'context'
  | 'reference'
  | 'prepare'
  | 'review'
  | 'consolidate'
  | 'post';

type TerminalStatus = 'completed' | 'failed' | 'skipped';

interface StoredReviewer {
  id: string;
  name: string;
  instructions: string;
  rules: string;
  flavor: ProviderFlavor;
  baseUrl: string;
  model: string;
  params: Record<string, unknown>;
  apiKeyEnc: string;
  /** D-031 — this reviewer's scope on the run's repository. */
  pathsInclude: string[];
  pathsExclude: string[];
  contextPaths: string[];
}

interface ReviewerOutcome {
  status: 'completed' | 'failed';
  findings: Finding[] | null;
  summary: string | null;
  usage: ProviderUsage | null;
  error: string | null;
}

interface ReviewPlan {
  body: string;
  comments: { path: string; line: number; startLine?: number; body: string }[];
  event: 'COMMENT' | 'REQUEST_CHANGES';
}

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
  paths_include: string;
  paths_exclude: string;
  context_paths: string;
}

function runIdFor(payload: RunPayload): string {
  return `${payload.repoId}:${payload.prNumber}:${payload.headSha}:${payload.deliveryId}`;
}

function findingLocation(finding: Finding): string {
  return finding.line !== undefined ? `${finding.file}:${finding.line}` : finding.file;
}

function bucketLine(label: string, findings: Finding[]): string {
  if (findings.length === 0) {
    return `- **${label}** (0): none`;
  }
  const shown = findings
    .slice(0, 20)
    .map((finding) => `\`${findingLocation(finding)}\` — ${finding.title}`);
  if (findings.length > 20) {
    shown.push(`… and ${findings.length - 20} more`);
  }
  return `- **${label}** (${findings.length}): ${shown.join('; ')}`;
}

/** D-032: the patterns that decide a reviewer's scope, as one readable clause. */
function scopeFilters(scope: { pathsInclude: string[]; pathsExclude: string[] }): string {
  const parts: string[] = [];
  if (scope.pathsInclude.length > 0) {
    parts.push(`include ${scope.pathsInclude.join(', ')}`);
  }
  if (scope.pathsExclude.length > 0) {
    parts.push(`exclude ${scope.pathsExclude.join(', ')}`);
  }
  return parts.length > 0 ? parts.join('; ') : 'its path filters';
}

function scopeSummary(scope: RunReviewerScope, changedFiles: number): string {
  const parts = [`${scope.visibleFiles} of ${changedFiles} changed file(s) in scope`];
  if (scope.pathsInclude.length > 0) {
    parts.push(`include ${scope.pathsInclude.join(', ')}`);
  }
  if (scope.pathsExclude.length > 0) {
    parts.push(`exclude ${scope.pathsExclude.join(', ')}`);
  }
  if (scope.contextPaths.length > 0) {
    parts.push(`reference ${scope.referenceFiles.length} file(s)`);
  }
  return parts.join('; ');
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

/**
 * One Durable Object per review run (binding `RUNS`, name = run id). `start()` is kicked by the
 * webhook and schedules the first alarm; every alarm segment executes exactly one step of the
 * run, with ≤3 backoff retries (10 s / 60 s / 300 s) per step. `runs`/`run_reviewers` rows in
 * D1 are the durable history.
 */
export class RunEngine extends DurableObject<Env> {
  async start(payload: RunPayload): Promise<void> {
    if (await this.ctx.storage.get<RunPayload>('payload')) {
      return; // idempotent — duplicate kicks are safe
    }
    await this.ctx.storage.put('payload', payload);
    await this.ctx.storage.put('step', 'config' satisfies Step);
    await this.ctx.storage.put('attempt', 0);
    await this.env.DB.prepare(
      "INSERT OR REPLACE INTO runs (id, delivery_id, repo_id, pr_number, head_sha, event, mode, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'running')",
    )
      .bind(
        runIdFor(payload),
        payload.deliveryId,
        payload.repoId,
        payload.prNumber,
        payload.headSha,
        payload.action,
        payload.mode,
      )
      .run();
    await this.ctx.storage.setAlarm(Date.now());
  }

  async alarm(): Promise<void> {
    const payload = await this.ctx.storage.get<RunPayload>('payload');
    if (!payload || (await this.ctx.storage.get<boolean>('finished'))) {
      return;
    }
    const step = (await this.ctx.storage.get<Step>('step')) ?? 'config';
    let next: Step | 'finished';
    try {
      next = await this.runStep(step, payload);
    } catch (error) {
      await this.handleStepError(step, payload, error);
      return;
    }
    if (next === 'finished') {
      return;
    }
    await this.ctx.storage.put('attempt', 0);
    await this.ctx.storage.put('step', next);
    await this.ctx.storage.setAlarm(Date.now());
  }

  private async handleStepError(step: Step, payload: RunPayload, error: unknown): Promise<void> {
    const nonRetryable =
      error instanceof GitHubApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 429;
    const attempt = (await this.ctx.storage.get<number>('attempt')) ?? 0;
    if (!nonRetryable && attempt < MAX_RETRIES) {
      const backoff = RETRY_BACKOFF_SECONDS[attempt];
      await this.ctx.storage.put('attempt', attempt + 1);
      await this.ctx.storage.setAlarm(Date.now() + backoff * 1_000);
      return;
    }
    console.error(`run ${runIdFor(payload)} failed in step ${step}:`, error);
    await this.finishRun(payload, 'failed', errorMessage(error), null);
  }

  private async runStep(step: Step, payload: RunPayload): Promise<Step | 'finished'> {
    switch (step) {
      case 'config':
        return this.stepConfig(payload);
      case 'files':
        return this.stepFiles(payload);
      case 'scope':
        return this.stepScope(payload);
      case 'context':
        return this.stepContext();
      case 'reference':
        return this.stepReference(payload);
      case 'prepare':
        return this.stepPrepare();
      case 'review':
        return this.stepReview();
      case 'consolidate':
        return this.stepConsolidate(payload);
      case 'post':
        return this.stepPost(payload);
      default:
        throw new Error(`unknown step: ${String(step)}`);
    }
  }

  private async stepConfig(payload: RunPayload): Promise<Step | 'finished'> {
    const db = this.env.DB;
    const manual = payload.mode === 'manual';
    const runId = runIdFor(payload);

    if (!manual) {
      const repository = await db
        .prepare('SELECT enabled FROM repositories WHERE repo_id = ?')
        .bind(payload.repoId)
        .first<{ enabled: number }>();
      if (!repository || repository.enabled !== 1) {
        await this.finishRun(payload, 'skipped', null, null);
        return 'finished';
      }

      // D-018: newest run wins — a run that begins after a newer run exists for the same PR skips
      // (covers supersession on rapid pushes and duplicate deliveries of the same revision).
      const started = await db
        .prepare('SELECT created_at FROM runs WHERE id = ?')
        .bind(runId)
        .first<{ created_at: number }>();
      if (started) {
        const newer = await db
          .prepare(
            `SELECT 1 FROM runs
             WHERE repo_id = ? AND pr_number = ?
               AND (created_at > ? OR (created_at = ? AND id > ?))
             LIMIT 1`,
          )
          .bind(payload.repoId, payload.prNumber, started.created_at, started.created_at, runId)
          .first();
        if (newer) {
          await this.finishRun(payload, 'skipped', null, null);
          return 'finished';
        }
      }
    }

    let rows: D1Result<ReviewerRow>;
    if (manual) {
      // D-028: a manual run ignores the repository-enabled gate and the superseded-run skip, and
      // runs exactly the named reviewers — no repository filter on this query.
      const reviewerIds = payload.reviewerIds ?? [];
      if (reviewerIds.length === 0) {
        await this.finishRun(payload, 'failed', 'reviewer_unavailable', null);
        return 'finished';
      }
      const placeholders = reviewerIds.map(() => '?').join(', ');
      rows = await db
        .prepare(
          `SELECT r.id, r.name, r.instructions, r.rules, r.flavor, r.base_url, r.api_key_enc, r.model, r.params_json,
                  COALESCE(rr.paths_include, '[]') AS paths_include,
                  COALESCE(rr.paths_exclude, '[]') AS paths_exclude,
                  COALESCE(rr.context_paths, '[]') AS context_paths
           FROM reviewers r
           LEFT JOIN reviewer_repositories rr ON rr.reviewer_id = r.id AND rr.repo_id = ?
           WHERE r.id IN (${placeholders})
             AND r.enabled = 1
             AND r.api_key_enc != ''
           ORDER BY r.name COLLATE NOCASE, r.id`,
        )
        .bind(payload.repoId, ...reviewerIds)
        .all<ReviewerRow>();
    } else {
      rows = await db
        .prepare(
          `SELECT r.id, r.name, r.instructions, r.rules, r.flavor, r.base_url, r.api_key_enc, r.model, r.params_json,
                  COALESCE(rr.paths_include, '[]') AS paths_include,
                  COALESCE(rr.paths_exclude, '[]') AS paths_exclude,
                  COALESCE(rr.context_paths, '[]') AS context_paths
           FROM reviewers r
           LEFT JOIN reviewer_repositories rr ON rr.reviewer_id = r.id AND rr.repo_id = ?
           WHERE r.enabled = 1
             AND COALESCE(rr.enabled, 1) = 1
           ORDER BY r.name COLLATE NOCASE, r.id`,
        )
        .bind(payload.repoId)
        .all<ReviewerRow>();
    }
    if (rows.results.length === 0) {
      if (manual) {
        await this.finishRun(payload, 'failed', 'reviewer_unavailable', null);
      } else {
        await this.finishRun(payload, 'skipped', null, null);
      }
      return 'finished';
    }
    const reviewers: StoredReviewer[] = rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      instructions: row.instructions,
      rules: row.rules,
      flavor: row.flavor,
      baseUrl: row.base_url,
      model: row.model,
      params: JSON.parse(row.params_json) as Record<string, unknown>,
      apiKeyEnc: row.api_key_enc,
      pathsInclude: parsePatternList(row.paths_include),
      pathsExclude: parsePatternList(row.paths_exclude),
      contextPaths: parsePatternList(row.context_paths),
    }));
    await this.ctx.storage.put('reviewers', reviewers);
    const settings = await loadSettings(db);
    await this.ctx.storage.put('settings', settings);

    // D-020: the newest earlier run for this repository + pull request that recorded findings
    // supplies each reviewer's previous findings, and their de-duplicated union.
    // D-028: only automatic runs qualify. A manual trial posts nothing to GitHub, so its findings
    // are not "previously reported" on this pull request — counting them would change what an
    // automatic run asks its reviewers and what it publishes, which slice C promises it does not.
    const previousRows = await db
      .prepare(
        `SELECT rr.reviewer_id, rr.findings_json
         FROM run_reviewers rr
         JOIN runs r ON r.id = rr.run_id
         WHERE r.repo_id = ? AND r.pr_number = ?
           AND r.id != ?
           AND r.mode = 'auto'
           AND r.status IN ('completed', 'failed')
           AND rr.findings_json IS NOT NULL AND rr.findings_json != '[]'
         ORDER BY r.created_at DESC, r.id DESC, rr.reviewer_id`,
      )
      .bind(payload.repoId, payload.prNumber, runId)
      .all<{ reviewer_id: string; findings_json: string }>();
    const previousByReviewer: Record<string, Finding[]> = {};
    const previousFindings: Finding[] = [];
    const seenKeys = new Set<string>();
    for (const row of previousRows.results) {
      if (previousByReviewer[row.reviewer_id] !== undefined) {
        continue;
      }
      const findings = JSON.parse(row.findings_json) as Finding[];
      previousByReviewer[row.reviewer_id] = findings;
      for (const finding of findings) {
        const key = findingKey(finding);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          previousFindings.push(finding);
        }
      }
    }
    await this.ctx.storage.put('previousByReviewer', previousByReviewer);
    await this.ctx.storage.put('previousFindings', previousFindings);

    const keyValues = keyRingValues(this.env);
    if (!keyValues) {
      throw new Error('encryption_key_unset');
    }
    const app = await loadGitHubApp(db, await loadKeyRing(keyValues));
    if (!app) {
      throw new Error('setup_required');
    }
    await this.ctx.storage.put('botLogin', `${app.slug}[bot]`);
    const token = await createInstallationToken(app.appId, app.privateKey, payload.installationId);
    await this.ctx.storage.put('token', token);

    // D-022: opt-in repository instructions, read at the PR's head SHA. A failed or missing
    // file is skipped so it never fails the run; the key is absent when the setting is off.
    if (settings.repoInstructions) {
      const sections: RepoInstructionFile[] = [];
      for (const path of REPO_INSTRUCTION_FILES) {
        try {
          const text = await fetchRepoFileText(token, payload.repoFullName, path, payload.headSha);
          if (text !== null) {
            sections.push({ path, text });
          }
        } catch (error) {
          console.error(
            `run ${runIdFor(payload)} repository instruction fetch failed (${path}):`,
            error,
          );
        }
      }
      await this.ctx.storage.put(
        'repoInstructions',
        buildRepoInstructionsBlock(sections, settings.repoInstructionsMaxBytes),
      );
    }

    const pullRequest = await fetchPullRequest(token, payload.repoFullName, payload.prNumber);
    await this.ctx.storage.put('pr', pullRequest);

    await this.ctx.storage.put('fileCount', 0);
    await this.ctx.storage.put('cursor', 1);
    return 'files';
  }

  private async stepFiles(payload: RunPayload): Promise<Step | 'finished'> {
    const token = await this.require<string>('token');
    const cursor = (await this.ctx.storage.get<number>('cursor')) ?? 1;
    const fileCount = (await this.ctx.storage.get<number>('fileCount')) ?? 0;

    const page = await fetchPullFiles(token, payload.repoFullName, payload.prNumber, cursor);
    const accepted = page.files.slice(0, Math.max(FILES_CAP - fileCount, 0));
    if (accepted.length > 0) {
      const entries: Record<string, PullFileEntry> = {};
      accepted.forEach((file, index) => {
        entries[`file:${fileCount + index}`] = file;
      });
      await this.ctx.storage.put(entries);
    }
    const total = fileCount + accepted.length;
    await this.ctx.storage.put('fileCount', total);

    if (page.done || total >= FILES_CAP) {
      await this.ctx.storage.put('cursor', 0);
      // D-032: the run keeps the changed-file names so it can explain its scope later.
      await this.ctx.storage.put('changedFiles', await this.changedFileNames());
      return 'scope';
    }
    await this.ctx.storage.put('cursor', cursor + 1);
    return 'files';
  }

  /**
   * D-031: the changed-file names decide which reviewers survive their path filters. A filtered
   * reviewer's visible files are kept for its own context; an unfiltered reviewer keeps the union
   * context built next. Manual runs never filter (D-028).
   */
  private async stepScope(payload: RunPayload): Promise<Step | 'finished'> {
    if (payload.mode === 'manual') {
      return 'context';
    }
    const reviewers = await this.require<StoredReviewer[]>('reviewers');
    const files = await this.changedFileNames();
    const active: StoredReviewer[] = [];
    const visible: Record<string, string[]> = {};
    const skipped: RunSkippedReviewer[] = [];
    for (const reviewer of reviewers) {
      if (!hasPathFilters(reviewer)) {
        active.push(reviewer);
        continue;
      }
      const keep = scopedFiles(files, reviewer);
      if (keep.length === 0) {
        skipped.push({
          reviewerId: reviewer.id,
          name: reviewer.name,
          pathsInclude: reviewer.pathsInclude,
          pathsExclude: reviewer.pathsExclude,
        });
        continue;
      }
      visible[`visible:${reviewer.id}`] = keep;
      active.push(reviewer);
    }
    if (Object.keys(visible).length > 0) {
      await this.ctx.storage.put(visible);
    }
    // D-032: a dropped reviewer is recorded, never silently absent.
    await this.ctx.storage.put('skippedReviewers', skipped);
    // Replace the list before finishing so a skipped run writes no `run_reviewers` rows.
    await this.ctx.storage.put('reviewers', active);
    if (active.length === 0) {
      await this.finishRun(payload, 'skipped', null, null);
      return 'finished';
    }
    return 'context';
  }

  /** Every textual patch the run fetched, for consolidation's commentable-line check. */
  private async allPatches(): Promise<Map<string, string>> {
    const fileCount = (await this.ctx.storage.get<number>('fileCount')) ?? 0;
    const keys = Array.from({ length: fileCount }, (_, index) => `file:${index}`);
    const patches = new Map<string, string>();
    if (keys.length === 0) {
      return patches;
    }
    const entries = await this.ctx.storage.get<PullFileEntry>(keys);
    for (const key of keys) {
      const entry = entries.get(key);
      // Skipped names stay non-commentable, exactly as the context builder left them.
      if (entry?.patch && !isSkippedName(entry.filename)) {
        patches.set(entry.filename, entry.patch);
      }
    }
    return patches;
  }

  private async changedFileNames(): Promise<string[]> {
    const fileCount = (await this.ctx.storage.get<number>('fileCount')) ?? 0;
    const keys = Array.from({ length: fileCount }, (_, index) => `file:${index}`);
    if (keys.length === 0) {
      return [];
    }
    const entries = await this.ctx.storage.get<PullFileEntry>(keys);
    const names: string[] = [];
    for (const key of keys) {
      const entry = entries.get(key);
      if (entry) {
        names.push(entry.filename);
      }
    }
    return names;
  }

  private async stepContext(): Promise<Step | 'finished'> {
    const settings = (await this.ctx.storage.get<InstanceSettings>('settings')) ?? DEFAULT_SETTINGS;
    const fileCount = await this.require<number>('fileCount');
    let order = await this.ctx.storage.get<number[]>('fileOrder');
    if (!order) {
      order = await this.computeFileOrder(fileCount);
      await this.ctx.storage.put('fileOrder', order);
    }
    const cursor = (await this.ctx.storage.get<number>('cursor')) ?? 0;
    const keys = order.slice(cursor, cursor + CONTEXT_BATCH_SIZE).map((index) => `file:${index}`);
    const entries =
      keys.length > 0
        ? await this.ctx.storage.get<PullFileEntry>(keys)
        : new Map<string, PullFileEntry>();
    const batch: PullFile[] = [];
    for (const key of keys) {
      const entry = entries.get(key);
      if (entry) {
        batch.push({ filename: entry.filename, patch: entry.patch });
      }
    }
    const previous = await this.ctx.storage.get<ReviewContext>('context');
    await this.ctx.storage.put(
      'context',
      buildReviewContext(batch, previous, {
        totalBytes: settings.contextTotalBytes,
        fileBytes: settings.contextFileBytes,
      }),
    );

    const next = cursor + keys.length;
    if (next < order.length) {
      await this.ctx.storage.put('cursor', next);
      return 'context';
    }
    await this.ctx.storage.put('cursor', 0);
    return 'reference';
  }

  /**
   * D-031: read the files a reviewer's `context_paths` name, at the reviewed revision. The tree is
   * listed once; contents arrive in small batches so each segment stays inside the subrequest
   * limit. A failure here never fails the run — the reviewers simply lose that context.
   */
  private async stepReference(payload: RunPayload): Promise<Step | 'finished'> {
    const reviewers = await this.require<StoredReviewer[]>('reviewers');
    const scoped = reviewers.filter((reviewer) => reviewer.contextPaths.length > 0);
    if (scoped.length === 0) {
      return 'prepare';
    }
    const settings = (await this.ctx.storage.get<InstanceSettings>('settings')) ?? DEFAULT_SETTINGS;
    let queue = await this.ctx.storage.get<string[]>('refQueue');
    if (!queue) {
      const token = await this.require<string>('token');
      // D-032: one listing per distinct literal root, not the whole repository.
      const roots = [
        ...new Set(
          scoped
            .flatMap((reviewer) => reviewer.contextPaths.map((path) => contextRoot(path)))
            .filter((root): root is string => root !== null),
        ),
      ];
      const candidates = new Set<string>();
      const failedRoots: string[] = [];
      let truncated = false;
      for (const root of roots) {
        try {
          const tree = await fetchRepoTree(token, payload.repoFullName, payload.headSha, root);
          truncated = truncated || tree.truncated;
          for (const path of tree.paths) {
            if (!isSkippedName(path)) {
              candidates.add(path);
            }
          }
        } catch (error) {
          failedRoots.push(root === '' ? '/' : root);
          console.error(`run ${runIdFor(payload)} reference tree failed (${root || '/'}):`, error);
        }
      }
      if (failedRoots.length > 0) {
        await this.ctx.storage.put('refRootFailures', failedRoots);
      }
      if (candidates.size === 0 && failedRoots.length > 0) {
        await this.ctx.storage.put('refError', true);
        return 'prepare';
      }
      const candidateList = [...candidates];
      const share = Math.max(1, Math.floor(settings.referenceContextFiles / scoped.length));
      const perReviewer: Record<string, string[]> = {};
      const union: string[] = [];
      const seen = new Set<string>();
      for (const reviewer of scoped) {
        const visible = new Set(
          (await this.ctx.storage.get<string[]>(`visible:${reviewer.id}`)) ?? [],
        );
        const matched = referenceCandidates(candidateList, reviewer.contextPaths)
          .filter((path) => !visible.has(path))
          .slice(0, share);
        perReviewer[`refPaths:${reviewer.id}`] = matched;
        for (const path of matched) {
          if (!seen.has(path)) {
            seen.add(path);
            union.push(path);
          }
        }
      }
      queue = union.slice(0, settings.referenceContextFiles);
      await this.ctx.storage.put(perReviewer);
      await this.ctx.storage.put('refQueue', queue);
      await this.ctx.storage.put('refCursor', 0);
      if (truncated) {
        await this.ctx.storage.put('refTreeTruncated', true);
      }
    }
    const cursor = (await this.ctx.storage.get<number>('refCursor')) ?? 0;
    const batch = queue.slice(cursor, cursor + REFERENCE_BATCH_SIZE);
    if (batch.length === 0) {
      return 'prepare';
    }
    const token = await this.require<string>('token');
    const texts: Record<string, string> = {};
    for (const path of batch) {
      try {
        const text = await fetchRepoFileText(token, payload.repoFullName, path, payload.headSha);
        if (text !== null) {
          texts[`ref:${path}`] = truncateToBytes(text, settings.referenceContextFileBytes);
        }
      } catch (error) {
        console.error(`run ${runIdFor(payload)} reference file failed (${path}):`, error);
      }
    }
    if (Object.keys(texts).length > 0) {
      await this.ctx.storage.put(texts);
    }
    const next = cursor + batch.length;
    if (next < queue.length) {
      await this.ctx.storage.put('refCursor', next);
      return 'reference';
    }
    return 'prepare';
  }

  /** D-018: added/changed source first; docs and renames trail the D-010 budget. */
  private async computeFileOrder(fileCount: number): Promise<number[]> {
    const allKeys = Array.from({ length: fileCount }, (_, index) => `file:${index}`);
    const allEntries = await this.ctx.storage.get<PullFileEntry>(allKeys);
    const present: { index: number; filename: string; status: string }[] = [];
    allKeys.forEach((key, index) => {
      const entry = allEntries.get(key);
      if (entry) {
        present.push({ index, filename: entry.filename, status: entry.status });
      }
    });
    return prioritizedOrder(present).map((local) => {
      const entry = present[local];
      return entry ? entry.index : local;
    });
  }

  /** D-031: a filtered reviewer is prompted with its own file set, ordered and budgeted. */
  private async contextForReviewer(
    reviewer: StoredReviewer,
    union: ReviewContext,
    settings: InstanceSettings,
  ): Promise<ReviewContext> {
    const visible = await this.ctx.storage.get<string[]>(`visible:${reviewer.id}`);
    if (!visible) {
      return union;
    }
    const fileCount = (await this.ctx.storage.get<number>('fileCount')) ?? 0;
    const keys = Array.from({ length: fileCount }, (_, index) => `file:${index}`);
    if (keys.length === 0) {
      return union;
    }
    const entries = await this.ctx.storage.get<PullFileEntry>(keys);
    const wanted = new Set(visible);
    const present: PullFileEntry[] = [];
    for (const key of keys) {
      const entry = entries.get(key);
      if (entry && wanted.has(entry.filename)) {
        present.push(entry);
      }
    }
    const ordered = prioritizedOrder(present).map((local) => present[local]);
    const files: PullFile[] = [];
    for (const entry of ordered) {
      if (entry) {
        files.push({ filename: entry.filename, patch: entry.patch });
      }
    }
    return buildReviewContext(files, undefined, {
      totalBytes: settings.contextTotalBytes,
      fileBytes: settings.contextFileBytes,
    });
  }

  /** D-031: the bounded reference block for a reviewer, or `null` when it has none. */
  private async referenceBlockFor(
    reviewer: StoredReviewer,
    settings: InstanceSettings,
  ): Promise<string | null> {
    const paths = (await this.ctx.storage.get<string[]>(`refPaths:${reviewer.id}`)) ?? [];
    if (paths.length === 0) {
      return null;
    }
    const texts = await this.ctx.storage.get<string>(paths.map((path) => `ref:${path}`));
    const files: RepoInstructionFile[] = [];
    for (const path of paths) {
      const text = texts.get(`ref:${path}`);
      if (text !== undefined) {
        files.push({ path, text });
      }
    }
    return files.length === 0
      ? null
      : buildReferenceContextBlock(files, settings.referenceContextTotalBytes);
  }

  private async stepPrepare(): Promise<Step | 'finished'> {
    const reviewers = await this.require<StoredReviewer[]>('reviewers');
    const pullRequest = await this.require<PullRequestInfo>('pr');
    const context = await this.require<ReviewContext>('context');
    const cursor = (await this.ctx.storage.get<number>('cursor')) ?? 0;

    const reviewer = reviewers[cursor];
    if (!reviewer) {
      throw new Error('reviewer cursor out of range');
    }
    const previousByReviewer =
      (await this.ctx.storage.get<Record<string, Finding[]>>('previousByReviewer')) ?? {};
    const settings = (await this.ctx.storage.get<InstanceSettings>('settings')) ?? DEFAULT_SETTINGS;
    const repoInstructions = await this.ctx.storage.get<string | null>('repoInstructions');
    const reviewerContext = await this.contextForReviewer(reviewer, context, settings);
    const reference = await this.referenceBlockFor(reviewer, settings);
    await this.ctx.storage.put(`prompt:${reviewer.id}`, {
      system: buildSystemPrompt(reviewer, { allowOutOfDiff: reference !== null }),
      user: buildReviewPrompt(pullRequest, reviewerContext, {
        previousFindings: previousByReviewer[reviewer.id] ?? [],
        descriptionLimit: settings.descriptionLimit,
        repoInstructions,
        reference,
      }),
    });

    if (cursor + 1 < reviewers.length) {
      await this.ctx.storage.put('cursor', cursor + 1);
      return 'prepare';
    }
    await this.ctx.storage.put('cursor', 0);
    return 'review';
  }

  private async stepReview(): Promise<Step | 'finished'> {
    const reviewers = await this.require<StoredReviewer[]>('reviewers');
    const keyValues = keyRingValues(this.env);
    if (!keyValues) {
      throw new Error('encryption_key_unset');
    }
    const ring = await loadKeyRing(keyValues);
    const prompts = await this.ctx.storage.get<{ system: string; user: string }>(
      reviewers.map((reviewer) => `prompt:${reviewer.id}`),
    );

    const settled = await Promise.allSettled(
      reviewers.map(async (reviewer) => {
        const prompt = prompts.get(`prompt:${reviewer.id}`);
        if (!prompt) {
          throw new Error('prompt missing');
        }
        const apiKey =
          reviewer.apiKeyEnc === '' ? '' : await decryptSecret(ring, reviewer.apiKeyEnc);
        const value = await callProvider({
          flavor: reviewer.flavor,
          baseUrl: reviewer.baseUrl,
          apiKey,
          model: reviewer.model,
          params: reviewer.params,
          system: prompt.system,
          user: prompt.user,
        });
        return { output: parseReviewerOutput(value.value), usage: value.usage };
      }),
    );

    const entries: Record<string, ReviewerOutcome> = {};
    reviewers.forEach((reviewer, index) => {
      const result = settled[index];
      entries[`outcome:${reviewer.id}`] =
        result.status === 'fulfilled'
          ? {
              status: 'completed',
              findings: result.value.output.findings,
              summary: result.value.output.summary,
              usage: result.value.usage,
              error: null,
            }
          : {
              status: 'failed',
              findings: null,
              summary: null,
              usage: null,
              error: errorMessage(result.reason),
            };
    });
    await this.ctx.storage.put(entries);
    return 'consolidate';
  }

  private async stepConsolidate(payload: RunPayload): Promise<Step | 'finished'> {
    const reviewers = await this.require<StoredReviewer[]>('reviewers');
    const context = await this.require<ReviewContext>('context');
    const outcomes = await this.ctx.storage.get<ReviewerOutcome>(
      reviewers.map((reviewer) => `outcome:${reviewer.id}`),
    );
    const settings = (await this.ctx.storage.get<InstanceSettings>('settings')) ?? DEFAULT_SETTINGS;

    const allFailed = reviewers.every(
      (reviewer) => outcomes.get(`outcome:${reviewer.id}`)?.status === 'failed',
    );
    if (allFailed) {
      await this.finishRun(payload, 'failed', 'all_reviewers_failed', null);
      return 'finished';
    }

    const visibleByReviewer = new Map<string, string[]>();
    for (const reviewer of reviewers) {
      const visible = await this.ctx.storage.get<string[]>(`visible:${reviewer.id}`);
      if (visible) {
        visibleByReviewer.set(reviewer.id, visible);
      }
    }
    const withFindings: ReviewerFindings[] = [];
    for (const reviewer of reviewers) {
      const outcome = outcomes.get(`outcome:${reviewer.id}`);
      if (outcome?.status === 'completed' && outcome.findings) {
        const visible = visibleByReviewer.get(reviewer.id);
        withFindings.push({
          reviewerId: reviewer.id,
          findings: outcome.findings,
          ...(visible ? { visible } : {}),
        });
      }
    }
    // D-031: commentable lines come from every file fetched for the pull request, not only the
    // trimmed union context, so a scoped reviewer's file is still eligible after another
    // reviewer's budget dropped it from the union.
    const patches = await this.allPatches();
    const consolidated = consolidateReview(withFindings, patches, {
      perReviewer: settings.inlineCommentsPerReviewer,
      perRun: settings.inlineCommentsPerRun,
    });
    const overflowByReviewer = new Map(
      consolidated.overflow.map((group) => [group.reviewerId, group.findings]),
    );
    const inlineByReviewer = new Map<string, number>();
    for (const selection of consolidated.inline) {
      inlineByReviewer.set(
        selection.reviewerId,
        (inlineByReviewer.get(selection.reviewerId) ?? 0) + 1,
      );
    }

    const totalFindings = withFindings.reduce((sum, group) => sum + group.findings.length, 0);
    const errorFindings = withFindings.reduce(
      (sum, group) => sum + group.findings.filter((finding) => finding.severity === 'error').length,
      0,
    );
    const blocking = settings.blockingMode && errorFindings >= settings.blockingErrorThreshold;
    const overflowCount = consolidated.overflow.reduce(
      (sum, group) => sum + group.findings.length,
      0,
    );
    const failedNames = reviewers
      .filter((reviewer) => outcomes.get(`outcome:${reviewer.id}`)?.status === 'failed')
      .map((reviewer) => reviewer.name);

    const changedFiles = (await this.ctx.storage.get<string[]>('changedFiles')) ?? [];
    const scopeRecords: Record<string, RunReviewerScope> = {};
    let referenceRequested = 0;
    for (const reviewer of reviewers) {
      const paths = (await this.ctx.storage.get<string[]>(`refPaths:${reviewer.id}`)) ?? [];
      referenceRequested += paths.length;
      const referenceFiles: string[] = [];
      if (paths.length > 0) {
        const texts = await this.ctx.storage.get<string>(paths.map((path) => `ref:${path}`));
        for (const path of paths) {
          if (texts.get(`ref:${path}`) !== undefined) {
            referenceFiles.push(path);
          }
        }
      }
      scopeRecords[reviewer.id] = {
        pathsInclude: reviewer.pathsInclude,
        pathsExclude: reviewer.pathsExclude,
        contextPaths: reviewer.contextPaths,
        visibleFiles: (visibleByReviewer.get(reviewer.id) ?? changedFiles).length,
        referenceFiles,
      };
    }
    await this.ctx.storage.put('scopeRecords', scopeRecords);

    const sections: string[] = ['## Jury Forge review', ''];
    sections.push(
      `**${reviewers.length}** reviewer(s) ran on \`${payload.headSha.slice(0, 7)}\` — **${totalFindings}** finding(s): ${consolidated.inline.length} inline, ${overflowCount} in this summary.`,
    );
    for (const reviewer of reviewers) {
      const outcome = outcomes.get(`outcome:${reviewer.id}`);
      sections.push('', `### ${reviewer.name}`);
      if (!outcome) {
        sections.push('_Did not run._');
        continue;
      }
      if (outcome.status === 'failed') {
        sections.push(`_Failed: ${outcome.error ?? 'unknown error'}_`);
        continue;
      }
      if (outcome.summary) {
        sections.push('', outcome.summary, '');
      }
      const record = scopeRecords[reviewer.id];
      if (record) {
        sections.push(`_Scope: ${scopeSummary(record, changedFiles.length)}._`);
      }
      const findings = outcome.findings ?? [];
      const overflow = overflowByReviewer.get(reviewer.id) ?? [];
      const inlineCount = inlineByReviewer.get(reviewer.id) ?? 0;
      if (findings.length === 0) {
        sections.push('No findings.');
        continue;
      }
      sections.push(
        `${findings.length} finding(s) — ${inlineCount} inline${overflow.length > 0 ? `, ${overflow.length} below` : ''}.`,
      );
      for (const finding of overflow) {
        const location =
          finding.line !== undefined ? `${finding.file}:${finding.line}` : finding.file;
        sections.push('', `- \`${location}\` — **${finding.severity}** — ${finding.title}`);
        sections.push(`  > ${finding.body.split('\n').join('\n  > ')}`);
      }
    }

    const skippedReviewers =
      (await this.ctx.storage.get<RunSkippedReviewer[]>('skippedReviewers')) ?? [];
    if (skippedReviewers.length > 0) {
      sections.push('', '### Not run');
      for (const reviewer of skippedReviewers) {
        sections.push(
          `- **${reviewer.name}** — no changed file matched ${scopeFilters(reviewer)}.`,
        );
      }
    }

    const previousFindings = (await this.ctx.storage.get<Finding[]>('previousFindings')) ?? [];
    if (previousFindings.length > 0) {
      const currentFindings = withFindings.flatMap((group) => group.findings);
      const buckets = compareFindings(previousFindings, currentFindings);
      sections.push(
        '',
        '### Previous findings',
        '_Compared with the last run on this pull request. "Resolved" means this run did not report the item again — not that a fix was verified._',
        '',
        bucketLine('Resolved', buckets.resolved),
        bucketLine('Still present', buckets.stillPresent),
        bucketLine('New', buckets.new),
      );
    }

    const notes: string[] = [
      ...contextNotes(context, {
        totalBytes: settings.contextTotalBytes,
        fileBytes: settings.contextFileBytes,
      }),
    ];
    const capHit =
      consolidated.inline.length >= settings.inlineCommentsPerRun ||
      [...inlineByReviewer.values()].some((count) => count >= settings.inlineCommentsPerReviewer);
    if (capHit) {
      notes.push(
        `Inline comments are capped at ${settings.inlineCommentsPerReviewer} per reviewer and ${settings.inlineCommentsPerRun} per run (D-009); the remaining findings are listed above.`,
      );
    }
    if (blocking) {
      notes.push(
        `Blocking mode is on and this run found ${errorFindings} error finding(s), meeting the threshold of ${settings.blockingErrorThreshold} — the review requests changes.`,
      );
    } else if (settings.blockingMode) {
      notes.push(
        `Blocking mode is on, but this run's ${errorFindings} error finding(s) stayed under the threshold of ${settings.blockingErrorThreshold} — the review comments.`,
      );
    }
    if (failedNames.length > 0) {
      notes.push(`Failed reviewer(s): ${failedNames.join(', ')}.`);
    }
    const outsideDiff = consolidated.overflow.some((group) =>
      group.findings.some((finding) => !patches.has(finding.file)),
    );
    const outOfScope = withFindings.some((group) => {
      const visible = group.visible;
      return (
        visible !== undefined && group.findings.some((finding) => !visible.includes(finding.file))
      );
    });
    if (outsideDiff || outOfScope) {
      notes.push(
        'Findings on files outside the diff, or outside a reviewer’s path scope, are listed above; inline comments stay on changed lines inside that scope (D-032).',
      );
    }
    const referenceQueue = (await this.ctx.storage.get<string[]>('refQueue')) ?? [];
    if (referenceRequested > referenceQueue.length) {
      notes.push(
        `Reference context is capped at ${settings.referenceContextFiles} file(s) per run (D-031); ${referenceRequested - referenceQueue.length} matching file(s) were not fetched.`,
      );
    }
    if (await this.ctx.storage.get<boolean>('refError')) {
      notes.push('Reference context could not be listed for this run; the reviews ran without it.');
    }
    const failedRoots = (await this.ctx.storage.get<string[]>('refRootFailures')) ?? [];
    if (failedRoots.length > 0) {
      notes.push(
        `Reference context could not be listed for ${failedRoots.join(', ')}; those files were not included.`,
      );
    }
    if (await this.ctx.storage.get<boolean>('refTreeTruncated')) {
      notes.push(
        "GitHub's repository listing was truncated, so reference context may be incomplete.",
      );
    }
    if (notes.length > 0) {
      sections.push('', '---', '_Notes:_', ...notes.map((note) => `- ${note}`));
    }

    const nameOf = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.name]));
    const comments = consolidated.inline.map((selection) => {
      const comment: { path: string; line: number; startLine?: number; body: string } = {
        path: selection.finding.file,
        line: selection.finding.line,
        body: `**${nameOf.get(selection.reviewerId) ?? 'Reviewer'}** — ${selection.finding.severity}: ${selection.finding.title}\n\n${selection.finding.body}`,
      };
      if (selection.finding.startLine !== undefined) {
        comment.startLine = selection.finding.startLine;
      }
      return comment;
    });
    const plan: ReviewPlan = {
      body: sections.join('\n'),
      comments,
      event: blocking ? 'REQUEST_CHANGES' : 'COMMENT',
    };
    await this.ctx.storage.put('plan', plan);
    return 'post';
  }

  private async stepPost(payload: RunPayload): Promise<Step | 'finished'> {
    if (payload.mode === 'manual') {
      // D-028: a manual try run posts nothing to GitHub.
      await this.finishRun(payload, 'completed', null, null);
      return 'finished';
    }
    const token = await this.require<string>('token');
    const plan = await this.require<ReviewPlan>('plan');
    const review = await createPullReview(token, payload.repoFullName, payload.prNumber, {
      commitId: payload.headSha,
      body: plan.body,
      comments: plan.comments,
      event: plan.event,
    });
    await this.minimizePreviousReviews(token, payload, review.reviewId);
    await this.finishRun(payload, 'completed', null, review.htmlUrl);
    return 'finished';
  }

  /** D-018: keep the PR resting on the latest verdict — best-effort, never fails the run. */
  private async minimizePreviousReviews(
    token: string,
    payload: RunPayload,
    currentReviewId: number,
  ): Promise<void> {
    const botLogin = await this.ctx.storage.get<string>('botLogin');
    if (!botLogin) {
      return;
    }
    try {
      const reviews = await listPullReviews(token, payload.repoFullName, payload.prNumber);
      for (const review of reviews) {
        if (review.id !== currentReviewId && review.authorLogin === botLogin) {
          await minimizeComment(token, review.nodeId);
        }
      }
    } catch (error) {
      console.error(`run ${runIdFor(payload)} review minimization failed:`, error);
    }
  }

  private async finishRun(
    payload: RunPayload,
    status: TerminalStatus,
    error: string | null,
    reviewUrl: string | null,
  ): Promise<void> {
    if (await this.ctx.storage.get<boolean>('finished')) {
      return;
    }
    await this.ctx.storage.put('finished', true);

    const reviewers = (await this.ctx.storage.get<StoredReviewer[]>('reviewers')) ?? [];
    const outcomes =
      reviewers.length > 0
        ? await this.ctx.storage.get<ReviewerOutcome>(
            reviewers.map((reviewer) => `outcome:${reviewer.id}`),
          )
        : new Map<string, ReviewerOutcome>();
    // D-032: the run record explains its own scope — the files, the reviewers it dropped, and
    // what each survivor saw.
    const changedFiles = (await this.ctx.storage.get<string[]>('changedFiles')) ?? [];
    const skippedReviewers =
      (await this.ctx.storage.get<RunSkippedReviewer[]>('skippedReviewers')) ?? [];
    const scopeRecords =
      (await this.ctx.storage.get<Record<string, RunReviewerScope>>('scopeRecords')) ?? {};

    const statements = [
      this.env.DB.prepare(
        'UPDATE runs SET status = ?, error = ?, review_url = ?, files_json = ?, scope_skip_json = ?, finished_at = unixepoch() WHERE id = ?',
      ).bind(
        status,
        error,
        reviewUrl,
        JSON.stringify(changedFiles),
        JSON.stringify(skippedReviewers),
        runIdFor(payload),
      ),
    ];
    if (reviewers.length > 0) {
      for (const reviewer of reviewers) {
        const outcome = outcomes.get(`outcome:${reviewer.id}`);
        const scope = scopeRecords[reviewer.id];
        statements.push(
          this.env.DB.prepare(
            'INSERT OR REPLACE INTO run_reviewers (run_id, reviewer_id, status, findings_json, summary, usage_json, scope_json, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          ).bind(
            runIdFor(payload),
            reviewer.id,
            outcome?.status ?? 'failed',
            outcome?.findings ? JSON.stringify(outcome.findings) : null,
            outcome?.summary ?? null,
            outcome?.usage ? JSON.stringify(outcome.usage) : null,
            scope ? JSON.stringify(scope) : null,
            outcome?.error ?? (outcome ? null : (error ?? 'run failed before this reviewer ran')),
          ),
        );
      }
    }
    await this.env.DB.batch(statements);

    const keys = [...(await this.ctx.storage.list()).keys()].filter(
      (key) => key !== 'payload' && key !== 'finished',
    );
    if (keys.length > 0) {
      await this.ctx.storage.delete(keys);
    }
  }

  private async require<T>(key: string): Promise<T> {
    const value = await this.ctx.storage.get<T>(key);
    if (value === undefined) {
      throw new Error(`run state missing: ${key}`);
    }
    return value;
  }
}
