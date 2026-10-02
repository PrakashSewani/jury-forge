# Design — phase 2: the core workflow

This is the implementation design for phase 2 (the product core, end to end). It expands the v1
behavior in `docs/product.md` under the shape and boundaries in `docs/architecture.md`; the
decisions it implements are D-005–D-010 in `docs/decisions.md`. It is the document of record
while phase 2 is built — implementation follows it, and it is kept current as slices land.

## Modules

| Piece         | Where                          | What it holds                                                                    |
| ------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| Worker routes | `product/worker/routes/`       | Hono sub-apps: setup, auth, reviewers, repositories, runs, webhooks              |
| Worker lib    | `product/worker/lib/`          | crypto, sessions, access gate, context builder, consolidation, provider adapters |
| Run engine    | `product/worker/run-engine.ts` | the `RunEngine` Durable Object (binding `RUNS`)                                  |
| Contracts     | `shared/src/`                  | API request/response types shared by the Worker and the dashboard                |
| Dashboard     | `product/src/`                 | React screens: setup wizard, reviewers, repositories, runs                       |

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
| `run_reviewers`         | per-reviewer outcome                 | `run_id`, `reviewer_id`, `status`, `findings_json`, `error`                                                                                                               |
| `sessions`              | dashboard sessions                   | `token_hash`, `login`, `avatar_url`, `created_at`, `expires_at`                                                                                                           |
| `oauth_states`          | single-use OAuth/manifest states     | `state`, `kind` (`login`/`claim`/`manifest`), `created_at`, `expires_at`                                                                                                  |
| `webhook_deliveries`    | delivery de-duplication              | `delivery_id`, `received_at`                                                                                                                                              |

Notes: index `runs(repo_id, created_at desc)` and `sessions(expires_at)`; expired sessions and
states are pruned on access; `webhook_deliveries` older than 7 days are pruned opportunistically.

## Encryption (AES-256-GCM)

`worker/lib/crypto.ts` wraps WebCrypto. Keys come from the deploy-time `ENCRYPTION_KEY` secret
(base64, 32 bytes, validated on first use). Ciphertext format: `v1.<iv>.<ciphertext>`
(base64url). Encrypted at rest: the GitHub App private key, webhook secret, and client secret;
reviewer API keys. Decryption happens in memory only, immediately before use; secrets are never
logged and never returned by the API — an API key is write-only, and responses expose only
whether one is set. Key rotation is out of scope for v1; rotating means re-entering credentials.

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

Public state: `GET /api/setup/state` → `{ claimed, appCreated, installed }` (never credentials).
Steps, in order:

1. **Code** — `POST /api/setup/code` validates against the deploy-time `SETUP_CODE` secret while
   the instance is unclaimed (constant-time compare; 409 once claimed; a clear error when the
   secret is unset). Success returns the manifest form data for the dashboard to auto-submit:
   action URL `https://github.com/settings/apps/new?state=…` (org-owned apps use
   `/organizations/{org}/settings/apps/new`) with a single-use state.
2. **Create the app** — GitHub posts back to `GET /api/setup/manifest/callback`; the code is
   exchanged at `POST /app-manifests/{code}/conversions`; the returned credentials are encrypted
   and stored; the state is consumed.
3. **Install** — the wizard links to `https://github.com/apps/{slug}/installations/new`; "Verify"
   calls `GET /app/installations` with an app JWT and stores `installation_id`.
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
  (`pulls.listFiles`, capped at 300 files). Builds the review context within D-010: 200 KB total,
  32 KB per file, lockfiles/generated/binary skipped, truncation recorded. Files are processed in
  batches (~25 per segment) with a persisted cursor, so a segment stays inside the free plan's CPU
  budget (I/O wait does not count as CPU).
- `review` — for each enabled reviewer of the repository: prompts are prepared in their own
  segment; a single segment then fires all provider calls in parallel (the product requires
  parallel reviewers; waiting is I/O). Per-call timeout 120 s. One reviewer failing does not
  cancel the others.
- `consolidate` — validate findings (schema below; stored cap 50 per reviewer), choose inline
  comments (only lines present in the diff's right side, from patch hunk ranges), apply the D-009
  caps (10 inline per reviewer, 25 per run); everything else — overflow and findings without a
  valid line — becomes summary content with `file:line` references.
- `post` — one `pulls.createReview` with `event: COMMENT` (see Confirm below),
  `commit_id: head_sha`, the summary body, and the inline comments. A failed post is retried; if
  any reviewers failed, the summary notes them.
- Finish — `runs.status` `completed` (or `failed` when nothing could be posted or every reviewer
  failed), `run_reviewers` rows written, alarms stop.

Retries: each phase gets ≤3 attempts with backoff alarms (10 s, 60 s, 300 s); 4xx errors that
cannot succeed on retry fail the run. A repository with no enabled reviewers (or disabled in
`repositories`) finishes `skipped`. Free-plan subrequest limits (50 per invocation) are respected
by the file cap and reviewer count.

Summary requirements: one review per run; per-reviewer attribution; counts; `file:line`
references for findings not posted inline; explicit notes for truncation (D-010), cap overflow
(D-009), and failed reviewers.

## Providers

Two adapters behind one interface, selected by the reviewer's `flavor`:

| Flavor      | Request                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `openai`    | `POST {base_url}/chat/completions`, `Authorization: Bearer <key>`, `messages`                      |
| `anthropic` | `POST {base_url}/v1/messages`, `x-api-key`, `anthropic-version: 2023-06-01`, `system` + `messages` |

Prompts: system = the reviewer's instructions + rules + the output contract; user = PR title,
body (≤4 KB), file list, and the budgeted patches. Output contract — strict JSON:

```json
{
  "findings": [{ "file": "src/x.ts", "line": 42, "severity": "warning", "title": "…", "body": "…" }]
}
```

`severity` is `info` | `warning` | `error`; `title` ≤ 120 chars, `body` ≤ 2,000. Parsing is
tolerant (extract the JSON value), but a response that cannot be parsed fails that reviewer only.
`params_json` merges extra body parameters (for example temperature). API keys are decrypted only
for the call.

## Dashboard

Routes: `/setup` (wizard steps), `/reviewers`, `/reviewers/new`, `/reviewers/:id`,
`/repositories`, `/runs`, `/runs/:id`, `/` (overview with instance state and recent runs). An
auth-aware shell redirects to sign-in on 401. Screens: the reviewer editor (instructions, rules,
flavor, base URL, model, params; the API key is write-only, shown as "set" with a replace
action), repositories (enable/disable, per-repo reviewer toggles), runs (status, per-reviewer
findings, link to the GitHub review), and the wizard. Copy and visuals follow the brand constants
in `shared/`.

## API surface

| Method           | Path                                  | Auth      | Purpose                                      |
| ---------------- | ------------------------------------- | --------- | -------------------------------------------- |
| GET              | `/api/health`                         | —         | exists                                       |
| GET              | `/api/setup/state`                    | —         | wizard step status                           |
| POST             | `/api/setup/code`                     | code      | validate `SETUP_CODE`; returns manifest form |
| GET              | `/api/setup/manifest/callback`        | state     | exchange manifest code; store the app        |
| POST             | `/api/setup/verify-installation`      | setup     | find and store the installation              |
| GET              | `/api/auth/github/start`              | —         | OAuth redirect (login or claim)              |
| GET              | `/api/auth/github/callback`           | state     | token exchange, access gate, session/claim   |
| GET              | `/api/auth/session`                   | session   | current user                                 |
| POST             | `/api/auth/logout`                    | session   | delete session                               |
| GET/POST         | `/api/reviewers`                      | session   | list / create                                |
| GET/PATCH/DELETE | `/api/reviewers/:id`                  | session   | read / update / delete                       |
| GET              | `/api/repositories`                   | session   | list (optionally refreshed from GitHub)      |
| PATCH            | `/api/repositories/:repoId`           | session   | enable/disable                               |
| GET/PUT          | `/api/repositories/:repoId/reviewers` | session   | per-repo reviewer enablement                 |
| GET              | `/api/runs`                           | session   | history (keyset pagination)                  |
| GET              | `/api/runs/:id`                       | session   | run detail with per-reviewer outcomes        |
| POST             | `/api/webhooks/github`                | signature | GitHub deliveries                            |

## Security

Prepared statements only; no secret in logs or API responses; timing-safe compares for the setup
code and webhook signature; OAuth state single-use; the access gate above; the dashboard ships no
third-party scripts. Cloudflare Access remains an optional hardening layer (D-008 covers
first-run without it).

## Testing

Vitest inside the Workers runtime (the existing setup): crypto round-trip and format; session
middleware and the access gate; context budget, skip rules, and truncation notes; consolidation
caps and inline selection (pure functions); provider adapters against mocked `fetch` (both
flavors, timeouts, malformed output); webhook verification and de-duplication; the setup state
machine with mocked GitHub endpoints; Durable Object phases, retries, and run records via the
Workers Vitest plugin with stubbed `fetch`. No test performs real network calls.

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
  wherever branch protection counts reviews.
- **Dashboard access:** the installation-access gate above, with no separate allowlist UI in v1
  (recommended). The allowlist mentioned in `docs/product.md`'s core concepts would be a later
  addition.
- **Run retention:** keep every run (D1 rows are small) — revisit only if it ever matters.
