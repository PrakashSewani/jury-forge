import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../worker';
import type { RunEngine, RunPayload } from '../worker/run-engine';
import { encryptSecret, keyRingValues, loadKeyRing } from '../worker/lib/crypto';
import { createSession } from '../worker/lib/sessions';
import { resetInstanceState } from './db';
import { network } from './network';
import { ORIGIN, pullRequestEvent, postWebhook, seedGitHubApp } from './webhook-helpers';

const RUN_ID = '101:1:abc123def456:delivery-1';
const MANUAL_RUN_IDS = [
  '101:1:abc123def456:try-named',
  '101:1:abc123def456:try-disabled',
  '101:1:abc123def456:auto-disabled',
  '101:1:abc123def456:try-superseded',
  '101:1:abc123def456:try-nokey',
  '101:1:abc123def456:try-unknown',
];

beforeEach(async () => {
  await resetInstanceState();
  // The run id is deterministic, so wipe the run's Durable Object between tests — `start()` is
  // intentionally idempotent and would otherwise swallow a repeated kick for the same run.
  for (const runId of [RUN_ID, ...MANUAL_RUN_IDS]) {
    await runInDurableObject(
      env.RUNS.getByName(runId),
      async (_instance: RunEngine, state: DurableObjectState) => {
        await state.storage.deleteAll();
        await state.storage.deleteAlarm();
      },
    );
  }
});

async function seedRepositoryAndReviewers(flavors: ('openai' | 'anthropic')[]): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO repositories (repo_id, full_name, private, enabled) VALUES (101, 'octocat/hello', 0, 1)",
  ).run();
  const values = keyRingValues(env);
  if (!values) {
    throw new Error('ENCRYPTION_KEY missing');
  }
  const ring = await loadKeyRing(values);
  for (const [index, flavor] of flavors.entries()) {
    await env.DB.prepare(
      'INSERT INTO reviewers (id, name, instructions, rules, flavor, base_url, api_key_enc, model, params_json, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
    )
      .bind(
        `rev-${index}`,
        flavor === 'openai' ? 'Security' : 'Architecture',
        'Hunt for bugs.',
        'Be precise.',
        flavor,
        flavor === 'openai' ? 'https://providers.test/v1' : 'https://providers.test',
        await encryptSecret(ring, 'sk-test'),
        'model-x',
        '{}',
      )
      .run();
  }
}

interface CapturedReview {
  event?: string;
  commitId?: string;
  body?: string;
  comments?: { path: string; line: number }[];
}

interface RunMocks {
  reviewCalls: () => number;
  lastReview: () => CapturedReview | null;
  minimizedNodeIds: () => string[];
}

function mockGitHubRun(
  options: {
    review?: (call: number) => Response | Promise<Response>;
    reviews?: () => Response | Promise<Response>;
  } = {},
): RunMocks {
  let reviewCalls = 0;
  let lastReview: CapturedReview | null = null;
  const minimizedNodeIds: string[] = [];
  network.use(
    http.post('https://api.github.com/app/installations/4242/access_tokens', () =>
      HttpResponse.json({ token: 'ghs_test', expires_at: '2099-01-01T00:00:00Z' }),
    ),
    http.get('https://api.github.com/repos/octocat/hello/pulls/1', () =>
      HttpResponse.json({ title: 'Fix the widget', body: 'Please review.' }),
    ),
    http.get('https://api.github.com/repos/octocat/hello/pulls/1/files', () =>
      HttpResponse.json([
        {
          filename: 'src/app.ts',
          status: 'modified',
          patch: '@@ -1,2 +1,3 @@\n line1\n+line2\n line3',
        },
        { filename: 'package-lock.json', status: 'modified', patch: '@@ -1 +1 @@\n-a\n+b' },
      ]),
    ),
    http.get('https://api.github.com/repos/octocat/hello/pulls/1/reviews', () =>
      options.reviews ? options.reviews() : HttpResponse.json([]),
    ),
    http.post('https://api.github.com/graphql', async ({ request }) => {
      const raw = (await request.json()) as { variables?: { id?: string } };
      if (raw.variables?.id) {
        minimizedNodeIds.push(raw.variables.id);
      }
      return HttpResponse.json({
        data: { minimizeComment: { minimizedComment: { isMinimized: true } } },
      });
    }),
    http.post('https://api.github.com/repos/octocat/hello/pulls/1/reviews', async ({ request }) => {
      reviewCalls += 1;
      const raw = (await request.json()) as {
        event?: string;
        commit_id?: string;
        body?: string;
        comments?: { path: string; line: number }[];
      };
      lastReview = {
        event: raw.event,
        commitId: raw.commit_id,
        body: raw.body,
        comments: raw.comments,
      };
      if (options.review) {
        return options.review(reviewCalls);
      }
      return HttpResponse.json({
        id: 701,
        html_url: 'https://github.com/octocat/hello/pull/1#pullrequestreview-7',
      });
    }),
  );
  return {
    reviewCalls: () => reviewCalls,
    lastReview: () => lastReview,
    minimizedNodeIds: () => minimizedNodeIds,
  };
}

function mockOpenAiReview(content: string): void {
  network.use(
    http.post('https://providers.test/v1/chat/completions', () =>
      HttpResponse.json({ choices: [{ message: { content } }] }),
    ),
  );
}

/**
 * Serves one OpenAI response per call in order, capturing the user prompt of each call so a test
 * can assert what a later run received.
 */
function mockOpenAiReviewSequence(contents: string[]): { prompts: string[] } {
  const prompts: string[] = [];
  network.use(
    http.post('https://providers.test/v1/chat/completions', async ({ request }) => {
      const body = (await request.json()) as { messages?: { role: string; content: string }[] };
      prompts.push(body.messages?.find((message) => message.role === 'user')?.content ?? '');
      const content = contents[prompts.length - 1] ?? '{"findings":[]}';
      return HttpResponse.json({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      });
    }),
  );
  return { prompts };
}

function mockAnthropicFailure(): void {
  network.use(
    http.post('https://providers.test/v1/messages', () => new HttpResponse(null, { status: 500 })),
  );
}

/**
 * Drives a run to completion: polls the durable row, nudges any pending alarm (including backoff
 * retries scheduled in the future) to now, and gives the runtime a moment to process.
 */
async function driveRun(runId: string, timeoutMs = 15_000): Promise<void> {
  const stub = env.RUNS.getByName(runId);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = await env.DB.prepare('SELECT status FROM runs WHERE id = ?')
      .bind(runId)
      .first<{ status: string }>();
    if (row && row.status !== 'running') {
      return;
    }
    await runInDurableObject(stub, async (_instance: RunEngine, state: DurableObjectState) => {
      const alarm = await state.storage.getAlarm();
      if (alarm !== null && alarm > Date.now()) {
        await state.storage.setAlarm(Date.now());
      }
    });
    await runDurableObjectAlarm(stub);
    if (Date.now() > deadline) {
      throw new Error(`run ${runId} did not settle`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('run engine', () => {
  it('runs a review end to end and records it', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai']);
    const mocks = mockGitHubRun();
    mockOpenAiReview(
      JSON.stringify({
        findings: [
          {
            file: 'src/app.ts',
            line: 2,
            severity: 'warning',
            title: 'Off by one',
            body: 'Check the boundary.',
          },
          {
            file: 'src/app.ts',
            line: 99,
            severity: 'info',
            title: 'Notable',
            body: 'Outside the diff.',
          },
        ],
      }),
    );

    const response = await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-1' });
    expect(response.status).toBe(202);

    const started = await env.DB.prepare('SELECT delivery_id FROM runs WHERE id = ?')
      .bind(RUN_ID)
      .first<{ delivery_id: string }>();
    expect(started?.delivery_id).toBe('delivery-1');

    await driveRun(RUN_ID);

    const finished = await env.DB.prepare('SELECT status, error, review_url FROM runs WHERE id = ?')
      .bind(RUN_ID)
      .first<{ status: string; error: string | null; review_url: string | null }>();
    expect(finished?.status).toBe('completed');
    expect(finished?.error).toBeNull();
    expect(finished?.review_url).toBe(
      'https://github.com/octocat/hello/pull/1#pullrequestreview-7',
    );

    const outcome = await env.DB.prepare(
      'SELECT status, findings_json FROM run_reviewers WHERE run_id = ?',
    )
      .bind(RUN_ID)
      .first<{ status: string; findings_json: string | null }>();
    expect(outcome?.status).toBe('completed');
    expect(JSON.parse(outcome?.findings_json ?? '[]')).toHaveLength(2);

    const review = mocks.lastReview();
    expect(mocks.reviewCalls()).toBe(1);
    expect(review?.event).toBe('COMMENT');
    expect(review?.commitId).toBe('abc123def456');
    expect(review?.body).toContain('Security');
    expect(review?.body).toContain('src/app.ts:99');
    expect(review?.comments).toHaveLength(1);
    expect(review?.comments?.[0]?.path).toBe('src/app.ts');
    expect(review?.comments?.[0]?.line).toBe(2);
  });

  it('compares a second run against the first and records summary and usage', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai']);
    const mocks = mockGitHubRun();
    const provider = mockOpenAiReviewSequence([
      JSON.stringify({
        summary: 'First pass.',
        findings: [
          {
            file: 'src/app.ts',
            line: 2,
            severity: 'warning',
            title: 'Off by one',
            body: 'Check the boundary.',
          },
          {
            file: 'src/app.ts',
            line: 3,
            severity: 'info',
            title: 'Odd naming',
            body: 'Rename it.',
          },
        ],
      }),
      JSON.stringify({
        summary: 'Second pass.',
        findings: [
          {
            file: 'src/app.ts',
            line: 2,
            severity: 'warning',
            title: 'Off by one',
            body: 'Still there.',
          },
          {
            file: 'src/app.ts',
            line: 99,
            severity: 'info',
            title: 'New thing',
            body: 'Fresh find.',
          },
        ],
      }),
    ]);

    await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-1' });
    await driveRun(RUN_ID);
    expect(provider.prompts[0]).not.toContain('Previously reported findings');

    const secondRunId = '101:1:abc123def456:delivery-2';
    await postWebhook(pullRequestEvent({ deliveryId: 'delivery-2' }), {
      deliveryId: 'delivery-2',
    });
    await driveRun(secondRunId);

    expect(provider.prompts).toHaveLength(2);
    expect(provider.prompts[1]).toContain('Previously reported findings');
    expect(provider.prompts[1]).toContain('src/app.ts:2');
    expect(provider.prompts[1]).toContain('Odd naming');
    expect(provider.prompts[1]).not.toContain('New thing');

    const body = mocks.lastReview()?.body ?? '';
    expect(body).toContain('Second pass.');
    expect(body).toContain('### Previous findings');
    expect(body).toContain('**Resolved** (1)');
    expect(body).toContain('**Still present** (1)');
    expect(body).toContain('**New** (1)');
    expect(body).toContain('src/app.ts:3');

    const rows = await env.DB.prepare(
      'SELECT summary, usage_json FROM run_reviewers WHERE run_id = ? ORDER BY reviewer_id',
    )
      .bind(secondRunId)
      .all<{ summary: string | null; usage_json: string | null }>();
    expect(rows.results[0]?.summary).toBe('Second pass.');
    expect(JSON.parse(rows.results[0]?.usage_json ?? 'null')).toEqual({
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
    });
  });

  it('skips a repository that is not enabled', async () => {
    await seedGitHubApp();
    const mocks = mockGitHubRun();

    const response = await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-1' });
    expect(response.status).toBe(202);
    await driveRun(RUN_ID);

    const finished = await env.DB.prepare('SELECT status, error FROM runs WHERE id = ?')
      .bind(RUN_ID)
      .first<{ status: string; error: string | null }>();
    expect(finished?.status).toBe('skipped');
    expect(finished?.error).toBeNull();
    expect(mocks.reviewCalls()).toBe(0);

    const reviewers = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM run_reviewers WHERE run_id = ?',
    )
      .bind(RUN_ID)
      .first<{ count: number }>();
    expect(reviewers?.count).toBe(0);
  });

  it('notes a failed reviewer and still posts the review', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai', 'anthropic']);
    const mocks = mockGitHubRun();
    mockOpenAiReview('{"findings":[]}');
    mockAnthropicFailure();

    await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-1' });
    await driveRun(RUN_ID);

    const finished = await env.DB.prepare('SELECT status FROM runs WHERE id = ?')
      .bind(RUN_ID)
      .first<{ status: string }>();
    expect(finished?.status).toBe('completed');
    expect(mocks.reviewCalls()).toBe(1);
    expect(mocks.lastReview()?.body).toContain('Failed reviewer(s): Architecture');

    const rows = await env.DB.prepare(
      'SELECT reviewer_id, status FROM run_reviewers WHERE run_id = ? ORDER BY reviewer_id',
    )
      .bind(RUN_ID)
      .all<{ reviewer_id: string; status: string }>();
    expect(rows.results.map((row) => row.status)).toEqual(['completed', 'failed']);
  });

  it('fails the run when every reviewer fails', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['anthropic']);
    const mocks = mockGitHubRun();
    mockAnthropicFailure();

    await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-1' });
    await driveRun(RUN_ID);

    const finished = await env.DB.prepare('SELECT status, error FROM runs WHERE id = ?')
      .bind(RUN_ID)
      .first<{ status: string; error: string | null }>();
    expect(finished?.status).toBe('failed');
    expect(finished?.error).toBe('all_reviewers_failed');
    expect(mocks.reviewCalls()).toBe(0);

    const row = await env.DB.prepare(
      'SELECT status FROM run_reviewers WHERE run_id = ? AND reviewer_id = ?',
    )
      .bind(RUN_ID, 'rev-0')
      .first<{ status: string }>();
    expect(row?.status).toBe('failed');
  });

  it('retries a failed review post with backoff', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai']);
    const mocks = mockGitHubRun({
      review: (call) =>
        call <= 2
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({
              id: 701,
              html_url: 'https://github.com/octocat/hello/pull/1#pullrequestreview-7',
            }),
    });
    mockOpenAiReview('{"findings":[]}');

    await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-1' });
    await driveRun(RUN_ID);

    expect(mocks.reviewCalls()).toBe(3);
    const finished = await env.DB.prepare('SELECT status FROM runs WHERE id = ?')
      .bind(RUN_ID)
      .first<{ status: string }>();
    expect(finished?.status).toBe('completed');
  });

  it('fails immediately on a non-retryable post error', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai']);
    const mocks = mockGitHubRun({ review: () => new HttpResponse(null, { status: 422 }) });
    mockOpenAiReview('{"findings":[]}');

    await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-1' });
    await driveRun(RUN_ID);

    expect(mocks.reviewCalls()).toBe(1);
    const finished = await env.DB.prepare('SELECT status, error FROM runs WHERE id = ?')
      .bind(RUN_ID)
      .first<{ status: string; error: string | null }>();
    expect(finished?.status).toBe('failed');
    expect(finished?.error).toContain('422');
  });

  it('skips as superseded when a newer run exists for the same PR', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai']);
    const mocks = mockGitHubRun();
    mockOpenAiReview('{"findings":[]}');
    await env.DB.prepare(
      "INSERT INTO runs (id, delivery_id, repo_id, pr_number, head_sha, event, status, created_at) VALUES ('101:1:freshsha999:delivery-9', 'delivery-9', 101, 1, 'freshsha999', 'synchronize', 'running', unixepoch() + 60)",
    ).run();

    const response = await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-1' });
    expect(response.status).toBe(202);
    await driveRun(RUN_ID);

    const finished = await env.DB.prepare('SELECT status, error FROM runs WHERE id = ?')
      .bind(RUN_ID)
      .first<{ status: string; error: string | null }>();
    expect(finished).toEqual({ status: 'skipped', error: null });
    expect(mocks.reviewCalls()).toBe(0);
  });

  it('skips a duplicate when a newer run for the same SHA exists', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai']);
    const mocks = mockGitHubRun();
    mockOpenAiReview('{"findings":[]}');
    await env.DB.prepare(
      "INSERT INTO runs (id, delivery_id, repo_id, pr_number, head_sha, event, status, created_at) VALUES ('101:1:abc123def456:delivery-2', 'delivery-2', 101, 1, 'abc123def456', 'synchronize', 'running', unixepoch() + 60)",
    ).run();

    await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-1' });
    await driveRun(RUN_ID);

    const finished = await env.DB.prepare('SELECT status, error FROM runs WHERE id = ?')
      .bind(RUN_ID)
      .first<{ status: string; error: string | null }>();
    expect(finished).toEqual({ status: 'skipped', error: null });
    expect(mocks.reviewCalls()).toBe(0);
  });

  it('minimizes the previous reviews after posting', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai']);
    const mocks = mockGitHubRun({
      reviews: () =>
        HttpResponse.json([
          { id: 700, node_id: 'PRR_old', user: { login: 'jury-forge-test[bot]' } },
          { id: 12, node_id: 'PRR_human', user: { login: 'octocat' } },
          { id: 701, node_id: 'PRR_new', user: { login: 'jury-forge-test[bot]' } },
        ]),
    });
    mockOpenAiReview('{"findings":[]}');

    await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-1' });
    await driveRun(RUN_ID);

    const finished = await env.DB.prepare('SELECT status FROM runs WHERE id = ?')
      .bind(RUN_ID)
      .first<{ status: string }>();
    expect(finished?.status).toBe('completed');
    expect(mocks.minimizedNodeIds()).toEqual(['PRR_old']);
  });

  it('requests changes when blocking mode is on and the error threshold is met', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai']);
    await env.DB.prepare(
      "INSERT INTO instance_settings (key, value) VALUES ('blockingMode', 'true'), ('blockingErrorThreshold', '1')",
    ).run();
    const mocks = mockGitHubRun();
    mockOpenAiReview(
      JSON.stringify({
        findings: [
          {
            file: 'src/app.ts',
            line: 2,
            severity: 'error',
            title: 'Broken boundary',
            body: 'This must be fixed.',
          },
        ],
      }),
    );

    await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-1' });
    await driveRun(RUN_ID);

    const review = mocks.lastReview();
    expect(review?.event).toBe('REQUEST_CHANGES');
    expect(review?.body).toContain(
      'Blocking mode is on and this run found 1 error finding(s), meeting the threshold of 1',
    );
  });

  it('posts a COMMENT review by default', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai']);
    const mocks = mockGitHubRun();
    mockOpenAiReview(
      JSON.stringify({
        findings: [
          {
            file: 'src/app.ts',
            line: 2,
            severity: 'error',
            title: 'Broken boundary',
            body: 'This must be fixed.',
          },
        ],
      }),
    );

    await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-1' });
    await driveRun(RUN_ID);

    const review = mocks.lastReview();
    expect(review?.event).toBe('COMMENT');
    expect(review?.body).not.toContain('Blocking mode');
  });

  it('does not read repository instructions when the setting is off', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai']);
    mockGitHubRun();
    let contentsRequests = 0;
    network.use(
      http.get('https://api.github.com/repos/octocat/hello/contents/*', () => {
        contentsRequests += 1;
        return new HttpResponse('should not be read', { status: 500 });
      }),
    );
    const provider = mockOpenAiReviewSequence(['{"findings":[]}']);

    await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-1' });
    await driveRun(RUN_ID);

    expect(contentsRequests).toBe(0);
    expect(provider.prompts).toHaveLength(1);
    expect(provider.prompts[0]).not.toContain('Repository instructions');
  });

  it('reads repository instructions at the head SHA and puts them in the prompt', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai']);
    await env.DB.prepare(
      "INSERT INTO instance_settings (key, value) VALUES ('repoInstructions', 'true')",
    ).run();
    const mocks = mockGitHubRun();
    const acceptHeaders: (string | null)[] = [];
    network.use(
      http.get('https://api.github.com/repos/octocat/hello/contents/AGENTS.md', ({ request }) => {
        acceptHeaders.push(request.headers.get('Accept'));
        expect(new URL(request.url).searchParams.get('ref')).toBe('abc123def456');
        return HttpResponse.text('Follow the repository style guide.');
      }),
      http.get('https://api.github.com/repos/octocat/hello/contents/CONTRIBUTING.md', () =>
        HttpResponse.text('Run the test suite.'),
      ),
    );
    const provider = mockOpenAiReviewSequence(['{"findings":[]}']);

    await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-1' });
    await driveRun(RUN_ID);

    expect(acceptHeaders).toEqual(['application/vnd.github.raw']);
    expect(provider.prompts[0]).toContain('### AGENTS.md');
    expect(provider.prompts[0]).toContain('Follow the repository style guide.');
    expect(provider.prompts[0]).toContain('### CONTRIBUTING.md');
    expect(provider.prompts[0]).toContain('Run the test suite.');
    expect(mocks.reviewCalls()).toBe(1);
  });

  it('skips a repository instruction file that returns 404 without failing the run', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai']);
    await env.DB.prepare(
      "INSERT INTO instance_settings (key, value) VALUES ('repoInstructions', 'true')",
    ).run();
    mockGitHubRun();
    network.use(
      http.get(
        'https://api.github.com/repos/octocat/hello/contents/AGENTS.md',
        () => new HttpResponse(null, { status: 404 }),
      ),
      http.get('https://api.github.com/repos/octocat/hello/contents/CONTRIBUTING.md', () =>
        HttpResponse.text('Run the test suite.'),
      ),
    );
    const provider = mockOpenAiReviewSequence(['{"findings":[]}']);

    await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-1' });
    await driveRun(RUN_ID);

    const finished = await env.DB.prepare('SELECT status FROM runs WHERE id = ?')
      .bind(RUN_ID)
      .first<{ status: string }>();
    expect(finished?.status).toBe('completed');
    expect(provider.prompts[0]).toContain('### CONTRIBUTING.md');
    expect(provider.prompts[0]).not.toContain('### AGENTS.md');
  });
});

describe('manual try run', () => {
  function manualPayload(deliveryId: string, overrides: Partial<RunPayload> = {}): RunPayload {
    return {
      deliveryId,
      repoId: 101,
      repoFullName: 'octocat/hello',
      prNumber: 1,
      headSha: 'abc123def456',
      action: 'try',
      installationId: 4242,
      mode: 'manual',
      ...overrides,
    };
  }

  it('runs only the named reviewer and posts nothing to GitHub', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai', 'anthropic']);
    const mocks = mockGitHubRun();
    const provider = mockOpenAiReviewSequence(['{"findings":[]}']);
    const runId = '101:1:abc123def456:try-named';

    await env.RUNS.getByName(runId).start(manualPayload('try-named', { reviewerIds: ['rev-0'] }));
    await driveRun(runId);

    const row = await env.DB.prepare(
      'SELECT status, error, review_url, mode FROM runs WHERE id = ?',
    )
      .bind(runId)
      .first<{ status: string; error: string | null; review_url: string | null; mode: string }>();
    expect(row).toEqual({
      status: 'completed',
      error: null,
      review_url: null,
      mode: 'manual',
    });
    expect(mocks.reviewCalls()).toBe(0);
    expect(provider.prompts).toHaveLength(1);

    const outcomes = await env.DB.prepare(
      'SELECT reviewer_id FROM run_reviewers WHERE run_id = ? ORDER BY reviewer_id',
    )
      .bind(runId)
      .all<{ reviewer_id: string }>();
    expect(outcomes.results.map((outcome) => outcome.reviewer_id)).toEqual(['rev-0']);
  });

  it('ignores the repository-enabled gate for manual runs but not for automatic ones', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai']);
    await env.DB.prepare('UPDATE repositories SET enabled = 0 WHERE repo_id = 101').run();
    const mocks = mockGitHubRun();
    mockOpenAiReview('{"findings":[]}');

    const autoRunId = '101:1:abc123def456:auto-disabled';
    await env.RUNS.getByName(autoRunId).start(manualPayload('auto-disabled', { mode: 'auto' }));
    await driveRun(autoRunId);
    const autoRow = await env.DB.prepare('SELECT status, mode FROM runs WHERE id = ?')
      .bind(autoRunId)
      .first<{ status: string; mode: string }>();
    expect(autoRow).toEqual({ status: 'skipped', mode: 'auto' });

    const manualRunId = '101:1:abc123def456:try-disabled';
    await env.RUNS.getByName(manualRunId).start(
      manualPayload('try-disabled', { reviewerIds: ['rev-0'] }),
    );
    await driveRun(manualRunId);
    const manualRow = await env.DB.prepare(
      'SELECT status, error, review_url FROM runs WHERE id = ?',
    )
      .bind(manualRunId)
      .first<{ status: string; error: string | null; review_url: string | null }>();
    expect(manualRow).toEqual({ status: 'completed', error: null, review_url: null });
    expect(mocks.reviewCalls()).toBe(0);
  });

  it('is not superseded by a newer run for the same pull request', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai']);
    const mocks = mockGitHubRun();
    mockOpenAiReview('{"findings":[]}');
    await env.DB.prepare(
      "INSERT INTO runs (id, delivery_id, repo_id, pr_number, head_sha, event, status, created_at) VALUES ('101:1:freshsha999:auto-newer', 'auto-newer', 101, 1, 'freshsha999', 'synchronize', 'running', unixepoch() + 60)",
    ).run();
    const runId = '101:1:abc123def456:try-superseded';

    await env.RUNS.getByName(runId).start(
      manualPayload('try-superseded', { reviewerIds: ['rev-0'] }),
    );
    await driveRun(runId);

    const row = await env.DB.prepare('SELECT status FROM runs WHERE id = ?')
      .bind(runId)
      .first<{ status: string }>();
    expect(row?.status).toBe('completed');
    expect(mocks.reviewCalls()).toBe(0);
  });

  it('fails with reviewer_unavailable when no named reviewer is usable', async () => {
    await seedGitHubApp();
    await seedRepositoryAndReviewers(['openai']);
    await env.DB.prepare("UPDATE reviewers SET api_key_enc = '' WHERE id = 'rev-0'").run();
    const mocks = mockGitHubRun();
    mockOpenAiReview('{"findings":[]}');

    const noKeyRunId = '101:1:abc123def456:try-nokey';
    await env.RUNS.getByName(noKeyRunId).start(
      manualPayload('try-nokey', { reviewerIds: ['rev-0'] }),
    );
    await driveRun(noKeyRunId);
    const noKey = await env.DB.prepare('SELECT status, error, review_url FROM runs WHERE id = ?')
      .bind(noKeyRunId)
      .first<{ status: string; error: string | null; review_url: string | null }>();
    expect(noKey).toEqual({ status: 'failed', error: 'reviewer_unavailable', review_url: null });

    const unknownRunId = '101:1:abc123def456:try-unknown';
    await env.RUNS.getByName(unknownRunId).start(
      manualPayload('try-unknown', { reviewerIds: ['nope'] }),
    );
    await driveRun(unknownRunId);
    const unknown = await env.DB.prepare('SELECT status, error FROM runs WHERE id = ?')
      .bind(unknownRunId)
      .first<{ status: string; error: string | null }>();
    expect(unknown).toEqual({ status: 'failed', error: 'reviewer_unavailable' });
    const outcomes = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM run_reviewers WHERE run_id = ?',
    )
      .bind(unknownRunId)
      .first<{ count: number }>();
    expect(outcomes?.count).toBe(0);
    expect(mocks.reviewCalls()).toBe(0);
  });
});

describe('runs api', () => {
  async function session(): Promise<string> {
    const id = await createSession(env.DB, { login: 'octocat', avatarUrl: null });
    return `jf_session=${id}`;
  }

  async function insertRun(id: string, createdAt: number): Promise<void> {
    await env.DB.prepare(
      "INSERT INTO runs (id, delivery_id, repo_id, pr_number, head_sha, event, status, created_at, finished_at) VALUES (?, ?, 101, 1, 'sha', 'opened', 'completed', ?, ?)",
    )
      .bind(id, `d-${id}`, createdAt, createdAt + 5)
      .run();
  }

  it('requires a session', async () => {
    const response = await app.request(`${ORIGIN}/api/runs`, {}, env);
    expect(response.status).toBe(401);
  });

  it('pages runs with keyset cursors', async () => {
    await insertRun('run-a', 100);
    await insertRun('run-b', 200);
    await insertRun('run-c', 300);
    const cookie = await session();

    const first = await app.request(
      `${ORIGIN}/api/runs?limit=2`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(first.status).toBe(200);
    const firstPage = (await first.json()) as {
      runs: { id: string }[];
      nextCursor: string | null;
    };
    expect(firstPage.runs.map((run) => run.id)).toEqual(['run-c', 'run-b']);
    expect(firstPage.nextCursor).toBe('200:run-b');

    const second = await app.request(
      `${ORIGIN}/api/runs?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`,
      { headers: { Cookie: cookie } },
      env,
    );
    const secondPage = (await second.json()) as {
      runs: { id: string }[];
      nextCursor: string | null;
    };
    expect(secondPage.runs.map((run) => run.id)).toEqual(['run-a']);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('returns run detail with reviewer outcomes', async () => {
    await insertRun('run-d', 400);
    await env.DB.prepare(
      "INSERT INTO run_reviewers (run_id, reviewer_id, status, findings_json, summary, usage_json, error) VALUES ('run-d', 'rev-0', 'completed', ?, 'Looks good.', ?, NULL)",
    )
      .bind(
        JSON.stringify([{ file: 'a.ts', severity: 'info', title: 't', body: 'b' }]),
        JSON.stringify({ promptTokens: 10, completionTokens: 5, totalTokens: 15 }),
      )
      .run();
    await env.DB.prepare(
      "INSERT INTO run_reviewers (run_id, reviewer_id, status, findings_json, summary, usage_json, error) VALUES ('run-d', 'rev-1', 'failed', NULL, NULL, NULL, 'boom')",
    ).run();
    const cookie = await session();

    const response = await app.request(
      `${ORIGIN}/api/runs/run-d`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(200);
    const detail = (await response.json()) as {
      run: { id: string; status: string };
      reviewers: { reviewerId: string; status: string; error: string | null }[];
    };
    expect(detail.run).toMatchObject({ id: 'run-d', status: 'completed' });
    expect(detail.reviewers).toEqual([
      {
        reviewerId: 'rev-0',
        status: 'completed',
        findings: [{ file: 'a.ts', severity: 'info', title: 't', body: 'b' }],
        summary: 'Looks good.',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        error: null,
      },
      {
        reviewerId: 'rev-1',
        status: 'failed',
        findings: null,
        summary: null,
        usage: null,
        error: 'boom',
      },
    ]);

    const missing = await app.request(
      `${ORIGIN}/api/runs/nope`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(missing.status).toBe(404);
  });
});
