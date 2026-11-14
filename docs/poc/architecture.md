# PoC architecture

Studied at `1cc22b7`. This describes what exists, not what should exist.

## Shape

A TypeScript monorepo on npm workspaces with three packages:

| Package   | Path       | What it is                                                                 |
| --------- | ---------- | -------------------------------------------------------------------------- |
| Product   | `product/` | One Cloudflare Worker + a React dashboard served as static assets           |
| Site      | `site/`    | An Astro static promo site, deployed independently                         |
| Shared    | `shared/`  | Brand constants, zod API schemas, inferred contract types, error taxonomy   |

There is one deployable product, one D1 database, and one private GitHub App per instance.
Nothing runs outside the operator's Cloudflare account except requests to GitHub and the
configured model providers.

## Runtime topology

```
                  GitHub                         Operator browser
                    │                                   │
                    │ webhook (pull_request)            │ HTTPS + session cookie
                    ▼                                   ▼
        ┌───────────────────────────────────────────────────────────┐
        │  Cloudflare Worker  `jury-forge`                          │
        │  Hono app                                                 │
        │  ├── /api/webhooks/github  (HMAC verify, dedupe, kick)     │
        │  ├── /api/setup/*          (manifest flow, install verify) │
        │  ├── /api/auth/*           (GitHub OAuth, sessions)        │
        │  ├── /api/reviewers/*      (CRUD, import/export)           │
        │  ├── /api/repositories/*   (sync, enable, scope, preview)  │
        │  ├── /api/runs/*           (history, detail, try)          │
        │  ├── /api/packs/*          (knowledge packs)               │
        │  ├── /api/settings, /api/activity, /api/health             │
        │  └── static assets          (React SPA, SPA fallback)      │
        └───────────────┬───────────────────────────┬───────────────┘
                        │                           │
                        ▼                           ▼
                 ┌─────────────┐          ┌──────────────────────┐
                 │ D1 database │          │ Durable Object       │
                 │ (binding DB)│          │ RunEngine (RUNS)     │
                 │             │          │ one per run          │
                 └─────────────┘          └──────────┬───────────┘
                                                     │
                                      ┌──────────────┼──────────────┐
                                      ▼              ▼              ▼
                                   GitHub API   Provider A     Provider B
                                  (Octokit)    (OpenAI-ish)   (Anthropic-ish)
```

- **Worker entry:** `product/worker/index.ts`. Hono routes mounted under `/api/*`; static assets
  are served by the Workers assets binding with `not_found_handling: single-page-application`
  and `run_worker_first: ["/api/*"]` (`product/wrangler.jsonc`).
- **Durable Object:** `RunEngine` in `product/worker/run-engine.ts`, bound as `RUNS`, SQLite
  backed (`new_sqlite_classes`).
- **D1:** schema in `product/migrations/0001`–`0009`.
- **Contracts:** `shared/src/schemas/*` are the source; `shared/src/contracts.ts` re-exports
  `z.infer` types. The Worker validates every dashboard-facing response with `respond(schema,
  data)` (`product/worker/lib/respond.ts`) and every error with `errorResponse(code, status)`.
  The dashboard parses every response with the same schema (`product/src/lib/api.ts`).

## Module map

| Area                | Files                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Worker routes       | `product/worker/routes/{activity,auth,instance,packs,repositories,reviewers,runs,settings,setup,webhooks}.ts` |
| Worker libraries    | `product/worker/lib/{access,activity,consolidate,context,crypto,github,github-app,instance,pack-format,packs,private-key,providers,readiness,repositories,resolution,respond,reviewers,scope,sessions,settings}.ts` |
| Run engine          | `product/worker/run-engine.ts`                                                              |
| Middleware          | `product/worker/middleware.ts` (`requireSession`, `sameOrigin`)                             |
| Dashboard           | `product/src/` — `App.tsx`, `pages/`, `shell/`, `ui/`, `lib/`                               |
| Shared contracts    | `shared/src/schemas/`, `shared/src/contracts.ts`, `shared/src/errors.ts`, `shared/src/templates.ts` |
| Migrations          | `product/migrations/0001_init.sql` … `0009_knowledge_packs.sql`                             |
| Scripts             | `scripts/deploy-guided.mjs`, `seed-dev.mjs`, `release.mjs`, `measure-layout.mjs`            |

## The run engine

Each review run is a Durable Object named by the run key
`{repo_id}:{pr_number}:{head_sha}:{delivery_id}`. The webhook calls `start(payload)`, which
persists the payload and schedules the first alarm. Every alarm segment executes exactly one step
and schedules the next. State lives in DO storage; durable history lives in D1.

Steps (`product/worker/run-engine.ts`):

| Step          | Responsibility                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| `config`      | Repository gate, supersession check, load reviewers, settings, previous findings, app/installation token, repo instructions. |
| `files`       | Paginate `pulls.listFiles`, cap at 300 files, persist entries in DO storage.                                     |
| `scope`       | Apply each reviewer pair's include/exclude globs; drop reviewers with no visible changed file; record skipped.   |
| `context`     | Build the budgeted diff context in batches of 25, in priority order, with a persisted cursor.                   |
| `reference`   | List context roots once, fetch matching repository files in batches of 8, budget per file and per run.          |
| `knowledge`   | Resolve granted packs to latest versions per reviewer; apply `apply: paths`; record metadata only.              |
| `prepare`     | For each reviewer: build its filtered context, reference block, knowledge block, system/user prompts.          |
| `review`      | Fire all provider calls in parallel with `Promise.allSettled`; parse findings and usage per reviewer.           |
| `consolidate` | Validate findings, choose inline comments, apply caps, build summary, resolution buckets, scope record.         |
| `post`        | One `pulls.createReview` with `COMMENT` or `REQUEST_CHANGES`; then minimize the app's previous reviews.          |

Retries: each step gets up to three attempts with 10 s / 60 s / 300 s backoff. A GitHub 4xx other
than 429 is non-retryable. The run finishes `completed`, `failed`, or `skipped`.

## Context assembly

`product/worker/lib/context.ts`:

- Total budget and per-file budget are instance settings (defaults 200,000 / 32,000 bytes).
- Lockfiles, generated files, binaries, and files with no textual patch are skipped.
- Files are ordered by status and documentation weight (`prioritizedOrder`), so truncation drops
  docs and renames first.
- `buildReviewPrompt` lays out PR title, description, optional repository instructions, optional
  knowledge block, changed-file list, diffs, optional reference block, context notes, and
  previous findings.
- The output contract is a strict JSON object: optional `summary`, and `findings[]` with `file`,
  optional `line`/`startLine`, `severity`, `title`, `body`.

## Consolidation

`product/worker/lib/consolidate.ts`:

- Findings are validated with zod; severity falls back to `info`, invalid lines are dropped,
  titles and bodies are truncated.
- The right-side commentable lines are derived from patch hunk headers (`newFileLines`).
- Per-reviewer and per-run inline caps (defaults 10 / 25) decide which findings become inline
  comments; the rest go to the summary as `file:line` references.
- A finding outside a reviewer's path scope is demoted to the summary even if its line is
  commentable (D-032).
- Previous findings are compared with current findings into Resolved / Still present / New.

## Storage and durability

- **D1** is the durable record: instance metadata, GitHub App credentials, reviewers, repositories,
  reviewer scope, runs, run-reviewer outcomes, sessions, OAuth states, webhook deliveries,
  settings, activity, packs, pack versions, pack files, grants.
- **DO storage** is the transient run state: token, PR, file pages, context, reference files,
  knowledge metadata, prompts, outcomes, plan.
- On finish, `finishRun` writes the D1 rows and deletes every DO storage key except `payload` and
  `finished`. The DO itself is never deleted.

## Deployment

`product/wrangler.jsonc` defines the Worker name, a custom domain route, the `RUNS` Durable
Object binding, and the `DB` D1 binding. `wrangler.jsonc` also carries the concrete D1 database
id for the owner's instance. `.github/workflows/ci.yml` runs `npm run check` on every PR and on
pushes to `dev`. `.github/workflows/deploy.yml` runs the check, applies remote D1 migrations, and
deploys the Worker on every push to `dev`. A guided deploy script exists for first-run setup.

See [`deployment.md`](deployment.md) for details and constraints.

## What this architecture gets right

- One contract source, validated on both sides.
- One consolidated review per run, with per-reviewer attribution.
- A durable, resumable run state machine instead of a long request.
- Explicit instance settings instead of hard-coded magic numbers.
- Scope enforced at consolidation, not only asked for in the prompt.
- A real activity trail and a readiness checklist computed from the database.
- A design-system layer, dark mode, and an accessibility harness.

## What this architecture cannot do

- Run a real background worker, a queue, or a long CPU-bound analysis.
- Hold a code index, embeddings, or a repository graph.
- Support multiple installations, teams, or roles safely.
- Keep prompts under a model's token window without token accounting.
- Survive a lost alarm or a failed final write without a stale `running` row.
- Offer exactly-once publishing.
- Avoid lock-in to Cloudflare primitives.

These are the starting points for [`../analysis/flaws.md`](../analysis/flaws.md).
