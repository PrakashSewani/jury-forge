# PoC API surface

Studied at `1cc22b7`. Every dashboard-facing response is validated with a zod schema via
`respond(schema, data)`; every error body is `{ "error": "<code>" }` via `errorResponse`.

## Auth rules

| Rule                | Applies to                                                                 |
| ------------------- | -------------------------------------------------------------------------- |
| Public              | `/api/health`, `/api/setup/state`, `/api/setup/code`, setup callbacks, `/api/auth/github/start`, `/api/auth/github/callback`, `/api/webhooks/github` |
| Session             | Everything else under `/api/*`                                             |
| Setup cookie        | `POST /api/setup/verify-installation` (`jf_setup`, issued by setup code)    |
| Same-origin         | Every non-GET request (except webhook, which is signature-authenticated)    |
| Webhook signature   | `POST /api/webhooks/github` (`x-hub-signature-256`)                        |

## Endpoints

| Method           | Path                                      | Purpose                                                                 |
| ---------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| GET              | `/api/health`                             | Liveness; always `{ ok: true, name }`                                   |
| GET              | `/api/setup/state`                        | `{ claimed, appCreated, installed, appSlug }`                            |
| POST             | `/api/setup/code`                         | Validate `SETUP_CODE`; return manifest form and set setup cookie        |
| GET              | `/api/setup/manifest/callback`            | Exchange manifest code; store app credentials                            |
| POST             | `/api/setup/verify-installation`          | Find and store the installation                                          |
| GET              | `/api/auth/github/start`                  | OAuth redirect (login or claim)                                          |
| GET              | `/api/auth/github/callback`               | Token exchange, access gate, session/claim                               |
| GET              | `/api/auth/session`                       | Current user                                                             |
| POST             | `/api/auth/logout`                        | Delete session                                                           |
| GET/POST         | `/api/reviewers`                          | List / create                                                           |
| GET/PATCH/DELETE | `/api/reviewers/:id`                      | Read / update / delete                                                  |
| GET              | `/api/reviewers/export`                   | Reviewer definitions as JSON (no keys)                                  |
| POST             | `/api/reviewers/import`                   | Merge an exported document                                              |
| GET              | `/api/repositories`                       | List; `?refresh=1` syncs from GitHub; `?q=` filters                     |
| PATCH            | `/api/repositories/:repoId`               | Enable/disable                                                          |
| GET/PUT          | `/api/repositories/:repoId/reviewers`     | Per-repo reviewer enablement and scope                                  |
| POST             | `/api/repositories/:repoId/scope-preview` | Match patterns against the newest run's changed files                   |
| GET              | `/api/repositories/:repoId/pulls`         | Open PRs for the try picker                                             |
| GET              | `/api/instance/readiness`                 | Computed readiness, steps, and next step                                |
| GET              | `/api/runs`                               | History `{ runs, nextCursor }` (keyset)                                 |
| GET              | `/api/runs/:id`                           | Run detail `{ run, reviewers, skippedReviewers, changedFiles, knowledge }` |
| POST             | `/api/runs/try`                           | Manual try run; posts nothing                                           |
| GET/PATCH        | `/api/settings`                           | `{ settings, defaults }`                                                |
| GET              | `/api/activity`                           | Activity trail `{ activity, nextCursor }`                               |
| GET              | `/api/packs`                              | Pack summaries with latest version and grant count                      |
| POST             | `/api/packs/preview`                      | Validate an upload; return manifest, hash, docs, warnings, roots        |
| POST             | `/api/packs`                              | Create a pack or add an immutable version                               |
| GET              | `/api/packs/:id`                          | Pack detail: versions, grants, latest manifest/body/docs                |
| GET              | `/api/packs/:id/versions/:versionId`      | One version including doc texts                                         |
| PUT              | `/api/packs/:id/grants`                   | Replace all grants atomically                                           |
| POST             | `/api/webhooks/github`                    | GitHub deliveries                                                       |

## Contract discipline

- **One source:** `shared/src/schemas/*` (zod). Every type in `shared/src/contracts.ts` is
  `z.infer` of a schema; no hand-written interface duplicates a response shape.
- **Worker:** every dashboard response goes through `respond(schema, data)`; every error through
  `errorResponse(code, status)`. Parsing runs in dev and test and is skipped only in a production
  build, where a parse failure would throw.
- **Dashboard:** `request(schema, path)` parses every response; a mismatch becomes
  `ApiError(status, 'invalid_response')` and the screen shows its error state. No `as T`.
- **Error taxonomy:** `shared/src/errors.ts` holds `API_ERROR_CODES`, `ApiErrorCode`, the
  `{ error }` schema, and `message(code, fallback?)` for human copy. A screen never renders a
  machine code.
- **Routing:** dependency-free `routeFromPath` + `navigate()` / `subscribeRoute()` /
  `handleAppLink()`; `pushState` navigation and `popstate`; a navigation blocker for dirty forms.
- **Data fetching:** `useResource(schema, fetcher)` is abortable and revalidates on focus;
  `usePoll` keeps running runs live until a terminal status.

## Error codes

`invalid_request`, `not_found`, `encryption_key_unset`, `setup_required`,
`setup_session_required`, `already_claimed`, `kick_failed`, `invalid_state`, `invalid_code`,
`invalid_signature`, `missing_signature`, `internal_error`, `cross_origin`, `app_missing`,
`unauthorized`, `unknown_key`, `invalid_value`, `reviewer_unavailable`,
`provider_request_failed`, `access_denied`, `installation_required`, `invalid_response`,
`request_failed`, `setup_code_unset`.

## Validation notes

- Reviewer `name` ≤ 120, `instructions`/`rules` ≤ 20,000, `baseUrl` ≤ 2,000 and must parse as a
  URL, `model` ≤ 200, `apiKey` ≤ 4,000.
- Import documents are versioned (`version: 1`), capped at 100 reviewers, and strip unknown keys
  (so an `apiKey` in an import is ignored).
- Try runs accept 1–10 reviewer ids; the engine de-duplicates them.
- Pack uploads are re-analyzed server-side: manifest ≤ 32,000 bytes, doc ≤ 64,000, version
  ≤ 512,000 bytes / 100 docs, upload ≤ 1,000 files / 2,000,000 text bytes.
- Settings are per-key typed and bounded; unknown keys are rejected.
- Scope patterns are repository-relative, at most 20 per field and 200 characters each; invalid
  stored patterns degrade to "no scope" rather than breaking a run.

## API flaws to fix in the redesign

1. No API versioning (`/api/v1`) and no deprecation policy.
2. No pagination on repositories, reviewers, packs, or PR pickers beyond a single page cap.
3. No `If-Match`/ETag or optimistic concurrency for reviewer/repo/settings edits; last write wins.
4. No idempotency keys for mutating requests.
5. No rate limits, quotas, or per-token API access for automation.
6. No OpenAPI document generated from the schemas; clients are hand-written.
7. Error bodies carry only a code, no message, field errors, request id, or retry hint.
8. `GET /api/runs/:id` parses stored JSON without a guard; a corrupt row becomes a 500.
9. No webhook event log or replay endpoint; only delivery de-duplication.
10. No API for exporting the instance, deleting data, or managing retention.
