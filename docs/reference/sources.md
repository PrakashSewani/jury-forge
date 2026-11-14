# Sources and evidence

This knowledge base is built from direct inspection of the PoC repository, not from memory or a
summary. This page records what was read and how to reproduce the study.

## Primary source

| Item | Value |
| ---- | ----- |
| Repository | [`PrakashSewani/jury-forge-poc`](https://github.com/PrakashSewani/jury-forge-poc) |
| Commit studied | `1cc22b728d853f11349d795ba2a2494d58ec1229` |
| Commit message | `Merge pull request #27 from PrakashSewani/feat/knowledge-packs-20261026` |
| Date | 2026-10-26 22:26:19 +0530 |
| Local clone during study | `D:\Projects\jury-forge-poc-ref` (outside this repository) |
| Study date | 2026-11-14 |

## Documents read

- `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `CHANGELOG.md`
- `docs/product.md`, `docs/architecture.md`, `docs/design.md`, `docs/decisions.md`,
  `docs/development.md`, `docs/roadmap.md`, `docs/status.md`
- `docs/rework/README.md`, `baseline.md`, `shell.md`, `final.md`, `knowledge.md`
- `.commandcode/skills/project-bootstrap/SKILL.md`, `ship-release/SKILL.md`
- `.github/workflows/ci.yml`, `deploy.yml`
- `product/`, `shared/`, `site/` package manifests and configuration

## Code read (deep pass)

The first pass read the entry points, core libs, migrations, routes, tests, and docs. A second pass
read the remaining implementation in full: the run engine step by step, pack analyzer and pack
CRUD, reviewer scope and import/export, repository sync, settings/readiness, the React data layer
and shell, the ZIP reader and pack upload, the workerd/UI test setup, and the deploy/seed/release
scripts.

- `product/worker/index.ts`, `middleware.ts`, `run-engine.ts`
- `product/worker/lib/{access,activity,consolidate,context,crypto,github,github-app,instance,
  pack-format,packs,private-key,providers,readiness,repositories,resolution,respond,reviewers,
  scope,sessions,settings}.ts`
- `product/worker/routes/{auth,setup,webhooks,runs,reviewers,repositories,settings,packs}.ts`
- `product/migrations/0001`–`0009`
- `shared/src/{contracts,errors,index,templates}.ts`, `shared/src/schemas/*`
- `product/src/App.tsx`, `product/src/lib/{api,router,use-resource,use-poll,zip,pack-upload,
  wizard,theme}.ts`, `product/src/pages/*`, `product/src/shell/*`, `product/src/ui/*`
- `product/test/*`, `product/test-ui/*`, `product/vitest*.config.ts`, `vite.config.ts`,
  `tsconfig.*.json`
- `scripts/{deploy-guided,seed-dev,release,measure-layout}.mjs`
- `product/wrangler.jsonc`, `.dev.vars.example`
- `site/src/pages/index.astro`, `site/wrangler.jsonc`, `site/astro.config.mjs`

The code-level result is [`../poc/code-review.md`](../poc/code-review.md); the additional findings
are F-066–F-077 in [`../analysis/flaws.md`](../analysis/flaws.md).

## Live evidence (2026-11-14/15)

The live instance at `https://jury.prakashsewani.com` was inspected **read-only** through the
operator's authenticated Wrangler token. The queries were `SELECT`-only; no instance configuration
was changed. The review evidence was cross-checked against the GitHub PR and the checked-out code
at `152fef6`.

Commands (representative):

```bash
cd jury-forge-poc-ref/product
npx wrangler d1 execute jury-forge --remote --json --command \
  "SELECT key, value FROM instance_meta ORDER BY key;"
npx wrangler d1 execute jury-forge --remote --json --command \
  "SELECT id, repo_id, pr_number, head_sha, event, mode, status, review_url, created_at, finished_at FROM runs ORDER BY created_at DESC LIMIT 50;"
npx wrangler d1 execute jury-forge --remote --json --command \
  "SELECT rr.run_id, r.mode, rr.reviewer_id, rr.status, rr.findings_json, rr.summary, rr.usage_json FROM run_reviewers rr JOIN runs r ON r.id = rr.run_id;"
gh api repos/PrakashSewani/jury-forge-guinea-pig/pulls/3/reviews
gh api repos/PrakashSewani/jury-forge-guinea-pig/pulls/3/comments
```

The full result is [`../poc/live-instance.md`](../poc/live-instance.md). No provider keys, session
tokens, session hashes, or encrypted secrets were read or recorded. The only key-like value in the
findings is the guinea pig's planted fake key.

## Harness and provider research (2026-11-15)

For the agentic pivot, the harness and provider options were checked live rather than from memory:

```bash
npm view @langchain/langgraph version license
npm view @langchain/langgraph-checkpoint-postgres version license
npm view @openai/agents version license
npm view ai version license
npm view @temporalio/workflow version license
npm view @mastra/core version license
npm view @restatedev/restate-sdk version license
npm view inngest version license
gh api repos/mastra-ai/mastra/license
gh api repos/restatedev/restate/license
gh api repos/inngest/inngest/license
```

Results that matter:

- LangGraph.js 1.7.4 — MIT; Postgres checkpointer 1.1.3 — MIT.
- OpenAI Agents SDK 0.22.0 — MIT.
- Vercel AI SDK 7.0.173 — Apache-2.0 (repository license file).
- Temporal TypeScript SDK 1.25.0 — MIT (server operations are heavier).
- Mastra core 1.83.0 — Apache-2.0 with `ee/` portions under a commercial licence; open-core risk.
- Restate — BSL 1.1; Inngest — SSPL. Neither is acceptable for an MIT core.
- CommandCode's provider package exposes `/v1/models` and `/provider/v1/models`; its cached model
  list includes OpenAI/Anthropic/Google/Qwen/MiniMax/DeepSeek families. The API key was not used
  for this research.

### Provider catalog and GitHub trigger spikes (2026-11-15)

- **CommandCode** (`https://commandcode.ai/docs/provider`): the live model list is
  `GET https://api.commandcode.ai/provider/v1/models`; each model carries `supported_endpoints`
  (chat completions, responses, and/or messages). Claude models answer on `/v1/messages` only.
  Pricing is on a separate Pricing & Limits page, not necessarily in the model response.
- **OpenRouter** (`https://openrouter.ai/api/v1/models`, public): returns `pricing`
  (prompt/completion/image/audio/cache read/cache write), `context_length`, and
  `supported_parameters` for ~471 models. Best-case catalog/pricing provider.
- **GitHub reviewer picker:** `POST /repos/.../pulls/3/requested_reviewers` with
  `reviewers:["jury-forge[bot]"]` returned the PR but did not add the app; `requested_reviewers`
  stayed empty. Arbitrary GitHub Apps cannot be requested as reviewers (Copilot is special).
- **GitHub Check Run actions:** the Checks API supports an `actions` array (max 3; label ≤ 20 chars,
  description ≤ 40 chars); buttons are shown after the check completes and clicking sends
  `check_run.requested_action`. This is the primary manual trigger.
- **GitHub App permission:** the `check_run` webhook's `requested_action` requires at least write
  access to Checks; the app needs `checks: write` in addition to `pull_requests: write`,
  `issues: write`, `contents: read`, and `metadata: read`.

See ADR-0010, ADR-0011, and ADR-0013 for the resulting recommendations.

## Commands used

```bash
git clone https://github.com/PrakashSewani/jury-forge-poc.git jury-forge-poc-ref
cd jury-forge-poc-ref
git log --oneline --all --decorate
find . -not -path './.git/*' -not -path './node_modules/*' -type f | sort
wc -l docs/*.md product/worker/run-engine.ts product/worker/lib/*.ts
grep -rn "from 'octokit'" product shared scripts   # no matches
ls .github/workflows                                # ci.yml, deploy.yml only
```

The PoC's own test counts (386 worker / 197 UI) and its accessibility harness results are taken
from `docs/status.md` and the rework sheets, not re-run during this study. Re-run `npm run check`
and the harness on the PoC if a claim is load-bearing for a decision.

## Evidence rules for this repository

1. A claim about the PoC cites a file and, where useful, a line or function.
2. A claim about the target product is labelled **proposed**, **TBD**, or **accepted**.
3. A benchmark or measurement is reproducible; record the command and the environment.
4. A subagent's summary is a lead, not evidence. Check the source.
5. When the PoC's docs and code disagree, the code wins for behaviour; the docs win for intent.
   Record the conflict.
6. When a PoC doc is stale (for example, the retired `main` release flow), say so and cite the
   superseding decision.

## Known limitations of this study

- The PoC was not executed end to end against a real GitHub installation or a real provider during
  the study. Findings about runtime behaviour are from code reading and the PoC's own status.
- Test counts and harness results are from the PoC's status file, not re-run.
- The PoC's live instance at `jury.prakashsewani.com` was not accessed; the status file is the
  source.
- Some UI files were read at the screen/hook level rather than every primitive line by line; the
  flaws listed are architectural, security, correctness, or operability issues, not cosmetic
  line-level nits.
- The run engine and pack analyzer were read in full; no test was executed against the PoC during
  the study, so the code-level defects are from static reading. Reproduce F-066/F-069/F-073 with a
  test before relying on the exact failure mode.
- The live instance's dashboard could not be screenshotted: Cloudflare Access uses a Cloudflare
  OAuth login, and the Playwright-controlled Brave profile failed the verification challenge. The
  database is the stronger evidence, but the UI rendering of the current empty state was not
  visually captured.
- The live D1 was read through the operator's Wrangler OAuth token; the queries are listed above.
  The Access application/policy could not be read through that token (`access/apps` empty,
  `access/organizations` 403).
- The live instance currently has no reviewers or enabled repositories; the only real review is
  from 2026-10-19 and covers one PR. Do not treat it as a benchmark.
- Cloudflare plan limits, pricing, and product behaviour can change; verify them before relying on
  a constraint in a new ADR.
