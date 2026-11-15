# PoC code review

A deeper read of the implementation at `1cc22b7`, focused on **how the code is structured**, **which
technical decisions it encodes**, and **which defects only show up at the code level**. The
architecture view is in [`architecture.md`](architecture.md); this page is for someone who will
reuse the good patterns and avoid the bugs.

## 1. Reading map

```
product/worker/index.ts            Hono app, route mounting, error boundary
product/worker/middleware.ts       requireSession, sameOrigin
product/worker/routes/*.ts         HTTP adapters: parse → authorize → call lib → respond
product/worker/lib/*.ts            domain logic, D1 queries, crypto, providers, context, packs
product/worker/run-engine.ts       Durable Object state machine (the core)
shared/src/schemas/*.ts            zod contract source
shared/src/contracts.ts            z.infer types
shared/src/errors.ts               error code union + human messages
product/src/                      React SPA (pages, shell, ui, lib)
product/test/                     workerd tests
product/test-ui/                  happy-dom + Testing Library tests
```

Dependency direction is clean: routes depend on libs; libs depend on D1/WebCrypto/fetch; the run
engine depends on libs; shared schemas depend on nothing. There is no repository abstraction and no
service layer — lib functions take `D1Database` directly. That is a deliberate small-codebase
choice, not an accident.

## 2. The Worker boundary

- `index.ts` mounts every route under `/api/*`, exposes `RunEngine`, and has one `onError` that
  turns any thrown error into `internal_error` 500.
- `middleware.ts` has two guards: `requireSession` (reads the `jf_session` cookie, hashes it,
  looks up `sessions`) and `sameOrigin` (non-GET requests need `Sec-Fetch-Site: same-origin` or a
  matching `Origin`).
- Every dashboard-facing success body goes through `respond(schema, data)`
  (`worker/lib/respond.ts`); every error body goes through `errorResponse(code, status)`.
- `strict()` turns schema parsing on in test/dev and off only when `PROD === true`. The dashboard
  parses every response again with the same schema (`src/lib/api.ts`).
- There is no service/repository layer. A route often performs 2–6 sequential D1 queries. That is
  readable at this size, but it makes transactions and cross-cutting authorization checks easy to
  forget.

**Technical decision:** contract-first HTTP with a single error taxonomy. **Verdict:** keep. It is
the PoC's strongest engineering decision.

**Caveat:** production response validation is skipped for performance. A drift that the test suite
misses can reach the browser; the browser's parse then becomes the only guard.

## 3. The run engine in detail

`RunEngine` is a SQLite-backed Durable Object named by `{repoId}:{prNumber}:{headSha}:{deliveryId}`.
`start()` is kicked by the webhook or the try endpoint. `alarm()` executes exactly one step, resets
the attempt counter, persists the next step, and schedules the next alarm immediately (no delay
between successful steps).

### Step machine

```
config → files → scope → context → reference → knowledge → prepare → review → consolidate → post
```

- **config** loads the repository gate, supersession, reviewers, settings, previous findings, app
  token, and optional repo instructions.
- **files** pages `pulls.listFiles` (100/page, 300 cap) into `file:<n>` storage keys.
- **scope** filters reviewers by path globs; drops reviewers with no visible file; stores
  `visible:<id>` and `skippedReviewers`.
- **context** orders files (`prioritizedOrder`), processes 25 per segment, accumulates a
  `ReviewContext` in storage.
- **reference** lists each distinct context root once, matches candidates, fetches 8 files/segment.
- **knowledge** resolves grants to latest versions and applies `apply: paths`; stores metadata.
- **prepare** builds one prompt per reviewer (filtered context, reference block, knowledge block).
- **review** `Promise.allSettled` over all reviewers; 120 s provider timeout; parses JSON + usage.
- **consolidate** validates, enforces scope, selects inline comments, builds the summary.
- **post** one `pulls.createReview`, then best-effort minimization of older bot reviews.

### Storage key schema

| Key | Value |
| --- | ----- |
| `payload` | the run payload (kept after finish) |
| `step`, `attempt`, `cursor`, `refCursor`, `fileCount`, `fileOrder` | cursors/counters |
| `reviewers` | active reviewer rows (including scope) |
| `settings` | effective settings snapshot |
| `previousByReviewer`, `previousFindings` | last automatic run's findings |
| `token`, `pr`, `repoInstructions`, `botLogin` | run context |
| `file:<n>` | a `PullFileEntry` |
| `context` | the union `ReviewContext` |
| `visible:<id>`, `refPaths:<id>`, `ref:<path>` | per-reviewer scope/reference |
| `knowledgeResolved`, `knowledgeNotApplied`, `knowledgeBlock:<id>`, `knowledgeRecord:<id>` | packs |
| `prompt:<id>`, `outcome:<id>` | per-reviewer prompt and result |
| `plan`, `scopeRecords`, `skippedReviewers`, `changedFiles` | consolidation output |
| `finished` | terminal marker |

`finishRun` writes the D1 rows and then deletes every storage key except `payload` and `finished`.
The DO instance is never deleted.

### Retry semantics

- Any thrown error retries up to 3 times with 10 s / 60 s / 300 s backoff.
- A GitHub 4xx other than 429 is non-retryable.
- A reviewer failure is captured inside `stepReview` and does not throw; it does not retry the
  step and does not cancel other reviewers.
- A failed `post` retries the whole post step, including creating the review again.

### What the code gets right

- One step per segment, persisted cursor: a long review survives restarts.
- `start()` is idempotent for duplicate kicks (payload check).
- Retry/backoff is explicit and bounded.
- Batching respects the free-plan subrequest budget.
- The summary is assembled from structured outcomes, not raw model text.

### What the code gets wrong

See [`../analysis/flaws.md`](../analysis/flaws.md) F-001, F-002, F-006, F-007, F-008, F-009,
F-036, F-037, F-066, F-067, F-075. The most important code-level ones:

1. `start()` can persist the payload and then fail before `setAlarm`, leaving a run that never
   starts and cannot be recovered by a webhook retry (F-066).
2. `finishRun` sets `finished` before writing D1; a failed write leaves a permanent `running` row
   (F-001).
3. `stepPost` is not idempotent; a successful GitHub post followed by a failed `finishRun` posts a
   second review (F-002).
4. There is no generation check immediately before publish; a stale run can post after a newer one
   and minimize it (F-007).
5. Previous findings include findings from failed runs that never published (F-067).

## 4. Context and consolidation

`worker/lib/context.ts` is pure and testable:

- `buildReviewContext(files, previous, limits)` accumulates a context across batches, with
  `skipped`, `truncated`, `omitted` lists.
- `prioritizedOrder` weights added/modified source ahead of docs and renames.
- `buildRepoInstructionsBlock` / `buildReferenceContextBlock` share a budget algorithm: fill in
  order, truncate the file that crosses, name the rest.
- `buildReviewPrompt` lays out title, description, repo instructions, knowledge, file list,
  diffs, reference block, context notes, previous findings.
- `OUTPUT_CONTRACT` is a strict JSON instruction; `REFERENCE_FINDINGS_CONTRACT` is added only when
  reference context exists.

`worker/lib/consolidate.ts` is also pure:

- `parseReviewerOutput` extracts optional `summary` and validates findings with zod `.catch`
  fallbacks.
- `newFileLines` parses unified-diff hunk headers into commentable right-side lines.
- `consolidateReview` enforces scope, inline caps, and multi-line `startLine` validity.

**Technical decision:** pure functions for context/consolidation, tested outside the runtime.
**Verdict:** keep. It is why the test suite is meaningful.

**Code-level caveats:**

- Budgets are bytes (`TextEncoder`) and truncation can cut mid-hunk/mid-line. A truncated hunk can
  mislead the model more than an omitted file would.
- `buildReviewPrompt` puts the whole diff in a single user message with triple-backtick fences and
  does not escape fence sequences in the patch. A patch containing ```` ``` ```` can break the
  structure (part of F-003).
- `contextNotes` uses the default limits unless the caller passes settings; the run engine does
  pass them, but a future caller could get a note that quotes the wrong budget.

## 5. Scope and packs

### Scope (`worker/lib/scope.ts`)

- Custom glob compiler: `*` within a segment, `**` across, `?` one non-`/`, trailing `/` means the
  subtree; everything else escaped.
- `normalizePattern` rejects absolute paths, `.`/`..` segments, empty/over-long patterns.
- `parsePatternList` is tolerant at read time; `scopedFiles` applies include then exclude;
  `contextRoot` derives a literal root for tree fetching.
- **Decision:** enforce scope at consolidation, not only in the prompt. **Verdict:** keep; this is
  a key lesson (D-032).

### Packs (`worker/lib/pack-format.ts`, `packs.ts`)

- `analyzePack` is the single validator for preview and create; the browser's zip reader is not
  trusted.
- Root selection: `SKILL.md` anywhere, or a single root Markdown manifest with a `name` in
  frontmatter.
- `parsePackManifest` accepts unknown frontmatter keys; validates name/description/kind/apply/
  paths/never_quote/owner.
- `hashPackFiles` hashes sorted path + length + text with NUL separators; immutable versions.
- `buildKnowledgeBlock` includes every manifest in full, then docs most-specific-first under a
  byte budget; `never_quote` files are stored but withheld.
- Grants are resolved per reviewer, deduped at highest precedence, capped at 20 packs, path-scoped.
- **Decision:** manifest-first, immutable versions, provenance. **Verdict:** keep; this is the
  PoC's most differentiated feature.

### Code-level caveats

- Pack creation is not atomic: the `packs` row can be inserted before the version/files batch
  fails, leaving an empty pack (F-073).
- The pack upload route parses the full JSON before the aggregate size cap (F-068).
- The browser zip reader decompresses before enforcing the output cap (F-069).
- Byte budgets, not tokens, everywhere (F-010).
- `manifest_bytes` stores the rendered manifest block, while `total_bytes` stores raw manifest +
  docs; the names are easy to misread (a documentation/API-contract issue, not a crash).

## 6. Providers and encryption

### Providers (`worker/lib/providers.ts`)

- Two request builders: OpenAI `POST {baseUrl}/chat/completions` with bearer; Anthropic
  `POST {baseUrl}/v1/messages` with `x-api-key` and `anthropic-version`.
- `params` are spread into the body before the controlled fields, so `model`/`messages`/`system`
  cannot be overridden, but arbitrary other params are allowed.
- `extractJsonValue` tries raw, fenced, then the widest brace/bracket span.
- Usage normalization handles both envelopes; missing usage is `null`.
- 120 s `AbortSignal.timeout`; one `fetch`; no retry/backoff/rate-limit handling.

**Decision:** a thin adapter with tolerant JSON extraction. **Verdict:** keep the interface, but
replace the retry/structured-output/capability layer.

### Crypto (`worker/lib/crypto.ts`)

- AES-256-GCM with a 12-byte random IV; ciphertext `v2.<keyVersion>.<iv>.<ciphertext>`.
- Key ring current + optional previous; legacy `v1` readable.
- `constantTimeEqual` hashes both values with SHA-256 and compares bytes.
- Session tokens are 32 random bytes; stored as SHA-256; cookie `jf_session` HttpOnly, Secure,
  SameSite=Lax, 7 days.
- `private-key.ts` normalizes PKCS#1 RSA to PKCS#8 with a small DER writer.

**Decision:** versioned ciphertext + lazy rotation. **Verdict:** keep the idea, replace the single
env key with envelope encryption/KMS.

**Code-level caveats:** no associated data in AES-GCM (ciphertext is not bound to a row/tenant),
no per-tenant key, no secret redaction before logs, and the cookie is always `Secure`.

## 7. The dashboard

- `App.tsx` loads session + setup state once, then renders a route switch.
- `lib/router.ts` is a dependency-free path router with `navigate`, `subscribeRoute`,
  `handleAppLink`, and `registerNavigationBlocker`. The editor registers a blocker while dirty;
  `beforeunload` covers a real unload, `navigate`/`popstate` cover in-app moves.
- `lib/use-resource.ts` is an abortable, focus-revalidating data hook; `use-poll.ts` polls while a
  run is `running` and skips overlapping ticks.
- `lib/api.ts` parses every response with the shared schema; a 401 dispatches `jf:unauthorized`.
- `shell/` is the sidebar/topbar/slide-over, theme toggle, user menu, route guard.
- `ui/` is 16 primitives built on semantic tokens; `styles.css` has the `@theme` token layer and
  the dark overrides.
- `lib/zip.ts` is a dependency-free stored/deflate ZIP reader with CRC, path safety, and entry/
  total caps.
- `lib/pack-upload.ts` extracts a folder (`webkitdirectory`) or zip into normalized text files.

**Decision:** no UI framework/router library; small primitives; two test runtimes. **Verdict:**
keep the design system and hooks; a real router is reasonable as the app grows.

**Code-level caveats:** no CSP/security headers; no request timeout; UI copy hard-codes Cloudflare
and `wrangler` commands (fine for the PoC, wrong for the new product); the zip reader can be
memory-bombed.

## 8. Tests and tooling

- `product/test/**` runs inside workerd via `@cloudflare/vitest-plugin`; migrations are applied in
  `test/setup.ts`; MSW (`@msw/cloudflare`) mocks outbound HTTP.
- `product/test-ui/**` runs in happy-dom with Testing Library; `memory-storage.ts` avoids Node's
  ambient `localStorage` issue.
- `test/db.ts` resets every table between tests in FK-safe order.
- `test/fixtures.ts` generates an RSA key and converts PKCS#8 to PKCS#1 to exercise the normalizer.
- `scripts/measure-layout.mjs` is a CDP harness measuring overflow, tap targets, contrast, focus,
  and mobile nav across routes/widths/themes.
- `scripts/seed-dev.mjs` seeds local D1 only; `scripts/deploy-guided.mjs` is the Cloudflare
  first-run path; `scripts/release.mjs` bumps version/changelog.

**What the tests prove:** pure-function correctness, route wiring, contract drift, DO step
transitions, provider failure handling, crypto, and UI behavior.
**What they do not prove:** real GitHub/provider behavior, queue/lease failures, publish-then-crash,
zip bombs, prompt injection, multi-user authz, migrations on populated data, backups.

## 9. Technical decisions encoded in the code

| Decision | Where | Trade-off | Verdict |
| -------- | ----- | --------- | ------- |
| Hono for routing | `worker/index.ts` | Tiny, Workers-native, no framework weight | Keep |
| zod as the contract source | `shared/src/schemas` | Runtime cost; single source of truth | Keep |
| Parse responses on both sides | `respond.ts`, `api.ts` | Double validation; drift fails tests | Keep, but parse in prod or sample |
| Direct D1 in libs, no ORM | `worker/lib/*` | Simple, explicit SQL; no transaction abstraction | Adapt: add a repository/transaction layer |
| Durable Object per run | `run-engine.ts` | Durable, resumable; no queue/cancel/watchdog | Replace with queue + workers |
| Alarm segment per step | `run-engine.ts` | Fits 10 ms CPU; slow; no fairness | Replace; keep the step contract |
| Byte budgets | `context.ts`, `settings.ts` | Model-agnostic; no window/cost control | Replace with token/cost budgets |
| Pure context/consolidation | `context.ts`, `consolidate.ts` | Easy to test; strict JSON contract | Keep |
| Custom glob matcher | `scope.ts` | Small, predictable; no full glob spec | Keep |
| Client-side zip, server re-analysis | `zip.ts`, `pack-format.ts` | No binary parsing in Worker; double work | Keep the re-analysis; harden the zip |
| Immutable pack versions | `packs.ts`, `pack-format.ts` | Reproducible; latest-always only | Keep; add pinning |
| Grant precedence | `packs.ts` | Flexible; tie-break is partly arbitrary | Keep; make deterministic |
| API key reuse by ciphertext copy | `reviewers.ts` | No plaintext; exfiltration risk with arbitrary base URL | Reject as-is; bind to origin |
| Lazy key rotation | `reviewers.ts` | No bulk re-encrypt; manual | Keep with envelope encryption |
| Client-side templates | `shared/src/templates.ts` | No API/table; prefill only | Keep |
| No UI router dependency | `src/lib/router.ts` | Small; hand-rolled edge cases | Adapt |
| Two Vitest projects | `vitest*.config.ts` | Correct runtime per layer; more config | Keep if the stack needs it |
| MSW mocking | `test/network.ts` | Supported by the Workers plugin; no real network | Keep; add live conformance |
| Guided deploy mutates config | `scripts/deploy-guided.mjs` | One command; not reproducible | Replace with env/instance profile |

## 10. Code-level defects added to the register

The deep pass added F-066–F-077 to [`../analysis/flaws.md`](../analysis/flaws.md):

| ID | Defect | Severity |
| -- | ------ | -------- |
| F-066 | `start()` can persist a payload and never schedule an alarm | S1 |
| F-067 | Previous findings include failed runs that never published | S2 |
| F-068 | Pack upload is parsed before the aggregate size cap | S2 |
| F-069 | ZIP decompression can exceed the cap before checking | S2 |
| F-070 | Provider params can enable streaming and break `response.json()` | S2 |
| F-071 | Non-strict GitHub client loses status; setup errors become 500s | S3 |
| F-072 | Stored JSON is parsed unguarded on read paths | S3 |
| F-073 | Pack creation can leave an empty pack on partial failure | S2 |
| F-074 | Setup/claim state writes are not atomic | S2 |
| F-075 | Reviewer count and per-run fan-out are unbounded | S2 |
| F-076 | Webhook/API request bodies have no app-level size cap | S2 |
| F-077 | Reviewer list query fans out to N×M rows | S3 |

## 11. What to extract, what to rewrite

**Extract the ideas, not the code:**

- Contract-first schemas + one error taxonomy.
- Pure context/consolidation functions and their tests.
- The step contract (resolve/fetch/index/plan/review/ground/jury/publish) — reimplemented on a
  queue.
- Scope enforcement at output time.
- Pack analyzer/hashing/provenance.
- Settings spec pattern (typed parser, bounds, default, tolerant read).
- Readiness computed from the database.
- Try-run as a publish-free mode.
- Design tokens, primitives, accessibility harness.
- Seeded local state and the mutation-check discipline.

**Rewrite, do not port:**

- The Durable Object run engine and its storage-key protocol.
- The D1 schema and all queries (tenancy, versions, audit, budgets, steps).
- The prompt builder (token-aware, trust-labelled, escaped).
- The provider adapter (capabilities, structured output, retries, cost).
- The auth/roles model and credential handling.
- The setup wizard's Cloudflare copy and `wrangler` instructions.
- The zip reader (streaming caps) and the pack upload route (body limit).
- The publish path (idempotency, generation, limits).
