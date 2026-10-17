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
| Shell         | `product/src/shell/`           | `Shell`, `Nav`, `ThemeToggle`, `UserMenu`, `RouteGuard` — the chrome around the screens      |
| UI primitives | `product/src/ui/`              | the D-026 design-system primitives, re-exported through `product/src/components.tsx`         |

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
  Secure, SameSite=Lax, **7 days** — D-024; it was 30 days in v1). Logout deletes the row. Access
  is checked at sign-in; someone who loses GitHub access keeps their session until it expires —
  bounded to a week, and the rejected alternative (storing user tokens to re-check on every
  request) is recorded in D-024.
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
`run_started` for the webhook kick (actor `webhook`); `credential_rotation`; and `reviewer_import`
(the D-025 merge, with its created/updated/unchanged/skipped counts). `GET
/api/activity` returns the newest first with a keyset cursor (`at`, then `id`, like runs), limit
1–100 default 50, and prunes entries older than 90 days opportunistically on read. The dashboard's
`/activity` screen lists time, actor, action, target and detail with the same "load more" pattern
as runs — a reading surface, not an audit export.

## Dashboard

Routes: `/setup` (wizard steps), `/reviewers`, `/reviewers/new`, `/reviewers/:id`,
`/repositories`, `/runs`, `/runs/:id`, `/settings` (Advanced — the D-021 numbers), `/activity`
(the D-023 trail), `/` (overview with instance state and recent runs). Routing is a
dependency-free path switch with full-page navigation.

The chrome lives in `product/src/shell/` (D-027). `Shell({ user, setup, route, children })`
renders a **sidebar at `lg` and above** and a **top bar plus a slide-over panel below `lg`**;
exactly one nav is visible at every width (`hidden lg:flex` sidebar, `lg:hidden` panel). Content
sits in a `max-w-7xl` grid with `min-w-0` on the flex children, and the header, main and footer
share that width. The sidebar and panel carry the instance status chip (a `Badge` from
`setup.claimed` / `setup.installed` / `setup.appSlug`) and the route list — Overview, Reviewers,
Repositories, Runs, Settings, Activity — with the active section driven by `routeFromPath`; a
sub-route keeps its section active. `ThemeToggle` cycles light → dark → system and calls
`applyTheme` from `product/src/lib/theme.ts`, persisting under `jf:theme`; `main.tsx` resolves
`readStoredTheme()` → `resolveTheme(pref, systemPrefersDark())` and calls `applyTheme` before the
first render, so `data-theme` is set from the start. `UserMenu` shows the avatar, login and a
≥44 px log-out control. The mobile toggle is a real `<button>` with `aria-expanded`/
`aria-controls`; Escape and a link click both close the panel. `RouteGuard` renders the sign-in,
not-set-up and API-failure gates as a centred panel with a title, one line of explanation and
**one** primary action (plus a retry on failure) instead of a bare `Card`.

Every screen is built from `product/src/ui/` and uses semantic tokens only — no raw palette utility
survives anywhere in `product/src/` (D-027). Each one renders four states: loading (`Skeleton`),
empty (`EmptyState` carrying the next action), error (one human sentence plus a retry) and data.
`product/src/pages/screen-state.tsx` supplies the shared loading and error blocks, and
`product/src/pages/messages.ts` maps the API codes these screens can receive to sentences, so no
screen prints a machine code such as `request_failed` at the user — the shared taxonomy is slice D.

- **Overview** — instance state and the derived next action first, then recent runs as a table with
  relative times.
- **Reviewers** — a table (name, model, whether a key is set, repositories, enabled) with inline
  enable/disable and a per-row edit; the repositories column is derived from each repository's
  reviewer assignments.
- **Reviewer editor** — a sectioned form (identity, model, key, instructions, rules, parameters)
  with per-field validation, a sticky save bar, a `beforeunload` unsaved-changes guard, and the API
  key shown only as set / replace, never as a value.
- **Repositories** — a table with an enabled toggle and per-repo reviewer toggles expanded inside
  the row, instead of a second screen.
- **Runs** — a table with status and repository filters, relative times and running rows badged; the
  list is a snapshot, because live updating is slice D.
- **Run detail** — findings grouped per reviewer with a severity filter, a token-usage strip, and
  empty / pending / failed reviewer states that explain themselves.
- **Settings** — the advanced numbers grouped with their defaults and a per-field reset.
- **Activity** — the trail as a table with actor and action filters.

Copy and visuals come from the design system in `product/src/ui/` — see
[Design system (D-026)](#design-system-d-026).

The wizard UI derives its current step from setup state: **code** (enter the setup code; the
manifest form is auto-submitted to GitHub's app-creation page), **install** (link to
`https://github.com/apps/{appSlug}/installations/new`, then verify), **claim** (GitHub sign-in),
then done. Errors redirected back from the claim callback (`?error=installation_required`,
`?error=access_denied`) render as messages on `/setup`. A repositories refresh imports the
installation's repositories; newly discovered ones arrive disabled — enabling one is an explicit
dashboard action (D-016).

## Design system (D-026)

Slice A gives the dashboard a named vocabulary of design tokens and a reusable primitive layer. It
was a strict visual no-op: every token equals the exact Tailwind default utility it replaces (so
later slices can swap classes for the names below without changing a pixel), and no page, worker,
shared, or site source changed. Slice B (D-027) then retuned the four text levels for contrast,
shipped dark mode, added the primitives' focus and 44 px target behaviour and rebuilt the eight
screens on them; the tables below carry the current values. The token layer lives in
`product/src/styles.css`'s `@theme` block; the primitives live in `product/src/ui/`.

### Design tokens

Every value below is copied verbatim from `product/src/styles.css`. The "Tailwind default" column
names the utility whose value the token now spells — the token names are the only new thing, which
is what makes the swap a no-op.

**Surfaces**

| Token                     | Value                      | Tailwind default |
| ------------------------- | -------------------------- | ---------------- |
| `--color-surface-page`    | `oklch(98.5% 0 none)`      | `bg-neutral-50`  |
| `--color-surface`         | `#fff`                     | `bg-white`       |
| `--color-surface-muted`   | `oklch(97% 0 none)`        | `bg-neutral-100` |
| `--color-surface-inverse` | `oklch(20.5% 0 none)`      | `bg-neutral-900` |
| `--color-surface-error`   | `oklch(97.1% 0.013 17.38)` | `bg-red-50`      |
| `--color-surface-info`    | `oklch(97% 0.014 254.604)` | `bg-blue-50`     |

**Borders**

| Token                   | Value                        | Tailwind default     |
| ----------------------- | ---------------------------- | -------------------- |
| `--color-border`        | `oklch(92.2% 0 none)`        | `border-neutral-200` |
| `--color-border-strong` | `oklch(87% 0 none)`          | `border-neutral-300` |
| `--color-border-error`  | `oklch(88.5% 0.062 18.334)`  | `border-red-200`     |
| `--color-border-info`   | `oklch(88.2% 0.059 254.128)` | `border-blue-200`    |

**Text**

| Token                  | Value                        | Tailwind default   |
| ---------------------- | ---------------------------- | ------------------ |
| `--color-text`         | `oklch(20.5% 0 none)`        | `text-neutral-900` |
| `--color-text-body`    | `oklch(37.1% 0 none)`        | `text-neutral-700` |
| `--color-text-muted`   | `oklch(43.9% 0 none)`        | `text-neutral-600` |
| `--color-text-subtle`  | `oklch(55.6% 0 none)`        | `text-neutral-500` |
| `--color-text-inverse` | `#fff`                       | `text-white`       |
| `--color-text-error`   | `oklch(44.4% 0.177 26.899)`  | `text-red-800`     |
| `--color-text-info`    | `oklch(42.4% 0.199 265.638)` | `text-blue-800`    |

**Accent**

| Token                  | Value                 | Tailwind default       |
| ---------------------- | --------------------- | ---------------------- |
| `--color-accent`       | `oklch(20.5% 0 none)` | `bg-neutral-900`       |
| `--color-accent-hover` | `oklch(37.1% 0 none)` | `hover:bg-neutral-700` |

**Verdict severities**

| Token                             | Value                       | Tailwind default   |
| --------------------------------- | --------------------------- | ------------------ |
| `--color-verdict-error-surface`   | `oklch(93.6% 0.032 17.717)` | `bg-red-100`       |
| `--color-verdict-error-text`      | `oklch(44.4% 0.177 26.899)` | `text-red-800`     |
| `--color-verdict-warning-surface` | `oklch(96.2% 0.059 95.617)` | `bg-amber-100`     |
| `--color-verdict-warning-text`    | `oklch(47.3% 0.137 46.201)` | `text-amber-800`   |
| `--color-verdict-info-surface`    | `oklch(97% 0 none)`         | `bg-neutral-100`   |
| `--color-verdict-info-text`       | `oklch(43.9% 0 none)`       | `text-neutral-600` |

**Run statuses**

| Token                              | Value                        | Tailwind default   |
| ---------------------------------- | ---------------------------- | ------------------ |
| `--color-status-running-surface`   | `oklch(96.2% 0.059 95.617)`  | `bg-amber-100`     |
| `--color-status-running-text`      | `oklch(47.3% 0.137 46.201)`  | `text-amber-800`   |
| `--color-status-completed-surface` | `oklch(96.2% 0.044 156.743)` | `bg-green-100`     |
| `--color-status-completed-text`    | `oklch(44.8% 0.119 151.328)` | `text-green-800`   |
| `--color-status-failed-surface`    | `oklch(93.6% 0.032 17.717)`  | `bg-red-100`       |
| `--color-status-failed-text`       | `oklch(44.4% 0.177 26.899)`  | `text-red-800`     |
| `--color-status-skipped-surface`   | `oklch(97% 0 none)`          | `bg-neutral-100`   |
| `--color-status-skipped-text`      | `oklch(43.9% 0 none)`        | `text-neutral-600` |

**Radii and shadow**

| Token              | Value                           | Tailwind default |
| ------------------ | ------------------------------- | ---------------- |
| `--radius-control` | `0.375rem`                      | `rounded-md`     |
| `--radius-card`    | `0.5rem`                        | `rounded-lg`     |
| `--shadow-panel`   | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | `shadow-xs`      |

**Font stack**

| Token         | Value                                                                                                                                                                                   | Tailwind default |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `--font-sans` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'` | `font-sans`      |

### Dark mode

Dark mode **ships** (D-027). `styles.css` declares an explicit `dark` custom variant,
`@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *))`, and a
`:root[data-theme='dark']` block that overrides every token that has a dark value — surfaces,
borders, text, accent, and the verdict and status palettes. The palettes are included because their
light surfaces move under the override (Badge's neutral tone sits on `--color-surface-muted`) while
their `*-800` text stayed at its light value, which lands near 2:1 on the dark surface; each dark
value is again one Tailwind default, in the same hue family at the ramp that clears it (`red-950`
surface under `red-300` text, and so on). The system preference is resolved in
`product/src/lib/theme.ts` (`readStoredTheme`, `resolveTheme`, `systemPrefersDark`, `applyTheme`),
which persists the choice under `jf:theme`. `main.tsx` now calls `applyTheme` before the first
render and the shell's `ThemeToggle` is its interactive caller, so `data-theme` is set from boot
and a dark-OS machine gets dark mode.

**Dark overrides** — the complete `:root[data-theme='dark']` block, again one Tailwind default
each:

| Token                              | Dark value                   | Tailwind default |
| ---------------------------------- | ---------------------------- | ---------------- |
| `--color-surface-page`             | `oklch(14.5% 0 none)`        | `neutral-950`    |
| `--color-surface`                  | `oklch(20.5% 0 none)`        | `neutral-900`    |
| `--color-surface-muted`            | `oklch(26.9% 0 none)`        | `neutral-800`    |
| `--color-surface-inverse`          | `oklch(97% 0 none)`          | `neutral-100`    |
| `--color-border`                   | `oklch(26.9% 0 none)`        | `neutral-800`    |
| `--color-border-strong`            | `oklch(37.1% 0 none)`        | `neutral-700`    |
| `--color-text`                     | `oklch(97% 0 none)`          | `neutral-100`    |
| `--color-text-body`                | `oklch(92.2% 0 none)`        | `neutral-200`    |
| `--color-text-muted`               | `oklch(87% 0 none)`          | `neutral-300`    |
| `--color-text-subtle`              | `oklch(70.8% 0 none)`        | `neutral-400`    |
| `--color-text-inverse`             | `oklch(20.5% 0 none)`        | `neutral-900`    |
| `--color-accent`                   | `oklch(97% 0 none)`          | `neutral-100`    |
| `--color-accent-hover`             | `oklch(87% 0 none)`          | `neutral-300`    |
| `--color-surface-error`            | `oklch(25.8% 0.092 26.042)`  | `red-950`        |
| `--color-surface-info`             | `oklch(28.2% 0.091 267.935)` | `blue-950`       |
| `--color-border-error`             | `oklch(39.6% 0.141 25.723)`  | `red-900`        |
| `--color-border-info`              | `oklch(37.9% 0.146 265.522)` | `blue-900`       |
| `--color-text-error`               | `oklch(80.8% 0.114 19.571)`  | `red-300`        |
| `--color-text-info`                | `oklch(80.9% 0.105 251.813)` | `blue-300`       |
| `--color-verdict-error-surface`    | `oklch(25.8% 0.092 26.042)`  | `red-950`        |
| `--color-verdict-error-text`       | `oklch(80.8% 0.114 19.571)`  | `red-300`        |
| `--color-verdict-warning-surface`  | `oklch(27.9% 0.077 45.635)`  | `amber-950`      |
| `--color-verdict-warning-text`     | `oklch(87.9% 0.169 91.605)`  | `amber-300`      |
| `--color-verdict-info-surface`     | `oklch(26.9% 0 none)`        | `neutral-800`    |
| `--color-verdict-info-text`        | `oklch(87% 0 none)`          | `neutral-300`    |
| `--color-status-running-surface`   | `oklch(27.9% 0.077 45.635)`  | `amber-950`      |
| `--color-status-running-text`      | `oklch(87.9% 0.169 91.605)`  | `amber-300`      |
| `--color-status-completed-surface` | `oklch(26.6% 0.065 152.934)` | `green-950`      |
| `--color-status-completed-text`    | `oklch(87.1% 0.15 154.449)`  | `green-300`      |
| `--color-status-failed-surface`    | `oklch(25.8% 0.092 26.042)`  | `red-950`        |
| `--color-status-failed-text`       | `oklch(80.8% 0.114 19.571)`  | `red-300`        |
| `--color-status-skipped-surface`   | `oklch(26.9% 0 none)`        | `neutral-800`    |
| `--color-status-skipped-text`      | `oklch(87% 0 none)`          | `neutral-300`    |

### Primitives

`product/src/ui/` holds 15 primitives — one module each:

`Badge` · `Button` (plus `buttonClass` and `secondaryButtonClass`) · `Card` (plus `Panel`) ·
`Dialog` · `EmptyState` · `Field` · `Input` (plus `inputClass`) · `Notice` · `Select` · `Skeleton` ·
`Switch` · `Table` (plus `Row`) · `Tabs` · `Textarea` · `Toolbar`.

Two support modules sit alongside them: `class-names.ts` exports `cx` (a tiny class-name joiner)
plus the shared `focusRing` and `tapTarget` class strings, and `index.ts` is the barrel that
re-exports the public surface. Every interactive primitive (`Button`, `Input`, `Select`,
`Textarea`, `Switch`, `Tabs` triggers) and every nav/menu link carries
`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent` and a
`min-h-11 min-w-11` (44 px) target — 44 px controls are the intended look, not a mobile-only
rule (D-027). `Badge`'s neutral tone is `bg-verdict-info-surface text-verdict-info-text`, a light
chip with dark text in both themes, not `bg-surface-muted`, which flips dark while its text does
not. `product/src/components.tsx` is a
re-export shim only — it keeps the nine names the existing screens import (`Badge`, `buttonClass`,
`Card`, `Field`, `inputClass`, `Notice`, `secondaryButtonClass`, `Loading`, `LoadFailed`) working
while every screen is migrated to `product/src/ui/` in Slice B. Nothing else lives there, and the
primitives themselves import no application code.

## Distribution (D-025)

**Guided deploy.** `npm run deploy:guided` (root script → `scripts/deploy-guided.mjs`) is the
first-run path for a new instance: it checks wrangler auth, finds or creates the `jury-forge` D1
database (writing its id into `product/wrangler.jsonc` only when it created it), generates and
sets `ENCRYPTION_KEY` and `SETUP_CODE` as Worker secrets (skipping whichever the instance already
has), applies the D1 migrations remotely, deploys the product, and prints the instance origin with
its `/setup` URL. `--dry-run` prints the plan and mutates nothing; the script never writes a secret
to disk and never runs from CI. Deployments remain manual and owner-driven (see
`docs/development.md`); the promo site is not part of it.

**Reviewer import/export.** `GET /api/reviewers/export` produces
`{ version: 1, exportedAt, reviewers: [...] }` — definitions only (name, instructions, rules,
flavor, base URL, model, params, enabled), never an API key or ciphertext. `POST
/api/reviewers/import` takes that document, validates it whole (version, bounds, at most 100
reviewers) and merges by case-insensitive name: existing reviewers are updated field by field while
keeping their stored key, new names are created without one, and the response reports
`{ created, updated, unchanged, skipped }`. Imports land in the activity trail, and the Reviewers
screen offers Export (download) and Import (file picker).

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
| GET              | `/api/reviewers/export`               | session   | reviewer definitions as JSON (D-025)              |
| POST             | `/api/reviewers/import`               | session   | merge an exported document (D-025)                |
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

Slice A adds a **second vitest project** for UI components. The workerd pool cannot render a
component — there were zero UI tests before this — so `product/vitest.ui.config.ts` runs
`happy-dom` with `@testing-library/react`, collecting `product/test-ui/**/*.test.tsx` (95 tests
across the theme helper, the primitives, the form controls, structure, the shell, and the eight
screens). The workerd project's
test glob is now restricted to `./test/**/*.test.ts`, so the two projects can never collect each
other's tests; `npm run test` runs `test:worker` then `test:ui`. Tests that need a `Storage` build
one (`product/test-ui/memory-storage.ts`) instead of reading the ambient `window.localStorage`,
which Node ≥26 defines as a disabled global that vitest's happy-dom environment then declines to
replace.

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
