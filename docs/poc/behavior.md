# PoC behaviour

Studied at `1cc22b7`. This is the end-to-end behaviour the PoC shipped, including the edge cases
it documented.

## 1. Install and setup

The operator deploys the Worker to their Cloudflare account and opens `/setup`.

1. **Setup code.** `POST /api/setup/code` validates the deploy-time `SETUP_CODE` secret with a
   constant-time compare. It refuses once the instance is claimed (409) and reports a clear error
   when the secret is unset. On success it returns a GitHub App manifest form and sets a
   short-lived `jf_setup` cookie (HttpOnly, Secure, SameSite=Lax).
2. **Create the GitHub App.** The dashboard auto-submits GitHub's manifest form. GitHub creates a
   private app and redirects back to `GET /api/setup/manifest/callback`, which exchanges the code
   at `POST /app-manifests/{code}/conversions` and stores the app id, slug, private key, webhook
   secret, and client secret encrypted in D1.
3. **Install.** The wizard links to `https://github.com/apps/{slug}/installations/new`. The
   operator installs the app; GitHub returns to `/setup` because the manifest sets `setup_url`.
   "Verify" calls `GET /app/installations` with an app JWT and stores `installation_id`.
4. **Claim.** The first user who completes GitHub OAuth and whose token can see the installation
   becomes the owner (`owner_login`, `owner_id`, `owner_type`, `claimed_at`). Later sign-ins are
   ordinary logins.

Once claimed, setup endpoints return 409. There is no reset endpoint; resetting means a fresh
deploy or clearing D1.

**Known sharp edge:** `GET /app/installations` returns every installation of the app, and
`verify-installation` stores `installations[0]` without asking which one. On an account with
multiple installations, the stored id can be the wrong one.

## 2. Authentication and access

- OAuth starts at `GET /api/auth/github/start`, which stores a single-use state and redirects to
  GitHub. The callback validates and consumes the state, exchanges the code, fetches `GET /user`,
  and checks `GET /user/installations` for the instance's installation.
- The **access gate** ties dashboard access to installation access. GitHub's rules for private
  apps decide who may authorize at all; the gate covers the owner and members of the owning
  organization.
- Sessions are 32 random bytes, stored as SHA-256 in `sessions`; the cookie is `jf_session`
  (HttpOnly, Secure, SameSite=Lax, 7 days). Logout deletes the row.
- State-changing requests must be same-origin: the `sameOrigin` middleware accepts a request when
  `Sec-Fetch-Site: same-origin` or `Origin` equals the request origin. The session cookie is
  SameSite=Lax.
- Access is checked at sign-in only. A user who loses GitHub access keeps the session until it
  expires (up to seven days). The PoC deliberately does not store user tokens.

## 3. Webhook intake

`POST /api/webhooks/github` is public but returns 503 before setup.

1. Verify `x-hub-signature-256` over the raw body with the stored webhook secret; 401 on failure.
2. Accept only `pull_request` events with actions `opened`, `reopened`, `synchronize`, or
   `ready_for_review`. Draft PRs and everything else are acknowledged with 202 and dropped.
3. De-duplicate on `X-GitHub-Delivery` by inserting into `webhook_deliveries`; a conflict returns
   202. Rows older than seven days are pruned opportunistically.
4. Kick the Durable Object by run key. If the kick fails, the delivery row is deleted and the
   Worker returns 500 so GitHub's retry is meaningful. Otherwise 202.

The webhook handler does no GitHub API work.

## 4. Review lifecycle

The run is a state machine. The webhook passes the minimum: delivery id, repository id and full
name, PR number, head SHA, action, installation id, and mode.

### `config`

- **Automatic run:** the repository must exist and be enabled, else `skipped`. A run that begins
  after a newer run exists for the same PR finishes `skipped` (newest wins).
- **Manual run:** ignores the repository gate and supersession, and runs exactly the named
  reviewers. No named reviewer, or no enabled reviewer with a key, fails the run with
  `reviewer_unavailable`.
- Reviewers are opt-out: every enabled reviewer applies to every enabled repository unless a
  `reviewer_repositories` row disables the pair.
- Loads settings, the previous automatic run's findings per reviewer, the app key ring, the
  installation token, and optional `AGENTS.md` / `CONTRIBUTING.md` excerpts.

### `files`, `scope`, `context`

- Fetch changed files (cap 300) and persist them in DO storage.
- For automatic runs, apply each pair's include/exclude globs. A reviewer with patterns that keep
  no changed file is dropped; if every reviewer is dropped, the run is `skipped`.
- Build the union context in priority order within the byte budgets, recording skipped,
  truncated, and omitted files for the summary.

### `reference`

- For reviewers with `context_paths`, list each distinct literal root once, match candidates, and
  fetch files that are not already in the reviewer's diff, in batches of eight.
- The per-run file cap is shared fairly across reviewers with context paths.
- Failures never fail the run; they become summary notes.

### `knowledge`

- Resolve enabled grants (global, repository, reviewer) to each pack's newest version.
- Per reviewer: dedupe at highest precedence, cap at 20 packs, apply the pack's `apply: paths`
  globs against the reviewer's visible changed files, and store metadata only.

### `prepare`, `review`

- Per reviewer: fetch pack docs, build the manifest-first knowledge block under budget, build the
  filtered context and reference block, build system and user prompts.
- Fire all provider calls in parallel. A 120 s timeout per call. One failure does not cancel the
  others. Parse the strict-JSON output and token usage.

### `consolidate`

- Validate findings, enforce scope, choose inline comments from commentable diff lines, apply
  inline caps.
- Build one summary with per-reviewer attribution, counts, overflow findings, scope records,
  skipped reviewers, resolution buckets, and notes for truncation, caps, blocking, failed
  reviewers, reference limits, and out-of-scope findings.
- Choose `COMMENT` or, if blocking mode is on and the error threshold is met, `REQUEST_CHANGES`.

### `post`

- One `pulls.createReview` with `commit_id`, body, and inline comments.
- Then list the PR's reviews and minimize the app's previous ones best-effort (`OUTDATED`).
- Record `review_url`, status, and per-reviewer rows.

## 5. Review output

- One GitHub review per run.
- Inline comments only on changed right-side lines that exist in the diff.
- Multi-line comments when `startLine < line` and both are commentable.
- Everything else in the summary with `file:line`.
- Per-reviewer summary text when the model provided it.
- Token usage per reviewer when the provider reported it.
- Resolved / Still present / New buckets when a previous automatic run exists.
- Explicit notes for truncation, inline caps, failed reviewers, and scope.

## 6. Dashboard

Routes: `/setup`, `/reviewers`, `/reviewers/new`, `/reviewers/:id`, `/repositories`,
`/runs`, `/runs/:id`, `/packs`, `/packs/:id`, `/settings`, `/activity`, `/`.

The shell is a sidebar at `lg` and a top bar plus slide-over below, with a theme toggle and a
user menu. Every screen has loading, empty, error, and data states. Error copy is human, never a
machine code. The reviewer editor validates per field, has a sticky save bar, and guards unsaved
changes. Repositories expand reviewer toggles and scope fields inline, with a "Preview scope"
action. Runs list filters by status and repository; run detail groups findings per reviewer with
a severity filter and a scope record. Settings exposes the advanced numbers. Activity is a
filterable trail. Packs support folder/zip upload, immutable versions, and grants.

## 7. Manual try runs

`POST /api/runs/try` runs one or more named reviewers against an open PR and posts nothing. It
uses the same engine and step machine, skips the `post` step, records `mode = manual`, and shows
the run as manual in history. Closed or merged PRs answer 404, like a missing PR.

## 8. Knowledge packs

- A pack is a folder or zip with a manifest (`SKILL.md` or a root `.md` with frontmatter) and a
  `docs/` subtree. The browser extracts a folder or zip; the Worker re-analyzes the normalized
  upload.
- A version is SHA-256 over the normalized manifest and docs. `(pack_id, hash)` is unique; there
  is no update or delete path. A pack slug is stable; a renamed manifest with `packId` stays on
  the same pack.
- Grants are instance configuration, never read from a manifest. Scopes: global, repository,
  reviewer; precedence 0–1000; defaults 100 / 200 / 300.
- At run time: latest version, dedupe at highest precedence, cap 20 packs, apply path rules.
- Injection: manifest blocks and bodies are never truncated; docs are admitted whole until the
  total/file/per-file budgets are reached; dropped docs are named in run detail only.
  `never_quote` files are stored but never sent.
- Provenance: `run_reviewers.knowledge_json` and `runs.knowledge_json` record `slug@hash`,
  injected bytes, included/dropped/withheld files, and not-applied reasons.

## 9. Settings

Instance settings (D-021) are key/value rows with typed parsers and bounds. Defaults:

| Key                          | Default |
| ---------------------------- | ------- |
| `inlineCommentsPerReviewer`  | 10      |
| `inlineCommentsPerRun`       | 25      |
| `contextTotalBytes`          | 200,000 |
| `contextFileBytes`           | 32,000  |
| `descriptionLimit`           | 4,096   |
| `blockingMode`               | false   |
| `blockingErrorThreshold`     | 1       |
| `repoInstructions`           | false   |
| `repoInstructionsMaxBytes`   | 8,000   |
| `referenceContextFiles`      | 50      |
| `referenceContextFileBytes`  | 32,000  |
| `referenceContextTotalBytes` | 100,000 |
| `knowledgePackTotalBytes`    | 64,000  |
| `knowledgePackFileBytes`     | 32,000  |
| `knowledgePackFiles`         | 50      |

## 10. Activity and distribution

- Every state change worth explaining is recorded in `activity_log` through a best-effort
  `recordActivity`: sign-in/out, setting changes, reviewer create/update/delete, repository
  toggles, run starts, credential rotation, reviewer import. Reads prune entries older than 90
  days.
- `GET /api/reviewers/export` exports definitions without keys; `POST /api/reviewers/import`
  merges by case-insensitive name, keeping stored keys and reporting created/updated/unchanged/
  skipped.
- `npm run deploy:guided` checks wrangler auth, finds or creates the D1 database, sets
  `ENCRYPTION_KEY` and `SETUP_CODE`, applies migrations, deploys, and prints the `/setup` URL.
