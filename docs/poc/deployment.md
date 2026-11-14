# PoC deployment

Studied at `1cc22b7`. The PoC deploys only to Cloudflare. This document records exactly how, and
which deployment constraints leaked into the product.

## Runtime configuration

`product/wrangler.jsonc`:

```jsonc
{
  "name": "jury-forge",
  "routes": [{ "pattern": "jury.prakashsewani.com", "custom_domain": true }],
  "main": "worker/index.ts",
  "compatibility_date": "2026-10-02",
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "durable_objects": {
    "bindings": [{ "name": "RUNS", "class_name": "RunEngine" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["RunEngine"] }],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "jury-forge",
      "database_id": "7eeae477-07f6-41e0-89f8-e891eba8979d"
    }
  ]
}
```

The custom domain and database id are committed. A second instance must fork or edit the config;
there is no instance profile or generated deployment manifest.

## Secrets

| Secret                            | Required | Purpose                                              |
| --------------------------------- | -------- | ---------------------------------------------------- |
| `ENCRYPTION_KEY`                  | yes      | AES-256-GCM master key for credentials at rest       |
| `ENCRYPTION_KEY_VERSION`          | no       | Label for the current key (default `1`)              |
| `ENCRYPTION_KEY_PREVIOUS`         | no       | Previous key, kept during rotation                   |
| `ENCRYPTION_KEY_PREVIOUS_VERSION` | no       | Label for the previous key (default `0`)             |
| `SETUP_CODE`                      | yes      | One-time gate for claiming a fresh instance          |

Secrets are set with `npx wrangler secret put <NAME>` and are never written to disk by the guided
deploy. Local development uses `product/.dev.vars` copied from `.dev.vars.example`.

## Local development

- `npm install`, then `npm run dev` runs the Worker and the dashboard in one Vite process with
  the Cloudflare Vite plugin. D1 and Durable Objects are emulated locally.
- `npm run dev:seed` seeds local D1 with instance state, reviewers, repositories, runs, findings,
  activity, and a sample knowledge pack.
- `npx wrangler d1 migrations apply jury-forge --local` applies migrations to local state.
- Tests need no environment variables. The workerd suite runs inside the Workers runtime with the
  Cloudflare Vitest plugin; the UI suite runs in happy-dom.

## CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `dev`:

1. Checkout, Node 24, `npm ci`.
2. `npm run check` — typecheck + lint + format check + worker tests + UI tests + builds.

`permissions: contents: read`; concurrency cancels superseded runs on the same ref.

## Deploy

`.github/workflows/deploy.yml` runs on every push to `dev` and manually via `workflow_dispatch`:

1. Checkout, Node 24, `npm ci`.
2. `npm run check` against the exact tree.
3. `npx wrangler d1 migrations apply jury-forge --remote` from `product/`.
4. `npm run deploy --workspace @jury-forge/product` (`vite build && wrangler deploy`).

It requires the repository secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts + D1) and
`CLOUDFLARE_ACCOUNT_ID`. Migrations run before the deploy; a red check stops the run before
either. Rollback is `wrangler versions list` then `wrangler versions deploy <id>` — code only, not
the database.

## Guided first deploy

`npm run deploy:guided` → `scripts/deploy-guided.mjs`:

- checks wrangler authentication;
- finds or creates the `jury-forge` D1 database, writing its id into `product/wrangler.jsonc` only
  when it created it;
- generates and sets `ENCRYPTION_KEY` and `SETUP_CODE` when absent;
- applies D1 migrations remotely;
- deploys the Worker;
- prints the instance origin and `/setup` URL.

`--dry-run` prints the plan and mutates nothing. The script never writes a secret to disk and
never runs from CI.

## Hosted instance

`docs/status.md` records the owner's instance as live at `https://jury.prakashsewani.com`, backed
by a D1 database and two secrets, with Cloudflare Access allowing the owner's email and one
path-scoped bypass for `/api/webhooks/github`. The instance was claimed on 2026-10-19 with 47
repositories synced; no reviewer existed yet, so the first real review had not run when the
status was written.

## Deployment constraints that became product constraints

| Constraint                                         | Product consequence                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Free-plan 10 ms CPU per invocation                 | Work must be I/O-bound and chunked; no heavy analysis, parsing, or indexing.         |
| 50 subrequests per invocation                      | File batches of 25 and reference batches of 8; hard caps on files and reviewers.     |
| D1 as the only relational store                    | No long transactions, no rich types, no full-text search, no vector index.           |
| One Durable Object per run                         | Run coordination is durable, but DOs proliferate and are never deleted.              |
| Durable Object alarms as the only scheduler        | No queue, no fair scheduling, no concurrency control, no dead-letter queue.           |
| Workers secrets cannot be written at runtime        | Runtime-created GitHub App credentials must live encrypted in D1.                    |
| One Worker = one origin                            | One instance per deployment; no multi-tenant routing.                               |
| Static assets served by the Worker                 | Dashboard and API share an origin; no separate web tier.                            |
| Custom domain and D1 id committed                  | A second instance requires editing the repository config.                           |
| Cloudflare Access optional                         | First-run security depends on `SETUP_CODE`; Access is a manual hardening layer.      |
| No real background worker                          | Long reviews are alarm segments; a lost alarm has no external watchdog.              |

## Documentation drift in the PoC

The deployment docs are not internally consistent at the studied commit:

- `docs/architecture.md` still describes a release workflow (`.github/workflows/release.yml`)
  and a `dev` → `main` release flow, but D-030 retired `main` and the workflow no longer exists.
- `docs/development.md` still says to create release PRs from `dev` to `main`, while the same
  file's later section and D-030 say a merge to `dev` is the shipping event.
- `product/migrations/0001_init.sql` only creates `instance_meta`; the rest of the schema arrives
  in `0002_phase2.sql`. The architecture docs treat `0002` as the beginning of "phase 2", which
  is accurate historically but confusing for a fresh reader.

This is a process lesson: a decision log and a live status file are necessary but not sufficient.
The architecture and development docs need their own consistency check in CI or review.
