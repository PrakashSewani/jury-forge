# Design — phase 2: the core workflow

This is the implementation design for phase 2 (the product core, end to end). It expands the v1
behavior in `docs/product.md` under the shape and boundaries in `docs/architecture.md`; the
decisions it implements are D-005–D-010 in `docs/decisions.md`. It is the document of record
while phase 2 is built — implementation follows it, and it is kept current as slices land. The
post-phase-2 improvement slices (D-018 onward) extend this document in place; each section names
the decision it implements.

## Modules

| Piece         | Where                          | What it holds                                                                                |
| ------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| Worker routes | `product/worker/routes/`       | Hono sub-apps: setup, auth, reviewers, repositories, runs, webhooks                          |
| Worker lib    | `product/worker/lib/`          | crypto, sessions, access gate, context builder, consolidation, resolution, provider adapters |
| Run engine    | `product/worker/run-engine.ts` | the `RunEngine` Durable Object (binding `RUNS`)                                              |
| Contracts     | `shared/src/`                  | API request/response types shared by the Worker and the dashboard                            |
| Dashboard     | `product/src/`                 | React screens: setup wizard, reviewers, repositories, runs                                   |

## Data model (D1)

Migrations continue in `product/migrations/` (`0002_*` onward). Timestamps are unix seconds
(`INTEGER`, `unixepoch()`). All SQL uses prepared statements.

| Table                   | Purpose                              | Key columns                                                                                                                                                               |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `instance_meta`         | existing singleton key/value         | `key`, `value` — holds `claimed_at`, `owner_login`, `owner_id`, `owner_type`, `installation_id`, `app_slug`                                                               |
| `github_app`            | the instance's private app (one row) | `app_id`, `slug`, `client_id`, `private_key_enc`, `webhook_secret_enc`, `client_secret_enc`                                                                               |
| `reviewers`             | reviewer definitions                 | `id`, `name`, `instructions`, `rules`, `flavor` (`openai`/`anthropic`), `base_url`, `api_key_enc`, `model`, `params_json`, `enabled`                                      |
| `repositories`          | installed repositories               | `repo_id` (GitHub numeric id), `full_name`, `private`, `enabled`                                                                                                          |
| `reviewer_repositories` | per-repo reviewer enablement         | `reviewer_id`, `repo_id`, `enabled`                                                                                                                                       |
| `runs`                  | one row per review run               | `id`, `delivery_id`, `repo_id`, `pr_number`, `head_sha`, `event`, `status` (`running`/`completed`/`failed`/`skipped`), `error`, `review_url`, `created_at`, `finished_at` |
| `run_reviewers`         | per-reviewer outcome                 | `run_id`, `reviewer_id`, `status`, `findings_json`, `summary` (D-020), `usage_json` (D-020), `error`                                                                      |
| `sessions`              | dashboard sessions                   | `token_hash`, `login`, `avatar_url`, `created_at`, `expires_at`                                                                                                           |
| `oauth_states`          | single-use OAuth/manifest states     | `state`, `kind` (`login`/`claim`/`manifest`), `created_at`, `expires_at`                                                                                                  |
| `webhook_deliveries`    | delivery de-duplication              | `delivery_id`, `received_at`                                                                                                                                              |
| `instance_settings`     | tunable instance numbers (D-021)     | `key`, `value` (TEXT, validated per key), `updated_at` — see "Instance settings"                                                                                          |
| `activity_log`          | the dashboard activity trail (D-023) | `id`, `at`, `actor`, `action`, `target`, `detail`                                                                                                                         |

Notes: index `runs(repo_id, created_at desc)` and `sessions(expires_at)`; expired sessions and
states are pruned on access; `webhook_deliveries` older than 7 days are pruned opportunistically.

## Encryption (AES-256-GCM)

`worker/lib/crypto.ts` wraps WebCrypto. Ciphertext format: `v2.<keyVersion>.<iv>.<ciphertext>`
(base64url) for everything written now; the legacy `v1.<iv>.<ciphertext>` form stays readable.
Keys come from deploy-time secrets, validated on first use (base64, 32 bytes):

| Secret                            | Meaning                                         |
| --------------------------------- | ----------------------------------------------- |
| `ENCRYPTION_KEY`                  | the current key (required)                      |
| `ENCRYPTION_KEY_VERSION`          | the current key's label (default `1`)           |
| `ENCRYPTION_KEY_PREVIOUS`         | the previous key, optional — set while rotating |
| `ENCRYPTION_KEY_PREVIOUS_VERSION` | the previous key's label (default `0`)          |

`loadKeyRing(env)` builds the ring; `encryptSecret(ring, value)` always writes with the current key
and stamps its version; `decryptSecret(ring, value)` picks the key by version — a `v2` value with an
unknown version is an error, and a legacy `v1` value is tried with the current key, then the
previous one. Encrypted at rest: the GitHub App private key, webhook secret and client secret;
reviewer API keys. Decryption happens in memory only, immediately before use; secrets are never
logged and never returned by the API — an API key is write-only, and responses expose only
whether one is set.

**Rotation (D-023, slice 10):** point `ENCRYPTION_KEY` at the new key, move the old one into
`ENCRYPTION_KEY_PREVIOUS`, and bump the two version labels — nothing has to be re-entered. Every
write stamps the current version; a reviewer API key is lazily re-encrypted the next time that
reviewer is updated (the same plaintext, re-wrapped with the current key, recorded in the activity
trail). The previous key can be dropped once nothing decrypts with it; GitHub App credentials have
no partial-update path (they are rewritten only when the app is registered), so drop the previous
key only after re-registering the app. The operator procedure is in `docs/development.md`.

## Instance settings and blocking mode (D-021)

`instance_settings` holds the numbers phase 2 fixed in code as key/value rows (`key`, `value`,
`updated_at`). `worker/lib/settings.ts` owns the spec — every key's parser, bounds, and default —
and `loadSettings(db)` returns the effective settings, falling back to the default whenever a
stored value is missing or fails validation (a hand-edited row must never break a run).

| Key                         | Bounds           | Default | Used by                                         |
| --------------------------- | ---------------- | ------- | ----------------------------------------------- |
| `inlineCommentsPerReviewer` | 1–50             | 10      | consolidation's per-reviewer inline cap (D-009) |
| `inlineCommentsPerRun`      | 1–100            | 25      | consolidation's per-run inline cap (D-009)      |
| `contextTotalBytes`         | 20,000–1,000,000 | 200,000 | context builder total budget (D-010)            |
| `contextFileBytes`          | 4,000–200,000    | 32,000  | context builder per-file budget (D-010)         |
| `descriptionLimit`          | 500–20,000       | 4,096   | PR description excerpt in the prompt            |
| `blockingMode`              | boolean          | `false` | review event selection (item 11, D-013 default) |
| `blockingErrorThreshold`    | 1–50             | 1       | error findings needed for `REQUEST_CHANGES`     |
| `repoInstructions`          | boolean          | `false` | repository instructions in prompts (D-022)      |
| `repoInstructionsMaxBytes`  | 1,000–50,000     | 8,000   | excerpt budget for those instructions (D-022)   |

`GET /api/settings` returns `{ settings, defaults }` — the effective values and the spec's
defaults, so the dashboard can render "reset to defaults" without hard-coding them. `PATCH
/api/settings` takes a partial object; unknown keys are rejected with 400, every value is
validated against its bounds, and the response is the same shape as `GET`. Both routes are
session-guarded and same-origin. The dashboard's Settings screen ("Advanced") shows the numbers
as inputs with the current values, the blocking toggle and threshold, a save action, and a
per-field reset to the default.

The run engine loads the settings in its `config` step and carries them into the run: the context
budget and description cap shape the prompt, the inline caps shape consolidation, and the blocking
numbers shape the posted event. The D-009/D-010 defaults are unchanged, so an instance that never
opens the screen behaves exactly as before.

**Blocking mode** (item 11): with `blockingMode` off — the default, and D-013's posture — every
run posts `event: COMMENT`. With it on, a run whose findings contain at least
`blockingErrorThreshold` findings of severity `error` posts `event: REQUEST_CHANGES`; everything
else still posts `COMMENT`, and a run with no error findings never blocks. The review body's notes
state which event was used and, when blocking was on but the threshold was not reached, that it
was considered.

**Repository instructions** (D-022, item 10): with `repoInstructions` on, a run reads the
repository's `AGENTS.md` and `CONTRIBUTING.md` at the pull request's head SHA (raw media type,
through the installation token, in that order) and includes bounded excerpts in each reviewer's
user prompt, capped across both files by `repoInstructionsMaxBytes`. A missing file (404) or a
failed fetch is skipped without failing the run; a file cut off at the budget is marked as
truncated in the block. The block is presented as repository conventions that inform the review,
and the prompt states that the reviewer's own instructions and rules take precedence over it. The
setting is off by default — it costs up to two subrequests and up to the budget in prompt bytes
per reviewer on every run.

## Sessions and access

- Authorization uses the instance's own GitHub App (its client id/secret): `/api/auth/github/start`
  → GitHub authorize → `/api/auth/github/callback` (state checked and consumed) → user token →
  `GET /user` for identity.
- **Access gate:** the token must also see the instance's installation in
  `GET /user/installations`. GitHub decides who may authorize the app at all (its own rules for
  private apps); the gate makes dashboard access follow installation access, which covers the
  owner and the org members GitHub grants access.
- Sessions: 32 random bytes, stored as SHA-256 in `sessions`; cookie `jf_session` (HttpOnly,
  Secure, SameSite=Lax, 30 days). Logout deletes the row. Access is checked at sign-in; someone
  who loses GitHub access keeps their session until it expires — accepted in v1.
- CSRF: state-changing requests must be same-origin (`Origin`/`Sec-Fetch-Site` check); the
  session cookie is SameSite=Lax.
- Middleware guards `/api/*` except: health, auth start/callback, setup endpoints, and the
  webhook receiver.

## Setup wizard

Public state: `GET /api/setup/state` → `{ claimed, appCreated, installed, appSlug }` — `appSlug` is
the app's public slug (`null` until the app exists), used to link to the install page; credentials
are never included. Steps, in order:

1. **Code** — `POST /api/setup/code` validates against the deploy-time `SETUP_CODE` secret while
   the instance is unclaimed (constant-time compare; 409 once claimed; a clear error when the
   secret is unset). Success returns the manifest form data for the dashboard to auto-submit:
   action URL `https://github.com/settings/apps/new?state=…` (org-owned apps use
   `/organizations/{org}/settings/apps/new`) with a single-use state.
2. **Create the app** — GitHub posts back to `GET /api/setup/manifest/callback`; the code is
   exchanged at `POST /app-manifests/{code}/conversions`; the returned credentials are encrypted
   and stored; the state is consumed.
3. **Install** — the wizard links to `https://github.com/apps/{slug}/installations/new`; "Verify"
   (gated by a short-lived `jf_setup` cookie issued when the setup code was accepted) calls
   `GET /app/installations` with an app JWT and stores `installation_id`.
4. **Claim** — sign in through the OAuth flow above; the first successful access-gated user is
   recorded as the owner (`owner_login`, `owner_id`, `owner_type`, `claimed_at`). Later sign-ins
   are ordinary logins.

Manifest contents: name, `url` = instance origin, hook = `origin/api/webhooks/github`,
`redirect_url` = `origin/api/setup/manifest/callback`, callback =
`origin/api/auth/github/callback`, `public: false`, permissions `contents: read` +
`pull_requests: write`, events `pull_request`.

Once claimed, the setup endpoints return 409 — there is no reset endpoint; resetting means a
fresh deploy or clearing D1.

## Webhook intake

`POST /api/webhooks/github` (public; 503 before setup):

1. Verify `x-hub-signature-256` (HMAC-SHA256 over the raw body, webhook secret from D1,
   timing-safe) — 401 on failure.
2. Only `pull_request` with actions opened/reopened/synchronize/ready_for_review; draft PRs and
   everything else are acknowledged and dropped (202).
3. De-duplicate on `X-GitHub-Delivery` (`webhook_deliveries` insert; conflict → 202).
4. Kick the run: `RUNS.get(idFromName("…")).start(…)`; on kick failure, delete the delivery row
   and return 500 so GitHub's retry is not swallowed. Otherwise 202 — the handler does no GitHub
   API work.

The run key is `{repo_id}:{pr_number}:{head_sha}:{delivery_id}`, and `start()` is idempotent, so
duplicate starts are safe.

## Run engine — per-run Durable Object

`RunEngine` (binding `RUNS`), SQLite-backed (required on the free plan; wrangler migration
`new_sqlite_classes`). The webhook passes the minimum: delivery id, repo, PR number, head SHA,
action, installation id. Phase state lives in DO storage; `runs`/`run_reviewers` rows in D1 are
the durable history.

Phases, one alarm segment at a time:

- `context` — installation token (`@octokit/auth-app`), PR metadata, and changed files
  (`pulls.listFiles`, capped at 300 files). Builds the review context within the instance's
  configured budget (D-021; D-010's 200 KB total and 32 KB per file are the defaults): lockfiles,
  generated files and binaries are skipped, truncation is recorded. Files are processed in
  batches (~25 per segment), in priority order — added/changed source first, docs and renames
  trail (D-018) — with a persisted cursor, so a segment stays inside the free plan's CPU budget
  (I/O wait does not count as CPU). Before the files are read, the newest earlier run for the
  same repository and pull request that recorded findings is loaded and kept as the run's
  previous findings, per reviewer (D-020). When repository instructions are enabled, the
  repository's `AGENTS.md` and `CONTRIBUTING.md` are read at the PR's head SHA here, bounded by
  the configured budget, and kept for the prompts (D-022).
- `review` — for each enabled reviewer of the repository: prompts are prepared in their own
  segment; a single segment then fires all provider calls in parallel (the product requires
  parallel reviewers; waiting is I/O). Per-call timeout 120 s. One reviewer failing does not
  cancel the others. Each call's parsed output carries the reviewer's optional `summary`, its
  findings, and the provider's token `usage` when the response envelope reports it (D-020).
- `consolidate` — validate findings (schema below; stored cap 50 per reviewer), choose inline
  comments (only lines present in the diff's right side, from patch hunk ranges; a finding whose
  `startLine` precedes its `line` and both are commentable becomes a multi-line comment — D-020),
  apply the configured inline caps (D-009's 10 per reviewer and 25 per run are the defaults —
  D-021 makes them instance settings); everything else — overflow and
  findings without a valid line — becomes summary content with `file:line` references. The
  summary also gains the Resolved / Still present / New buckets when the run has previous
  findings, computed against this run's findings (D-020).
- `post` — one `pulls.createReview` with `event: COMMENT` (the default; `REQUEST_CHANGES` only
  when blocking mode is on and the error threshold is met — D-021, see Confirm below),
  `commit_id: head_sha`, the summary body, and the inline comments. A failed post is retried; if
  any reviewers failed, the summary notes them. After posting, the app's previous reviews on the
  PR are minimized best-effort (`minimizeComment`, `OUTDATED` — D-018), so the thread rests on the
  latest verdict.
- Finish — `runs.status` `completed` (or `failed` when nothing could be posted or every reviewer
  failed), `run_reviewers` rows written, alarms stop.

Retries: each phase gets ≤3 attempts with backoff alarms (10 s, 60 s, 300 s); 4xx errors that
cannot succeed on retry fail the run. A repository with no enabled reviewers (or disabled in
`repositories`) finishes `skipped`; a run that begins after a newer run exists for the same PR
also finishes `skipped` — newest run wins, so rapid pushes never stack runs (D-018). Reviewer
selection is opt-out: every enabled reviewer applies
to an enabled repository unless a `reviewer_repositories` row disables the pair (D-016). Free-plan
subrequest limits (50 per invocation) are respected by the file cap and reviewer count.

Summary requirements: one review per run; per-reviewer attribution; each reviewer's own `summary`
when it sent one (D-020); counts; `file:line` references for findings not posted inline; explicit
notes for truncation (D-010), cap overflow (D-009), and failed reviewers; and the Resolved / Still
present / New buckets when previous findings exist (D-020).

## Providers

Two adapters behind one interface, selected by the reviewer's `flavor`:

| Flavor      | Request                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `openai`    | `POST {base_url}/chat/completions`, `Authorization: Bearer <key>`, `messages`                      |
| `anthropic` | `POST {base_url}/v1/messages`, `x-api-key`, `anthropic-version: 2023-06-01`, `system` + `messages` |

Prompts: system = the reviewer's instructions + rules + the output contract; user = PR title,
body (≤ the configured description limit — 4 KB by default, D-021), file list, the budgeted
patches, and — when the setting is on — the bounded repository-instructions block (D-022). Output
contract v2 (D-020) — strict JSON:

```json
{
  "summary": "one or two sentences on the change as a whole",
  "findings": [
    {
      "file": "src/x.ts",
      "line": 60,
      "startLine": 55,
      "severity": "warning",
      "title": "…",
      "body": "…"
    }
  ]
}
```

`severity` is `info` | `warning` | `error`; `title` ≤ 120 chars, `body` ≤ 2,000, `summary` ≤ 500 —
oversized values are truncated, a missing or invalid `severity` falls back to `info`, and invalid
`line` values are dropped. `startLine` (optional) marks a multi-line finding and is kept only when
it precedes `line` and both lines are commentable in the diff. `summary` is optional. Parsing is
tolerant (extract the JSON value), but a response that cannot be parsed fails that reviewer only.
Token `usage` is captured from the response envelope when present — OpenAI's
`usage.prompt_tokens` / `completion_tokens` / `total_tokens`, Anthropic's `usage.input_tokens` /
`output_tokens` (total summed) — normalized and stored per reviewer; a provider that reports none
is not an error. `params_json` merges extra body parameters (for example temperature); the
`anthropic` flavor defaults `max_tokens` to 4096 unless `params_json` sets it. API keys are
decrypted only for the call, and a stored key is write-only: responses expose only whether one is
set, and `PATCH` with `apiKey: *** clears it.

## Audit trail (D-023)

Every state change worth explaining later is recorded in `activity_log` (`at`, `actor`, `action`,
`target`, `detail`) through `worker/lib/activity.ts`'s `recordActivity()`, which is best-effort: a
failed write is logged and swallowed so it can never fail the request that triggered it. Recorded
actions: `sign_in` and `sign_out`; `setting_change` (one row per changed key); `reviewer_create`,
`reviewer_update` (naming the changed fields, and saying whether the API key was set, cleared, or
re-wrapped by rotation) and `reviewer_delete`; `repository_toggle` and `repository_reviewers`;
`run_started` for the webhook kick (actor `webhook`); and `credential_rotation`. `GET
/api/activity` returns the newest first with a keyset cursor (`at`, then `id`, like runs), limit
1–100 default 50, and prunes entries older than 90 days opportunistically on read. The dashboard's
`/activity` screen lists time, actor, action, target and detail with the same "load more" pattern
as runs — a reading surface, not an audit export.

## Dashboard

Routes: `/setup` (wizard steps), `/reviewers`, `/reviewers/new`, `/reviewers/:id`,
`/repositories`, `/runs`, `/runs/:id`, `/settings` (Advanced — the D-021 numbers), `/activity`
(the D-023 trail), `/` (overview
with instance state and recent runs). An
auth-aware shell redirects to sign-in on 401. Screens: the reviewer editor (instructions, rules,
flavor, base URL, model, params; the API key is write-only, shown as "set" with a replace
action), repositories (enable/disable, per-repo reviewer toggles), runs (status, per-reviewer
findings, link to the GitHub review), and the wizard. Copy and visuals follow the brand constants
in `shared/`.

The wizard UI derives its current step from setup state: **code** (enter the setup code; the
manifest form is auto-submitted to GitHub's app-creation page), **install** (link to
`https://github.com/apps/{appSlug}/installations/new`, then verify), **claim** (GitHub sign-in),
then done. Errors redirected back from the claim callback (`?error=installation_required`,
`?error=access_denied`) render as messages on `/setup`. Routing is a dependency-free path switch
with full-page navigation; the shell shows the nav, the instance state, and the signed-in user,
and gates the dashboard screens behind sign-in. A repositories refresh imports the installation's
repositories; newly discovered ones arrive disabled — enabling one is an explicit dashboard
action (D-016).

## API surface

| Method           | Path                                  | Auth      | Purpose                                           |
| ---------------- | ------------------------------------- | --------- | ------------------------------------------------- |
| GET              | `/api/health`                         | —         | exists                                            |
| GET              | `/api/setup/state`                    | —         | wizard step status                                |
| POST             | `/api/setup/code`                     | code      | validate `SETUP_CODE`; returns manifest form      |
| GET              | `/api/setup/manifest/callback`        | state     | exchange manifest code; store the app             |
| POST             | `/api/setup/verify-installation`      | setup     | find and store the installation                   |
| GET              | `/api/auth/github/start`              | —         | OAuth redirect (login or claim)                   |
| GET              | `/api/auth/github/callback`           | state     | token exchange, access gate, session/claim        |
| GET              | `/api/auth/session`                   | session   | current user                                      |
| POST             | `/api/auth/logout`                    | session   | delete session                                    |
| GET/POST         | `/api/reviewers`                      | session   | list / create                                     |
| GET/PATCH/DELETE | `/api/reviewers/:id`                  | session   | read / update / delete                            |
| GET              | `/api/repositories`                   | session   | list; `?refresh=1` syncs from GitHub              |
| PATCH            | `/api/repositories/:repoId`           | session   | enable/disable                                    |
| GET/PUT          | `/api/repositories/:repoId/reviewers` | session   | per-repo reviewer enablement                      |
| GET              | `/api/runs`                           | session   | history `{ runs, nextCursor }` (keyset)           |
| GET              | `/api/runs/:id`                       | session   | run detail `{ run, reviewers }`                   |
| GET/PATCH        | `/api/settings`                       | session   | `{ settings, defaults }` (D-021)                  |
| GET              | `/api/activity`                       | session   | activity trail `{ activity, nextCursor }` (D-023) |
| POST             | `/api/webhooks/github`                | signature | GitHub deliveries                                 |

## Security

Prepared statements only; no secret in logs or API responses; timing-safe compares for the setup
code and webhook signature; OAuth state single-use; the access gate above; the dashboard ships no
third-party scripts. Cloudflare Access remains an optional hardening layer (D-008 covers
first-run without it).

## Testing

Vitest inside the Workers runtime (the existing setup): crypto round-trip and format; session
middleware and the access gate; context budget, skip rules, and truncation notes; consolidation
caps and inline selection (pure functions); multi-line `startLine` acceptance and rejection and
the resolution comparison (D-020, pure functions); settings validation, defaults, and the
blocking-event selection (D-021, pure functions); the repository-instruction excerpt formatter and
its budget (D-022, pure functions); the key ring's formats, rotation detection, and legacy
decryption (D-023, pure functions); the activity trail's best-effort writes and its keyset page
(D-023); provider adapters against mocked `fetch` (both
flavors, timeouts, malformed output, usage envelopes); webhook verification and de-duplication;
the setup state machine with mocked GitHub endpoints; Durable Object phases, retries, and run
records via the Workers Vitest plugin with stubbed `fetch`. No test performs real network calls.

## Build order

Each slice lands as a PR to `dev` with docs kept current and `npm run check` green:

1. **Foundations** — migration `0002`, crypto module, sessions, shared contracts, test
   migrations.
2. **Setup wizard** — manifest flow, installation verification, access gate, claim; wizard UI.
3. **Reviewers and providers** — reviewers CRUD API, provider adapters, context builder and
   consolidation as tested pure modules.
4. **Intake and engine** — webhook receiver, `RunEngine` end to end, run history records.
5. **Dashboard** — reviewers, repositories, and runs screens; end-to-end pass.

Local wizard testing needs a public URL for GitHub's redirects (a tunnel such as `cloudflared`
works); the real end-to-end pass happens on a deployed instance, which is manual.

## Confirm before implementation

- **Review event:** `COMMENT` (non-blocking, recommended) — `REQUEST_CHANGES` would block merges
  wherever branch protection counts reviews. D-021 keeps `COMMENT` the default and makes
  `REQUEST_CHANGES` an explicit per-instance opt-in (blocking mode above).
- **Dashboard access:** the installation-access gate above, with no separate allowlist UI in v1
  (recommended). The allowlist mentioned in `docs/product.md`'s core concepts would be a later
  addition.
- **Run retention:** keep every run (D1 rows are small) — revisit only if it ever matters.
