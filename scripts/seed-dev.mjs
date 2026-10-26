#!/usr/bin/env node
// Local-only development seed for the jury-forge dashboard.
//
// Every wrangler command below runs against the local Miniflare D1 state (`--local`) and reads
// the local `product/wrangler.jsonc` binding. There is deliberately no `--remote` path, no
// Cloudflare credential is touched, and nothing leaves the machine. Do not point this at a
// deployed instance.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const productDir = join(repoRoot, 'product');
const DATABASE_NAME = 'jury-forge';

// The dashboard looks a session up by `sha256Hex(sessionId)` (worker/lib/sessions.ts), so the
// seed stores the hash of a fixed, well-known dev session id and the summary prints the raw id.
const DEV_SESSION_ID = 'dev-seed-session-token';
const DEV_SESSION_HASH = createHash('sha256').update(DEV_SESSION_ID).digest('hex');

const REPO_NAMES = {
  101: 'prakashsewani/jury-forge',
  102: 'prakashsewani/class-spy',
};

// Newest first; `ageSeconds` is subtracted from "now" so the runs always read as recent, and
// `durationSeconds` gives finished runs a plausible `finished_at` (`running` stays NULL).
const SEED_RUNS = [
  {
    repoId: 101,
    prNumber: 12,
    headSha: '9f2c1a7e4b8d0f3a6c5e2b1d4a7f0c3e8b6d9a2f',
    event: 'pull_request',
    status: 'completed',
    ageSeconds: 8 * 60,
    durationSeconds: 96,
  },
  {
    repoId: 102,
    prNumber: 11,
    headSha: '3b7e9c1f5a2d8e0b4c6f1a3d9e7b2c5f8a0d4e6b',
    event: 'pull_request_review',
    status: 'running',
    ageSeconds: 42 * 60,
    durationSeconds: 0,
  },
  {
    repoId: 101,
    prNumber: 10,
    headSha: 'c4a8e2b6d0f4a1c7e3b9d5f2a8c0e6b4d1f7a3c9',
    event: 'pull_request',
    status: 'completed',
    ageSeconds: 3 * 60 * 60,
    durationSeconds: 132,
  },
  {
    repoId: 101,
    prNumber: 9,
    headSha: '5d1f3a7c9e2b4d6f8a0c1e3b5d7f9a2c4e6b8d0f',
    event: 'pull_request',
    status: 'failed',
    ageSeconds: 6 * 60 * 60,
    durationSeconds: 41,
    error: 'provider_request_failed',
  },
  {
    repoId: 102,
    prNumber: 8,
    headSha: 'e6b0d4f8a2c6e1b5d9f3a7c0e4b8d2f6a1c5e9b3',
    event: 'pull_request_review',
    status: 'completed',
    ageSeconds: 12 * 60 * 60,
    durationSeconds: 158,
  },
  {
    repoId: 101,
    prNumber: 7,
    headSha: '1a5c9e3b7d0f2a4c6e8b1d3f5a7c9e0b2d4f6a8c',
    event: 'pull_request',
    status: 'running',
    ageSeconds: 20 * 60 * 60,
    durationSeconds: 0,
  },
  {
    repoId: 101,
    prNumber: 6,
    headSha: 'b2d6f0a4c8e1b5d9f3a7c0e4b8d2f6a1c5e9b3d7',
    event: 'pull_request',
    status: 'completed',
    ageSeconds: 28 * 60 * 60,
    durationSeconds: 87,
  },
  {
    repoId: 102,
    prNumber: 5,
    headSha: '7c1e5a9d3f6b2e8c0a4d7f1b5e9c3a6d0f4b8e2c',
    event: 'pull_request',
    status: 'skipped',
    ageSeconds: 36 * 60 * 60,
    durationSeconds: 3,
  },
  {
    repoId: 101,
    prNumber: 4,
    headSha: '2e8a4c0f6b1d5e9a3c7f2b6d0a4e8c1f5b9d3a7f',
    event: 'pull_request_review',
    status: 'failed',
    ageSeconds: 2 * 24 * 60 * 60,
    durationSeconds: 52,
    error: 'provider_request_failed',
  },
  {
    repoId: 101,
    prNumber: 3,
    headSha: '8f3b7d1a5c9e2b6d0f4a8c1e5b9d3f7a0c4e8b2d',
    event: 'pull_request',
    status: 'running',
    ageSeconds: 3 * 24 * 60 * 60,
    durationSeconds: 0,
  },
  {
    repoId: 102,
    prNumber: 2,
    headSha: 'd0b4f8a2c6e9b3d7f1a5c0e4b8d2f6a0c4e9b3d7',
    event: 'pull_request_review',
    status: 'completed',
    ageSeconds: 4 * 24 * 60 * 60,
    durationSeconds: 111,
  },
  {
    repoId: 101,
    prNumber: 1,
    headSha: '4a9c2e6b0d4f8a1c5e9b3d7f0a4c8e2b6d1f5a9c',
    event: 'pull_request',
    status: 'completed',
    ageSeconds: 6 * 24 * 60 * 60,
    durationSeconds: 74,
  },
];

const SEED_ACTIVITY = [
  {
    ageSeconds: 8 * 60,
    action: 'run.kick',
    target: 'prakashsewani/jury-forge#12',
    detail: 'pull_request synchronize 9f2c1a7',
  },
  {
    ageSeconds: 42 * 60,
    action: 'run.kick',
    target: 'prakashsewani/class-spy#11',
    detail: 'pull_request_review submitted',
  },
  {
    ageSeconds: 3 * 60 * 60,
    action: 'repository.enable',
    target: 'prakashsewani/class-spy',
    detail: 'reviewers: rev-security',
  },
  {
    ageSeconds: 8 * 60 * 60,
    action: 'reviewer.create',
    target: 'Performance',
    detail: 'flavor openai, model gpt-5.6-flash, no API key',
  },
  {
    ageSeconds: 26 * 60 * 60,
    action: 'reviewer.update',
    target: 'Security',
    detail: 'model gpt-5.6 -> gpt-5.6-sol, key re-wrapped',
  },
  {
    ageSeconds: 30 * 60 * 60,
    action: 'setting_change',
    target: 'inlineCommentsPerRun',
    detail: '10 -> 25',
  },
  { ageSeconds: 2 * 24 * 60 * 60, action: 'sign_in', target: 'prakashsewani', detail: null },
  {
    ageSeconds: 3 * 24 * 60 * 60,
    action: 'run.kick',
    target: 'prakashsewani/jury-forge#3',
    detail: 'pull_request opened',
  },
];

function runId(run) {
  return `${run.repoId}:${run.prNumber}:${run.headSha}:dev-seed-delivery-${run.prNumber}`;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlValue(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return sqlString(value);
}

function usageFor(run) {
  const promptTokens = 1200 + run.prNumber * 40;
  const completionTokens = 180 + run.prNumber * 7;
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
}

function securityFindings(run) {
  const offset = run.prNumber % 6;
  return [
    {
      file: 'product/worker/lib/sessions.ts',
      line: 32 + offset,
      severity: 'error',
      title: 'Session id reaches the query without hashing at the call site',
      body: 'The cookie value is bound directly, so a leaked session id is compared in the clear. Hash it in one place before every lookup so a timing side channel cannot probe stored hashes.',
    },
    {
      file: 'product/worker/routes/webhooks.ts',
      line: 58 + offset,
      severity: 'warning',
      title: 'Signature is verified after the body is buffered',
      body: 'The raw body is read in full before the HMAC check, which lets an unauthenticated caller make the Worker buffer an arbitrary payload. Check the signature first.',
    },
    {
      file: 'product/src/lib/api.ts',
      line: 24 + offset,
      severity: 'info',
      title: 'Error responses drop the server message',
      body: 'A non-JSON error body is swallowed, so provider failures are hard to diagnose from the dashboard. Surface the status and the response text in the thrown error.',
    },
  ];
}

function architectureFindings(run) {
  const offset = run.prNumber % 5;
  return [
    {
      file: 'product/worker/run-engine.ts',
      line: 210 + offset,
      severity: 'warning',
      title: 'Run engine queries D1 outside its repository helpers',
      body: 'The step reaches into the database directly instead of going through a lib helper. Move the query behind the module boundary so the persistence shape stays in one place.',
    },
    {
      file: 'product/src/App.tsx',
      line: 40 + offset,
      severity: 'info',
      title: 'Route parsing lives in the shell component',
      body: 'The path switch carries both routing and layout. Extracting the route table would let the shell render any screen without knowing the URL grammar.',
    },
  ];
}

function buildRunRows(now) {
  return SEED_RUNS.map((run) => {
    const createdAt = now - run.ageSeconds;
    const finishedAt = run.status === 'running' ? null : createdAt + run.durationSeconds;
    const reviewUrl =
      run.status === 'completed'
        ? `https://github.com/${REPO_NAMES[run.repoId]}/pull/${run.prNumber}#pullrequestreview-${9000 + run.prNumber}`
        : null;
    return `  (${[
      sqlString(runId(run)),
      sqlString(`dev-seed-delivery-${run.prNumber}`),
      run.repoId,
      run.prNumber,
      sqlString(run.headSha),
      sqlString(run.event),
      sqlString(run.status),
      sqlValue(run.error),
      sqlValue(reviewUrl),
      createdAt,
      sqlValue(finishedAt),
    ].join(', ')})`;
  }).join(',\n');
}

function completedOutcome(reviewerId, findings, summary, run) {
  return {
    runId: runId(run),
    reviewerId,
    status: 'completed',
    findings,
    summary,
    usage: usageFor(run),
    error: null,
  };
}

function buildRunReviewerRows() {
  const rows = [];
  for (const run of SEED_RUNS) {
    if (run.status === 'completed') {
      rows.push(
        completedOutcome(
          'rev-security',
          securityFindings(run),
          'Session handling needs one fix before this is safe to deploy. No exploitable path found beyond the unsalted lookup.',
          run,
        ),
      );
      rows.push(
        completedOutcome(
          'rev-architecture',
          architectureFindings(run),
          'The change sits on the right side of the worker and dashboard boundary, with one coupling note.',
          run,
        ),
      );
    } else if (run.status === 'failed') {
      rows.push({
        runId: runId(run),
        reviewerId: 'rev-security',
        status: 'failed',
        findings: null,
        summary: null,
        usage: null,
        error: 'provider_request_failed: upstream returned HTTP 502 after 3 attempts',
      });
      rows.push(
        completedOutcome(
          'rev-architecture',
          architectureFindings(run),
          'Boundaries look reasonable, one follow-up on the database helper.',
          run,
        ),
      );
    } else if (run.status === 'running') {
      for (const reviewerId of ['rev-security', 'rev-architecture']) {
        rows.push({
          runId: runId(run),
          reviewerId,
          status: 'pending',
          findings: null,
          summary: null,
          usage: null,
          error: null,
        });
      }
    }
  }
  return rows;
}

function buildRunReviewerSql() {
  const lines = buildRunReviewerRows().map(
    (row) =>
      `  (${[
        sqlString(row.runId),
        sqlString(row.reviewerId),
        sqlString(row.status),
        row.findings ? sqlString(JSON.stringify(row.findings)) : 'NULL',
        sqlValue(row.summary),
        row.usage ? sqlString(JSON.stringify(row.usage)) : 'NULL',
        sqlValue(row.error),
      ].join(', ')})`,
  );
  return lines.join(',\n');
}

function buildPackSql(now) {
  const manifest = {
    name: 'Docs style',
    description: 'House documentation conventions, link checks and tone for the docs/ folder.',
    kind: 'skill',
    apply: 'paths',
    paths: ['docs/**'],
    neverQuote: ['docs/internal/**'],
    owner: 'Docs team',
  };
  const body =
    'Use sentence case for headings. Link every page from the index and keep one H1 per page.';
  const rawManifest = `---\nname: ${manifest.name}\ndescription: ${manifest.description}\nkind: ${manifest.kind}\napply: paths\npaths:\n  - docs/**\nnever_quote:\n  - docs/internal/**\nowner: ${manifest.owner}\n---\n${body}`;
  const v1Docs = [
    {
      path: 'docs/style.md',
      text: 'Headings are sentence case. Every page links back to the index.',
    },
    { path: 'docs/links.md', text: 'Check every relative link before publishing.' },
    { path: 'docs/internal/notes.md', text: 'Internal review notes that stay in the instance.' },
  ];
  const v2Docs = [
    {
      path: 'docs/style.md',
      text: 'Headings are sentence case. Every page links back to the index. Keep one H1 per page.',
    },
    { path: 'docs/links.md', text: 'Check every relative link and anchor before publishing.' },
    { path: 'docs/internal/notes.md', text: 'Internal review notes that stay in the instance.' },
  ];
  const bytes = (text) => Buffer.byteLength(text, 'utf8');
  const versionRows = [
    {
      id: 'version-docs-style-1',
      hash: 'a'.repeat(64),
      createdAt: now - 2 * 24 * 60 * 60,
      docs: v1Docs,
    },
    {
      id: 'version-docs-style-2',
      hash: 'b'.repeat(64),
      createdAt: now - 60 * 60,
      docs: v2Docs,
    },
  ];
  const latest = versionRows[1];
  const docBytes = latest.docs.reduce((sum, doc) => sum + bytes(doc.text), 0);
  const manifestBytes = bytes(rawManifest);
  const totalBytes = manifestBytes + docBytes;
  const applied = {
    slug: 'docs-style',
    hash: latest.hash,
    name: manifest.name,
    scope: 'global',
    precedence: 100,
    bytes: totalBytes,
    manifestBytes,
    docBytes,
    includedFiles: latest.docs
      .filter((doc) => !doc.path.startsWith('docs/internal/'))
      .map((doc) => doc.path),
    droppedFiles: [],
    withheldFiles: latest.docs
      .filter((doc) => doc.path.startsWith('docs/internal/'))
      .map((doc) => doc.path),
  };
  const runKnowledge = {
    packs: [{ slug: applied.slug, hash: applied.hash, bytes: totalBytes, reviewers: 1 }],
    totalBytes,
  };
  const reviewerKnowledge = {
    applied: [applied],
    notApplied: [],
    totalBytes,
    budgetBytes: 64_000,
    overBudget: false,
  };
  const lines = [
    "INSERT INTO packs (id, slug, name) VALUES ('pack-docs-style', 'docs-style', 'Docs style');",
  ];
  for (const version of versionRows) {
    const versionDocBytes = version.docs.reduce((sum, doc) => sum + bytes(doc.text), 0);
    lines.push(
      `INSERT INTO pack_versions (id, pack_id, hash, manifest_path, manifest_json, body, raw_manifest, manifest_bytes, docs_bytes, total_bytes, file_count, created_at, created_by) VALUES (${[
        sqlString(version.id),
        sqlString('pack-docs-style'),
        sqlString(version.hash),
        "'SKILL.md'",
        sqlString(JSON.stringify(manifest)),
        sqlString(body),
        sqlString(rawManifest),
        manifestBytes,
        versionDocBytes,
        manifestBytes + versionDocBytes,
        version.docs.length,
        version.createdAt,
        "'prakashsewani'",
      ].join(', ')});`,
    );
    lines.push(
      `INSERT INTO pack_files (version_id, path, bytes, text, never_quote) VALUES ${version.docs
        .map(
          (doc) =>
            `(${[sqlString(version.id), sqlString(doc.path), bytes(doc.text), sqlString(doc.text), doc.path.startsWith('docs/internal/') ? 1 : 0].join(', ')})`,
        )
        .join(', ')};`,
    );
  }
  lines.push(
    `INSERT INTO pack_grants (id, pack_id, scope, target_id, precedence, enabled) VALUES
  ('grant-docs-global', 'pack-docs-style', 'global', '', 100, 1),
  ('grant-docs-repo', 'pack-docs-style', 'repository', '101', 200, 1),
  ('grant-docs-security', 'pack-docs-style', 'reviewer', 'rev-security', 300, 1);`,
  );
  const firstRunId = runId(SEED_RUNS[0]);
  lines.push(
    `UPDATE runs SET knowledge_json = ${sqlString(JSON.stringify(runKnowledge))} WHERE id = ${sqlString(firstRunId)};`,
  );
  lines.push(
    `UPDATE run_reviewers SET knowledge_json = ${sqlString(JSON.stringify(reviewerKnowledge))} WHERE run_id = ${sqlString(firstRunId)} AND reviewer_id = 'rev-security';`,
  );
  return lines.join('\n');
}

function buildActivitySql(now) {
  return SEED_ACTIVITY.map(
    (entry) =>
      `  (${[
        now - entry.ageSeconds,
        sqlString('prakashsewani'),
        sqlString(entry.action),
        sqlValue(entry.target),
        sqlValue(entry.detail),
      ].join(', ')})`,
  ).join(',\n');
}

function buildSeedSql() {
  const now = Math.floor(Date.now() / 1000);
  return `-- Generated by scripts/seed-dev.mjs. Local-only: delete first so re-runs are idempotent.
DELETE FROM pack_grants;
DELETE FROM pack_files;
DELETE FROM pack_versions;
DELETE FROM packs;
DELETE FROM run_reviewers;
DELETE FROM runs;
DELETE FROM reviewer_repositories;
DELETE FROM reviewers;
DELETE FROM repositories;
DELETE FROM activity_log;
DELETE FROM sessions;
DELETE FROM instance_meta;
DELETE FROM github_app;

INSERT INTO instance_meta (key, value) VALUES
  ('claimed_at', '1750000000'),
  ('owner_login', 'prakashsewani'),
  ('owner_id', '438447686673235968'),
  ('owner_type', 'user'),
  ('installation_id', '12345678'),
  ('installation_account_login', 'prakashsewani'),
  ('installation_account_type', 'user');

INSERT INTO github_app (app_id, slug, client_id, private_key_enc, webhook_secret_enc, client_secret_enc)
VALUES (123456, 'jury-forge-local', 'Iv1.localdev', 'v2.1.seed.seed-seed-seed', 'v2.1.seed.seed-seed-seed', 'v2.1.seed.seed-seed-seed');

INSERT INTO reviewers (id, name, instructions, rules, flavor, base_url, api_key_enc, model, params_json, enabled) VALUES
  ('rev-security', 'Security', 'Look for injection, auth bypass, secret handling and unsafe deserialization.', 'Rate an issue as error when it is exploitable without privileged access.', 'openai', 'https://api.openai.com/v1', 'v2.1.seed.seed-seed-seed', 'gpt-5.6-sol', '{"temperature":0.2}', 1),
  ('rev-architecture', 'Architecture', 'Judge module boundaries, coupling and whether the change belongs where it landed.', 'Prefer a finding about a wrong boundary over a style nit.', 'anthropic', 'https://api.anthropic.com', 'v2.1.seed.seed-seed-seed', 'claude-sonnet-4-5', '{}', 1),
  ('rev-performance', 'Performance', 'Look for N+1 queries, unbounded loops, unnecessary renders and missing indexes.', 'Only report a performance issue you can point at a line for.', 'openai', 'https://api.openai.com/v1', '', 'gpt-5.6-flash', '{"temperature":0}', 0);

INSERT INTO repositories (repo_id, full_name, private, enabled) VALUES
  (101, 'prakashsewani/jury-forge', 1, 1),
  (102, 'prakashsewani/class-spy', 0, 1);

INSERT INTO reviewer_repositories (reviewer_id, repo_id, enabled) VALUES
  ('rev-security', 101, 1),
  ('rev-security', 102, 1),
  ('rev-architecture', 101, 1),
  ('rev-performance', 101, 0);

-- 6 completed, 2 failed, 3 running, 1 skipped; created_at descends with the age offsets above.
INSERT INTO runs (id, delivery_id, repo_id, pr_number, head_sha, event, status, error, review_url, created_at, finished_at) VALUES
${buildRunRows(now)};

INSERT INTO run_reviewers (run_id, reviewer_id, status, findings_json, summary, usage_json, error) VALUES
${buildRunReviewerSql()};

${buildPackSql(now)}

INSERT INTO activity_log (at, actor, action, target, detail) VALUES
${buildActivitySql(now)};

INSERT INTO sessions (token_hash, login, avatar_url, created_at, expires_at)
VALUES (${sqlString(DEV_SESSION_HASH)}, 'prakashsewani', NULL, unixepoch(), unixepoch() + 60 * 60 * 24 * 7);
`;
}

function wrangler(args) {
  // On Windows `npx` is `npx.cmd`, which cannot be spawned without a shell. Run npm's npx entry
  // point through the same Node binary instead: no shell, so no argument escaping to get wrong.
  const npxArgs = ['wrangler', ...args];
  if (process.platform === 'win32') {
    const npxCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
    return spawnSync(process.execPath, [npxCli, ...npxArgs], {
      cwd: productDir,
      shell: false,
      stdio: 'inherit',
    });
  }
  return spawnSync('npx', npxArgs, { cwd: productDir, shell: false, stdio: 'inherit' });
}

function statusLine(label, result) {
  const status =
    result.status === null ? `signal ${result.signal ?? 'unknown'}` : String(result.status);
  console.log(`  ${label}: exit ${status}`);
}

function main() {
  console.log('Seeding the local jury-forge D1 database (local-only, never remote).');
  console.log(`  repository: ${repoRoot}`);

  console.log('Step 1/2: applying local D1 migrations…');
  const migrate = wrangler(['d1', 'migrations', 'apply', DATABASE_NAME, '--local']);
  statusLine('migrations apply', migrate);
  if (migrate.error) {
    console.error(`Failed to start wrangler: ${migrate.error.message}`);
    return 1;
  }
  if (migrate.status !== 0) {
    console.error('Local D1 migrations failed; the seed was not applied.');
    return 1;
  }

  const directory = mkdtempSync(join(tmpdir(), 'jury-forge-seed-'));
  try {
    const sqlFile = join(directory, 'seed.sql');
    writeFileSync(sqlFile, buildSeedSql(), 'utf8');

    console.log('Step 2/2: inserting seed rows…');
    const seed = wrangler(['d1', 'execute', DATABASE_NAME, '--local', '--file', sqlFile]);
    statusLine('d1 execute', seed);
    if (seed.error) {
      console.error(`Failed to start wrangler: ${seed.error.message}`);
      return 1;
    }
    if (seed.status !== 0) {
      console.error('Seeding the local D1 database failed.');
      return 1;
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  console.log('Seed complete. Local D1 now holds:');
  console.log(`  runs:            ${SEED_RUNS.length}`);
  console.log(`  run_reviewers:   ${buildRunReviewerRows().length}`);
  console.log('  reviewers:       3');
  console.log('  repositories:    2');
  console.log('  packs:           1');
  console.log('  pack_versions:   2');
  console.log('  pack_files:      6');
  console.log('  pack_grants:     3');
  console.log(`  activity:        ${SEED_ACTIVITY.length}`);
  console.log(`  session cookie:  jf_session=${DEV_SESSION_ID}`);
  return 0;
}

process.exitCode = main();
