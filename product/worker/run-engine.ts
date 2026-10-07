import type { Finding, ProviderFlavor } from '@jury-forge/shared';
import { DurableObject } from 'cloudflare:workers';
import {
  FINDING_CAPS,
  consolidateReview,
  parseFindings,
  type ReviewerFindings,
} from './lib/consolidate';
import {
  buildReviewContext,
  buildReviewPrompt,
  buildSystemPrompt,
  contextNotes,
  prioritizedOrder,
  type PullFile,
  type ReviewContext,
} from './lib/context';
import { decryptSecret, importEncryptionKey } from './lib/crypto';
import {
  GitHubApiError,
  createInstallationToken,
  createPullReview,
  fetchPullFiles,
  fetchPullRequest,
  listPullReviews,
  minimizeComment,
  type PullFileEntry,
  type PullRequestInfo,
} from './lib/github';
import { loadGitHubApp } from './lib/github-app';
import { callProvider } from './lib/providers';

const FILES_CAP = 300;
const CONTEXT_BATCH_SIZE = 25;
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
}

type Step = 'config' | 'files' | 'context' | 'prepare' | 'review' | 'consolidate' | 'post';

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
}

interface ReviewerOutcome {
  status: 'completed' | 'failed';
  findings: Finding[] | null;
  error: string | null;
}

interface ReviewPlan {
  body: string;
  comments: { path: string; line: number; body: string }[];
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
}

function runIdFor(payload: RunPayload): string {
  return `${payload.repoId}:${payload.prNumber}:${payload.headSha}:${payload.deliveryId}`;
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
      "INSERT OR REPLACE INTO runs (id, delivery_id, repo_id, pr_number, head_sha, event, status) VALUES (?, ?, ?, ?, ?, ?, 'running')",
    )
      .bind(
        runIdFor(payload),
        payload.deliveryId,
        payload.repoId,
        payload.prNumber,
        payload.headSha,
        payload.action,
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
      case 'context':
        return this.stepContext();
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
    const runId = runIdFor(payload);
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

    const rows = await db
      .prepare(
        `SELECT r.id, r.name, r.instructions, r.rules, r.flavor, r.base_url, r.api_key_enc, r.model, r.params_json
         FROM reviewers r
         WHERE r.enabled = 1
           AND NOT EXISTS (
             SELECT 1 FROM reviewer_repositories rr
             WHERE rr.reviewer_id = r.id AND rr.repo_id = ? AND rr.enabled = 0
           )
         ORDER BY r.name COLLATE NOCASE, r.id`,
      )
      .bind(payload.repoId)
      .all<ReviewerRow>();
    if (rows.results.length === 0) {
      await this.finishRun(payload, 'skipped', null, null);
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
    }));
    await this.ctx.storage.put('reviewers', reviewers);

    const encryptionKeyValue = this.env.ENCRYPTION_KEY;
    if (!encryptionKeyValue) {
      throw new Error('encryption_key_unset');
    }
    const app = await loadGitHubApp(db, await importEncryptionKey(encryptionKeyValue));
    if (!app) {
      throw new Error('setup_required');
    }
    await this.ctx.storage.put('botLogin', `${app.slug}[bot]`);
    const token = await createInstallationToken(app.appId, app.privateKey, payload.installationId);
    await this.ctx.storage.put('token', token);
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
      return 'context';
    }
    await this.ctx.storage.put('cursor', cursor + 1);
    return 'files';
  }

  private async stepContext(): Promise<Step | 'finished'> {
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
    await this.ctx.storage.put('context', buildReviewContext(batch, previous));

    const next = cursor + keys.length;
    if (next < order.length) {
      await this.ctx.storage.put('cursor', next);
      return 'context';
    }
    await this.ctx.storage.put('cursor', 0);
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

  private async stepPrepare(): Promise<Step | 'finished'> {
    const reviewers = await this.require<StoredReviewer[]>('reviewers');
    const pullRequest = await this.require<PullRequestInfo>('pr');
    const context = await this.require<ReviewContext>('context');
    const cursor = (await this.ctx.storage.get<number>('cursor')) ?? 0;

    const reviewer = reviewers[cursor];
    if (!reviewer) {
      throw new Error('reviewer cursor out of range');
    }
    await this.ctx.storage.put(`prompt:${reviewer.id}`, {
      system: buildSystemPrompt(reviewer),
      user: buildReviewPrompt(pullRequest, context),
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
    const encryptionKeyValue = this.env.ENCRYPTION_KEY;
    if (!encryptionKeyValue) {
      throw new Error('encryption_key_unset');
    }
    const encryptionKey = await importEncryptionKey(encryptionKeyValue);
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
          reviewer.apiKeyEnc === '' ? '' : await decryptSecret(encryptionKey, reviewer.apiKeyEnc);
        const value = await callProvider({
          flavor: reviewer.flavor,
          baseUrl: reviewer.baseUrl,
          apiKey,
          model: reviewer.model,
          params: reviewer.params,
          system: prompt.system,
          user: prompt.user,
        });
        return parseFindings(value);
      }),
    );

    const entries: Record<string, ReviewerOutcome> = {};
    reviewers.forEach((reviewer, index) => {
      const result = settled[index];
      entries[`outcome:${reviewer.id}`] =
        result.status === 'fulfilled'
          ? { status: 'completed', findings: result.value, error: null }
          : { status: 'failed', findings: null, error: errorMessage(result.reason) };
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

    const allFailed = reviewers.every(
      (reviewer) => outcomes.get(`outcome:${reviewer.id}`)?.status === 'failed',
    );
    if (allFailed) {
      await this.finishRun(payload, 'failed', 'all_reviewers_failed', null);
      return 'finished';
    }

    const withFindings: ReviewerFindings[] = [];
    for (const reviewer of reviewers) {
      const outcome = outcomes.get(`outcome:${reviewer.id}`);
      if (outcome?.status === 'completed' && outcome.findings) {
        withFindings.push({ reviewerId: reviewer.id, findings: outcome.findings });
      }
    }
    const patches = new Map(context.files.map((file) => [file.filename, file.patch]));
    const consolidated = consolidateReview(withFindings, patches);
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
    const overflowCount = consolidated.overflow.reduce(
      (sum, group) => sum + group.findings.length,
      0,
    );
    const failedNames = reviewers
      .filter((reviewer) => outcomes.get(`outcome:${reviewer.id}`)?.status === 'failed')
      .map((reviewer) => reviewer.name);

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

    const notes: string[] = [...contextNotes(context)];
    const capHit =
      consolidated.inline.length >= FINDING_CAPS.inlinePerRun ||
      [...inlineByReviewer.values()].some((count) => count >= FINDING_CAPS.inlinePerReviewer);
    if (capHit) {
      notes.push(
        'Inline comments are capped at 10 per reviewer and 25 per run (D-009); the remaining findings are listed above.',
      );
    }
    if (failedNames.length > 0) {
      notes.push(`Failed reviewer(s): ${failedNames.join(', ')}.`);
    }
    if (notes.length > 0) {
      sections.push('', '---', '_Notes:_', ...notes.map((note) => `- ${note}`));
    }

    const nameOf = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.name]));
    const comments = consolidated.inline.map((selection) => ({
      path: selection.finding.file,
      line: selection.finding.line,
      body: `**${nameOf.get(selection.reviewerId) ?? 'Reviewer'}** — ${selection.finding.severity}: ${selection.finding.title}\n\n${selection.finding.body}`,
    }));
    const plan: ReviewPlan = { body: sections.join('\n'), comments };
    await this.ctx.storage.put('plan', plan);
    return 'post';
  }

  private async stepPost(payload: RunPayload): Promise<Step | 'finished'> {
    const token = await this.require<string>('token');
    const plan = await this.require<ReviewPlan>('plan');
    const review = await createPullReview(token, payload.repoFullName, payload.prNumber, {
      commitId: payload.headSha,
      body: plan.body,
      comments: plan.comments,
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

    const statements = [
      this.env.DB.prepare(
        'UPDATE runs SET status = ?, error = ?, review_url = ?, finished_at = unixepoch() WHERE id = ?',
      ).bind(status, error, reviewUrl, runIdFor(payload)),
    ];
    if (reviewers.length > 0) {
      for (const reviewer of reviewers) {
        const outcome = outcomes.get(`outcome:${reviewer.id}`);
        statements.push(
          this.env.DB.prepare(
            'INSERT OR REPLACE INTO run_reviewers (run_id, reviewer_id, status, findings_json, error) VALUES (?, ?, ?, ?, ?)',
          ).bind(
            runIdFor(payload),
            reviewer.id,
            outcome?.status ?? 'failed',
            outcome?.findings ? JSON.stringify(outcome.findings) : null,
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
