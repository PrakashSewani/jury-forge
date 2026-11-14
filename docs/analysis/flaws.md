# Flaw register

**Subject:** `PrakashSewani/jury-forge-poc` at `1cc22b7`.
**Method:** read the final source, migrations, docs, decisions, tests, and CI. Every finding cites
the file or decision that supports it. Severity is about the next product, not about blame: the
PoC was a one-month proof of concept and many of these are deliberate trade-offs.

## Severity rubric

| Level  | Meaning                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------- |
| **S1** | Can lose data, publish wrong output, leak secrets, or block the product thesis. Must be fixed before the first real release. |
| **S2** | Causes recurring operational pain, poor review quality, or an adoption barrier. Fix in the first two milestones. |
| **S3** | Friction, maintainability, or scale issue. Fix before the first stable release or when it bites. |
| **S4** | Cosmetic, documentation, or nice-to-have. Fix opportunistically.                                |

## Read this first: the ten that change the design

1. **A run can stay `running` forever** if the final D1 write fails after the DO marks itself
   finished, **or never start at all** if `start()` persists the payload and then fails before
   scheduling its alarm. No watchdog, no retry, no operator recovery. (F-001, F-066)
2. **A retry can double-publish** a review: the post step is not idempotent. (F-002)
3. **PR content is injected as instructions.** No trust boundary, no prompt-injection defense, no
   secret redaction before code leaves the perimeter. (F-003, F-005)
4. **Any session user can exfiltrate any stored model key** by copying it to a reviewer with an
   attacker-controlled base URL. (F-004)
5. **The review body can exceed GitHub's limits** and fail the run with a 422. (F-006)
6. **A stale in-flight run can post after a newer one**, and then minimize the newer review.
   (F-007)
7. **One Durable Object per run, never deleted**, plus retained payloads. The run model does not
   scale down cost or up concurrency. (F-008)
8. **There is no queue, no backpressure, and no cancellation.** Provider spend is unbounded.
   (F-009)
9. **Byte budgets are not token budgets.** A prompt can overflow a model window or waste most of
   it; there is no cost guard. (F-010)
10. **The setup wizard can store the wrong installation** (`installations[0]`) and has no recovery
    path. (F-011)

---

## A. Reliability and correctness

### F-001 — `finishRun` marks the run finished before the durable write

**Severity:** S1
**Evidence:** `product/worker/run-engine.ts`, `finishRun()`: `await this.ctx.storage.put('finished',
true)` runs before `this.env.DB.batch(statements)`. If the batch throws, the next `finishRun()`
returns immediately because `finished` is already true. The D1 row stays `running`.
**Impact:** a failed database write leaves an immortal `running` row. The dashboard polls forever;
the operator has no retry, cancel, or reconcile action. A `failed` run that should have been
recorded is silently lost.
**Instead:** write the durable record first (or in an idempotent, retryable outbox), then mark the
run finished. Add a heartbeat, a lease, and a janitor that reconciles stale runs. Expose
"reconcile" and "cancel" actions.

### F-002 — Publishing is not idempotent

**Severity:** S1
**Evidence:** `stepPost()` calls `createPullReview()` and then `finishRun()`. The step can be
retried up to three times. A successful GitHub post followed by a failed `finishRun` re-runs the
step and posts a second review.
**Impact:** duplicate reviews, duplicated inline comments, and a minimized/duplicated thread.
**Instead:** store an idempotency key before the call, record the created review id, and on retry
look it up before posting. Make the publish operation a two-phase record: `publishing` with the
key, then `published` with the id. Never repost when a matching review exists for the run.

### F-003 — Untrusted content is treated as instructions

**Severity:** S1
**Evidence:** `product/worker/lib/context.ts` `buildReviewPrompt()` embeds the PR title, body, and
patches verbatim. `buildSystemPrompt()` appends reviewer instructions and rules. Repository
instructions (`AGENTS.md`, `CONTRIBUTING.md`), reference files, and knowledge-pack docs are
embedded in the same user message. Diffs are wrapped in triple-backtick fences with no escaping.
**Impact:** a pull request can contain "ignore previous instructions", a fake system message, or a
fence breakout that makes the model follow attacker text. The reviewer can be made to hide a
vulnerability, invent a finding, or emit content the operator did not intend. This is the defining
security problem of an AI reviewer.
**Instead:** a trust-labelled prompt architecture. Untrusted content goes into clearly delimited,
escaped data blocks with a random nonce; the system prompt states that data is never instructions;
a separate policy layer decides what the model may do; output is validated and grounded before
publish. Add a prompt-injection test suite with known attacks.

### F-004 — A session can exfiltrate a stored model key

**Severity:** S1
**Evidence:** `POST/PATCH /api/reviewers` accepts `apiKeyFromReviewerId` and a `baseUrl` in the same
request. `apiKeyFromReviewerId` copies the source ciphertext verbatim. A run then decrypts the key
and sends it to the reviewer's `baseUrl` (`product/worker/lib/providers.ts`). Nothing binds a key
to an allowed host or prevents copying it to a new reviewer with an arbitrary URL.
**Impact:** any user who can reach the dashboard can create a reviewer that reuses another
reviewer's key and points its base URL at an attacker-controlled endpoint, trigger a run, and
receive the plaintext key in the `Authorization` header. The "write-only key" property is
cosmetic against a malicious or stolen session.
**Instead:** bind credentials to an allowed provider origin (or a configured egress allowlist),
require re-authentication for credential changes, separate "use key" from "choose destination",
and add a per-key audit trail. In a multi-user product, key access must be a scoped permission,
not an implicit owner right.

### F-005 — No secret or PII redaction before prompts leave the perimeter

**Severity:** S1
**Evidence:** the context builder sends raw patches (`context.ts`); there is no secret scan,
redaction, or warning. The only encryption is at rest for stored credentials.
**Impact:** a PR that accidentally contains a token, private key, customer record, or internal URL
sends it to a third-party model provider. The operator may not know. This is a privacy and
compliance blocker for teams.
**Instead:** redact or block known secret patterns, offer per-repository data policies, show a
pre-send summary ("N secrets redacted, M files withheld"), log the decision, and let the operator
choose a local model for sensitive repositories. Never silently send.

### F-006 — The review body has no size budget

**Severity:** S1
**Evidence:** `consolidateReview()` stores up to 50 findings per reviewer (`FINDING_CAPS.stored`),
each with a body up to 2,000 characters (`consolidate.ts` `findingSchema`). `stepConsolidate()`
writes every overflow finding's full body into the summary. With N reviewers, the body can exceed
GitHub's 65,536-character review body limit; the post fails with a 422 and the run fails.
**Impact:** a noisy PR — exactly the case where a review matters — fails to publish.
**Instead:** a publish budget with deterministic truncation, a per-finding body cap, a summary
limit, and a "full report" link (or an attached artefact). Test with the largest legal finding set.

### F-007 — Stale runs can publish after fresh runs

**Severity:** S1
**Evidence:** `stepConfig()` skips a run only if a newer run already exists when it starts. An
in-flight older run is not cancelled (D-018 explicitly accepts this). `stepPost()` posts with
`commit_id: payload.headSha`; then `minimizePreviousReviews()` minimizes every other review by the
bot, including a newer one that landed first.
**Impact:** a review for an old SHA can land after a review for the new SHA, and then minimize the
newer review. The PR ends up resting on stale advice.
**Instead:** per-PR sequencing or a generation check immediately before publish; cancel or
supersede in-flight runs; minimize only reviews older than the current run's generation; verify
the PR head still matches before posting.

### F-008 — Per-run Durable Objects are never deleted

**Severity:** S2
**Evidence:** `runIdFor()` names one DO per run. `finishRun()` deletes storage keys except
`payload` and `finished`; the DO instance itself is never removed. The payload remains durable.
**Impact:** every run leaves a named DO and a small payload forever. At scale this is a growing
namespace, cold-start and storage cost, and a privacy surface (the payload includes repo and PR
metadata). It is not a correctness bug, but it is an architectural dead end.
**Instead:** a queue with workers and leases; run state in Postgres; object storage for large
artefacts; a retention policy that deletes or archives completed run state. Do not encode a run
as a permanent named actor.

### F-009 — No queue, backpressure, or cancellation

**Severity:** S1
**Evidence:** the webhook kicks a DO directly; `stepReview()` fires all reviewers with
`Promise.allSettled`; there is no concurrency limit, no per-provider rate limit, no global worker
pool, and no cancel path. D-018 accepts that in-flight runs are not cancelled.
**Impact:** a burst of pushes fans out unbounded provider calls and spend; a provider 429 or
secondary limit hits many runs at once; a superseded run keeps burning tokens; an operator cannot
stop a runaway review.
**Instead:** a durable queue with fair scheduling, per-provider and per-installation concurrency
limits, run cancellation, a DLQ, and a cost budget per repository/instance.

### F-010 — Byte budgets stand in for token and cost budgets

**Severity:** S1
**Evidence:** `context.ts` uses `TextEncoder` byte lengths and `CONTEXT_LIMITS`; settings are
`contextTotalBytes`, `contextFileBytes`, `referenceContextTotalBytes`, and
`knowledgePackTotalBytes` (D-021). No model window, tokenizer, or price table exists.
**Impact:** the same prompt can fit one model and overflow another; a 200 KB prompt can be
enormously expensive; the operator has no pre-run estimate. It also makes truncation arbitrary
from the model's point of view.
**Instead:** a model registry with context windows, tokenizers, prices, and capabilities; a
token-aware context planner; a pre-run cost estimate; per-run and per-period budgets; explicit
degradation ("send less context" vs "fail").

### F-011 — Setup stores `installations[0]`

**Severity:** S2
**Evidence:** `product/worker/routes/setup.ts` `verify-installation` calls
`listAppInstallations()` and stores `installations[0]`. There is no selection UI and no filtering
by account.
**Impact:** an operator with a personal and an organization installation can store the wrong id.
The access gate then checks the wrong installation, and the owner may be locked out of their own
instance. There is no reset endpoint.
**Instead:** list installations and require an explicit choice; verify account identity; store all
installations or the selected one; provide a safe "change installation" flow.

### F-012 — No brute-force protection on the setup code

**Severity:** S2
**Evidence:** `POST /api/setup/code` compares the code with a constant-time compare but has no
rate limit, lockout, or attempt counter.
**Impact:** if `SETUP_CODE` is weak or reused, an attacker can brute-force the one gate between a
fresh deployment and a claimed instance.
**Instead:** rate limit by IP and instance, exponential backoff, a short expiry, a one-time
bootstrap token with an explicit recovery path, and an alert on repeated failures.

### F-013 — The session cookie is always `Secure`

**Severity:** S2
**Evidence:** `product/worker/lib/sessions.ts` hard-codes `Secure` in `sessionCookie()` and the
setup cookie. A self-hosted instance on plain HTTP or a LAN IP cannot set the cookie.
**Impact:** login silently fails in the deployment mode many self-hosters use.
**Instead:** derive cookie security from a configured external URL / trusted proxy, default to
secure, and document the TLS requirement. Never silently downgrade.

### F-014 — Origin checks assume the Worker sees the public origin

**Severity:** S2
**Evidence:** `middleware.ts` `sameOrigin()` compares `Origin` with `new URL(c.req.url).origin`.
Behind a reverse proxy that does not preserve the public host/proto, the comparison can reject
legitimate requests or accept the wrong origin.
**Impact:** self-hosted deployments behind Nginx/Traefik/Caddy need proxy-specific configuration;
a misconfiguration is a CSRF or a broken app.
**Instead:** a configured `PUBLIC_URL` / trusted-proxy policy; validate `X-Forwarded-Host` and
`X-Forwarded-Proto` only from trusted proxies; add a CSRF token for state-changing forms as
defense in depth.

### F-015 — Access is checked only at sign-in

**Severity:** S2
**Evidence:** D-024 and `routes/auth.ts`: the installation-access gate runs in the OAuth callback.
Sessions last seven days and are not re-checked or revocable.
**Impact:** a removed collaborator keeps full access for up to a week. There is no "sign out
everywhere", no session list, and no revocation on installation changes.
**Instead:** re-check access on sensitive actions, support revocation and session listing, and
offer an optional shorter TTL. In multi-user mode, membership changes must invalidate sessions.

### F-016 — The 300-file cap is silent

**Severity:** S2
**Evidence:** `run-engine.ts` caps `FILES_CAP = 300`. Files beyond the cap are never fetched and
are not added to `context.skipped`, `truncated`, or `omitted`.
**Impact:** a large PR is reviewed on a subset with no indication that the rest was ignored. The
review can claim "no issues" while half the change was never seen.
**Instead:** record every dropped file with a reason and surface a hard "partial review" banner.
Make the cap configurable and estimate the cost of raising it.

### F-017 — No provider retry/backoff or rate-limit handling

**Severity:** S2
**Evidence:** `providers.ts` calls `fetch` once with a 120 s timeout. A 429, 500, 502, or 503 fails
that reviewer immediately; `Promise.allSettled` turns it into a failed reviewer.
**Impact:** transient provider errors lose a reviewer from the jury, and the summary notes a
failure that a retry would have fixed.
**Instead:** classify provider errors, honour `Retry-After`, retry with jitter, support per-provider
circuit breakers, and only fail a reviewer after the retry budget is exhausted.

### F-018 — Output parsing has no repair path

**Severity:** S2
**Evidence:** `providers.ts` `extractJsonValue()` tries the whole text, a fenced block, and a brace
span; `consolidate.ts` validates findings and drops invalid ones. If no JSON value is found, the
reviewer fails.
**Impact:** a model that adds a sentence before the JSON, truncates at `max_tokens`, or uses a
slightly different schema loses the whole review. There is no "fix your JSON" retry.
**Instead:** prefer provider-native structured output / JSON schema / tool calls; on a parse
failure, run one repair turn with the raw output and the schema; validate against the schema; only
then fail. Keep the raw output for diagnosis.

### F-019 — GitHub publishing limits are not modelled

**Severity:** S2
**Evidence:** `createPullReview()` sends all selected comments in one request. GitHub limits review
body length, comment count, and line validity. The code checks line commentability but not body or
count limits beyond the inline caps.
**Impact:** large reviews fail at the last step, after all provider spend.
**Instead:** a publish planner that chunks comments, enforces body/comment limits, falls back to a
summary-only review, and validates the payload before the call.

### F-020 — Findings are not grounded or verified

**Severity:** S1
**Evidence:** the only grounding is `consolidateReview()` checking that `line` exists in the diff's
right side (`newFileLines`). It does not check that the line content matches the finding, that the
file still exists at the head SHA, or that the claim is true. There is no second-pass verifier.
**Impact:** hallucinated findings, misread code, and confident but wrong advice. The reviewer can
point at a valid line and describe code that is not there.
**Instead:** a grounding step: fetch the exact file slice, include it in a verification prompt,
require the model to quote the evidence, and drop findings that cannot be grounded. Add a
second-opinion reviewer and a confidence threshold before publish.

### F-021 — No cross-reviewer de-duplication or disagreement handling

**Severity:** S2
**Evidence:** consolidation concatenates per-reviewer findings; the same issue from Security and
Architecture becomes two comments. Contradictory advice is published as-is.
**Impact:** noisy, repetitive reviews and an incoherent verdict. The "jury" is N independent
reviewers, not a deliberating jury.
**Instead:** cluster findings by semantic similarity, merge duplicates with attribution, surface
disagreements explicitly, and let a chair/consensus step decide the verdict.

### F-022 — Resolution tracking is brittle

**Severity:** S2
**Evidence:** `resolution.ts` `findingKey()` is `file::line::lowercased title`. Any wording change,
line shift, or reordering produces a false "resolved" plus a false "new".
**Impact:** the Resolved / Still present / New buckets mislead the operator and undermine trust.
**Instead:** stable finding fingerprints from a normalized issue signature, plus a semantic match
for reworded findings; track a finding id across runs and let the verifier confirm resolution.

### F-023 — Every run reviews the cumulative diff

**Severity:** S2
**Evidence:** `stepConfig()` loads the newest earlier run for context, but the context builder
always fetches the PR's full diff against the base. There is no "changes since the last reviewed
SHA" mode.
**Impact:** repeated findings, repeated cost, and a review that re-litigates already-discussed
lines.
**Instead:** support incremental review by default (diff since last reviewed SHA) with a full
review on demand, and use the previous findings as an explicit baseline.

### F-024 — Knowledge packs are latest-always and browser-only

**Severity:** S2
**Evidence:** D-034: grants resolve to the newest version; upload happens through the dashboard's
folder/zip reader and normalized JSON POST. There is no pinning, signing, or API ingestion, and the
budget is bytes, not tokens.
**Impact:** a pack update silently changes every future run; there is no reproducible "review with
pack version X"; CI cannot upload packs; a compromised pack has no provenance.
**Instead:** allow pinned versions and a "latest" channel, sign packs, expose an authenticated
upload API, store a content hash in every run, and budget in tokens.

### F-025 — Run history does not snapshot the reviewer

**Severity:** S2
**Evidence:** `RunReviewerOutcome` exposes `reviewerId`; `run_reviewers` stores no reviewer name,
model, instructions hash, or prompt hash. `finishRun()` writes only the id and outcomes.
**Impact:** rename or delete a reviewer and the run history is no longer self-explanatory. You
cannot reproduce why a finding was produced or compare prompt versions.
**Instead:** snapshot `name`, `model`, `provider`, `instructions_hash`, `rules_hash`, `prompt_hash`,
and pack hashes per run. Keep the snapshot even if the reviewer is deleted.

### F-026 — No retention, export, or delete for code-bearing data

**Severity:** S2
**Evidence:** runs and findings are kept forever; the only export is reviewer definitions. No
delete-instance flow. `activity_log` is pruned at 90 days but runs are not.
**Impact:** a self-hoster cannot satisfy a deletion request, reduce storage, or migrate an
instance. Code snippets in findings and summaries accumulate indefinitely.
**Instead:** a retention policy per data class, an instance export/import, a hard-delete flow with
confirmation, and configurable redaction/retention for findings.

### F-027 — The activity log is not an audit log

**Severity:** S3
**Evidence:** `recordActivity()` is best-effort and swallows failures; entries are pruned at 90
days; there is no immutable store, signature, or export.
**Impact:** "who changed the security reviewer's prompt?" may have no answer. Not suitable for
compliance.
**Instead:** an append-only audit stream with durable storage, export, retention policy, and
tamper evidence. Keep the best-effort trail separate from the audit log if necessary.

---

## B. Security and privacy

### F-028 — SSRF through the reviewer base URL

**Severity:** S1 (multi-user) / S2 (single-operator)
**Evidence:** `reviewerCreate`/`reviewerUpdate` accept any parseable URL up to 2,000 characters;
`providers.ts` fetches it directly and sends the API key.
**Impact:** a session can make the server call internal metadata endpoints, localhost admin
panels, or a private network service, and can leak the key to an arbitrary host. In a self-hosted
network this is a direct path to cloud metadata and internal APIs.
**Instead:** an egress policy: allow only HTTPS, resolve and block private/link-local/loopback
ranges, optionally require an allowlisted host, use a dedicated egress proxy, and never send a
credential to a host the key is not bound to.

### F-029 — No role model

**Severity:** S1 for teams
**Evidence:** `requireSession()` returns a user; every session can create/update/delete reviewers,
read run history, change settings, import/export, and trigger runs. There are no roles, teams, or
resource scopes.
**Impact:** "self-hosted for a team" is not safe: a viewer can read all findings and change
security prompts; a contractor can copy a key (F-004). It is effectively a single-operator app.
**Instead:** roles (`owner`, `admin`, `maintainer`, `viewer`, `auditor`), per-repository scopes,
explicit membership, and an authorization matrix with tests.

### F-030 — Fork pull requests have no policy

**Severity:** S2
**Evidence:** the webhook accepts any `pull_request` event and the app has `contents: read` +
`pull_requests: write`. There is no fork check, no first-time-contributor approval, and no
"untrusted PR" mode.
**Impact:** an attacker can open a fork PR with a prompt injection payload and trigger an expensive
or manipulated review; the bot's write token can comment on the base repo.
**Instead:** configurable fork policy (skip, review with a restricted prompt, require approval),
least-privilege tokens per action, and a clear trust label in the prompt.

### F-031 — No security headers / CSP

**Severity:** S3
**Evidence:** the dashboard is served by the Worker's static assets; there is no CSP, HSTS,
`X-Content-Type-Options`, or frame policy in the Worker or the HTML shell.
**Impact:** weaker defense in depth against XSS and clickjacking.
**Instead:** strict CSP with nonces, HSTS, frame-ancestors, and a security-headers middleware.

### F-032 — No rate limits or quotas on the dashboard API

**Severity:** S2
**Evidence:** every `/api/*` route is session-guarded but otherwise uncapped. `POST /api/runs/try`
can be called repeatedly; there is no per-user or per-instance limit.
**Impact:** a compromised session or a script can burn provider spend and fill the database.
**Instead:** per-route rate limits, per-instance budgets, a run quota, and an abuse alert.

### F-033 — Provider response handling is unbounded

**Severity:** S3
**Evidence:** `providers.ts` calls `response.json()` without a size limit or content-type check;
the parsed output is then validated. A malicious or broken gateway can return a huge body.
**Impact:** memory pressure and a stalled worker.
**Instead:** cap response bytes, require JSON content type, stream with a limit, and fail closed.

### F-034 — Secrets can appear in logs and error messages

**Severity:** S3
**Evidence:** `console.error()` is used in several failure paths; `errorMessage()` slices errors to
500 characters. Provider errors are reduced to a status, but a URL or a database error could carry
sensitive fragments.
**Impact:** log-based secret leakage.
**Instead:** a redacting logger, structured error objects with safe fields, and a test that scans
logs for known secret patterns.

### F-035 — The encryption key is a single environment secret

**Severity:** S2
**Evidence:** `crypto.ts` loads a key ring from environment variables. There is no KMS, envelope
encryption, per-tenant key, or hardware-backed key.
**Impact:** a process compromise or a leaked env var decrypts every stored credential. Rotation is
manual and GitHub App credentials require re-registration.
**Instead:** envelope encryption with a KMS/HSM or a local key file with strict permissions;
per-installation data keys; rotation without re-registering the app; a documented recovery path.

---

## C. Scalability and operations

### F-036 — No run heartbeat or watchdog

**Severity:** S1
**Evidence:** the run engine has no `heartbeat_at`, `lease`, or `attempt` in D1; the DO is the only
actor. A lost alarm, an evicted object, or a failed final write leaves no external signal.
**Impact:** silent stalls; the operator sees a permanently "running" row.
**Instead:** a lease with a heartbeat, a janitor that expires leases, an idempotent step log in
Postgres, and an alert on stale runs.

### F-037 — No dead-letter queue or operator recovery

**Severity:** S2
**Evidence:** a run that exhausts retries is marked `failed`; there is no requeue, no replay, no
manual step, and no incident view.
**Impact:** transient failures become lost reviews with no recovery except a new push.
**Instead:** a DLQ, a retry/replay action, a run timeline with step attempts, and an operator
runbook.

### F-038 — One deployment = one instance = one installation

**Severity:** S2
**Evidence:** D-004/D-005 and the single `github_app` row. Multiple installations are not modelled.
**Impact:** an agency or a platform team needs one deployment per org; there is no shared
dashboard, no cross-org view, no central billing.
**Instead:** a tenant model with multiple installations per instance (while keeping single-tenant
deployment possible), or a clear "one instance per org" product decision with export/import.
 
### F-039 — No backup, restore, or migration rollback

**Severity:** S2
**Evidence:** D1 migrations are forward-only; the deploy applies them before the Worker. There is
no backup job, restore drill, or down migration.
**Impact:** a bad migration or a lost database is unrecoverable by the operator; upgrades are
one-way.
**Instead:** pre-migration backups, tested restore, expand/contract migrations, a migration lock,
and a documented rollback for code and data.

### F-040 — Health is not health

**Severity:** S3
**Evidence:** `GET /api/health` always returns `{ ok: true }`. It does not check D1, the DO
namespace, the GitHub App, or provider reachability.
**Impact:** an orchestrator cannot tell a healthy instance from a broken one.
**Instead:** liveness vs readiness, dependency checks, a degraded state, and a diagnostics
endpoint.

### F-041 — No observability

**Severity:** S2
**Evidence:** there are no metrics, traces, request ids, structured logs, or cost dashboards.
`console.error` is the only signal.
**Impact:** debugging a bad review or a slow run is guesswork.
**Instead:** OpenTelemetry traces per run/step/provider call, Prometheus metrics, structured logs
with request/run ids, cost and latency dashboards, and alerts.

### F-042 — Local development needs a public tunnel

**Severity:** S3
**Evidence:** the setup flow requires GitHub to reach the instance's webhook and OAuth callback;
the docs recommend a tunnel such as `cloudflared` for local wizard testing.
**Impact:** contributors cannot exercise the real setup flow locally without a tunnel and a
GitHub app round trip.
**Instead:** a local mode with a signed webhook replay tool, a fixture GitHub server, and a
one-command demo that does not require a public URL.

### F-043 — The deployment is not reproducible from the repository alone

**Severity:** S3
**Evidence:** `wrangler.jsonc` contains the owner's custom domain and D1 database id. A second
instance must edit committed files.
**Impact:** "deploy your own" is a fork-and-edit flow, not an install.
**Instead:** configuration through environment/instance profile, no committed account ids, and a
generated deployment manifest.

---

## D. AI review quality

### F-044 — No codebase index or semantic retrieval

**Severity:** S1 (quality)
**Evidence:** context is the diff plus literal `context_paths`; there is no embedding index, symbol
graph, dependency graph, or relevance ranking.
**Impact:** the reviewer cannot see the callers, types, tests, or configuration that determine
whether a change is correct. It reviews a patch in isolation.
**Instead:** a repository index (symbols, references, tests, configs), semantic retrieval, and a
context planner that selects the most relevant files within a token budget.

### F-045 — No test-impact or dependency analysis

**Severity:** S2
**Evidence:** the context builder only orders by status/doc weight; it does not map changed files
to tests, dependents, or ownership.
**Impact:** "missing tests" and "this breaks callers" findings are guesses.
**Instead:** dependency and test mapping, owner/CODEOWNERS awareness, and a "what else should I
read?" retrieval step.

### F-046 — Reviewers are independent prompts, not a jury

**Severity:** S2
**Evidence:** `stepReview()` is `Promise.allSettled` over independent calls; consolidation only
merges text. There is no deliberation, voting, critique, or chair.
**Impact:** the name "jury" promises more than the product delivers; findings lack confidence and
disagreement.
**Instead:** a staged jury: independent findings → cross-review → consensus/chair → verified
verdict. Make disagreement a first-class output.

### F-047 — No evaluation harness or quality metric

**Severity:** S1 (quality)
**Evidence:** tests assert wiring and pure functions; there is no golden set of PRs with known
issues, no precision/recall, no acceptance or false-positive measurement.
**Impact:** prompt changes are unmeasurable; "better" is a vibe. The product cannot improve
systematically.
**Instead:** a benchmark of labelled PRs, per-reviewer and per-rule precision/recall, false
positive rate, operator acceptance/dismissal, time-to-first-finding, and cost per review. Gate
prompt changes on it.

### F-048 — No feedback loop

**Severity:** S2
**Evidence:** the UI has no "this finding is wrong / fixed / helpful" action; the activity log does
not capture feedback.
**Impact:** the product cannot learn which reviewers or rules are trusted.
**Instead:** per-finding feedback, dismissal reasons, reviewer scorecards, and a tuning loop that
feeds back into prompts and evaluation.

### F-049 — No suggested fixes

**Severity:** S2
**Evidence:** findings are title + body only; there is no patch/suggestion block.
**Impact:** the operator must translate advice into code; the review is less actionable than a
human review with suggestions.
**Instead:** optional, validated suggestion blocks with a diff preview and an explicit "apply"
path, never auto-merged.

### F-050 — No review preview or edit before publish

**Severity:** S2
**Evidence:** the run posts automatically at `post`; the dashboard can only inspect afterwards.
**Impact:** hallucinations, tone problems, and duplicate comments go straight to the PR.
**Instead:** a policy: auto-publish for trusted rules, review-before-publish for new/changed
prompts, with an edit and approve step.

### F-051 — No suppression / known-false-positive rules

**Severity:** S2
**Evidence:** every finding is published; there is no ignore list, inline suppression, or
per-repo rule config.
**Impact:** recurring noise erodes trust; teams disable the bot.
**Instead:** suppression rules by pattern, path, rule id, and finding fingerprint; a visible
reason; an audit trail.

### F-052 — Knowledge packs are injected wholesale

**Severity:** S2
**Evidence:** D-034 admits docs whole until a byte budget, most-specific first. There is no
relevance retrieval within a pack.
**Impact:** a large pack wastes the budget on irrelevant docs; the important section may be
dropped.
**Instead:** chunk and index pack docs, retrieve by relevance to the diff, and cite the sections
used in run provenance.

### F-053 — Provider adapters are minimal

**Severity:** S2
**Evidence:** `providers.ts` supports `POST /chat/completions` and `POST /v1/messages` only. No
streaming, tools, JSON schema, vision, Azure-style headers, custom headers, proxies, or local
server quirks. `params_json` is merged unvalidated.
**Impact:** many providers/gateways need workarounds; structured output is best-effort; cost and
latency controls are absent.
**Instead:** a provider capability registry and adapter interface (chat, structured output, tools,
streaming, embeddings, usage, health), conformance tests, and a plugin path.

### F-054 — Prompt/version management is absent

**Severity:** S2
**Evidence:** reviewers are mutable rows; there is no draft, version, diff, rollback, or approval
for prompt changes. Run history does not record a prompt hash.
**Impact:** a prompt edit silently changes every future review; you cannot compare before/after.
**Instead:** reviewer versions (draft → active), prompt diffs, approval, rollback, and a prompt
hash in every run.

---

## E. Product and UX gaps

### F-055 — No diff view or finding navigation

**Severity:** S2
**Evidence:** run detail groups findings by reviewer/file; inline comments link to GitHub. There
is no in-app diff with finding anchors or a side-by-side view.
**Impact:** triage is slow; the operator leaves the product to understand a finding.
**Instead:** a diff viewer with finding anchors, filters, keyboard navigation, and bulk actions.

### F-056 — No policy engine

**Severity:** S2
**Evidence:** blocking mode is a single instance-wide boolean + threshold. Inline caps and budgets
are instance-wide. There is no per-repository or per-branch policy.
**Impact:** a monorepo and a docs repo cannot have different review standards; a security-critical
repo cannot be stricter.
**Instead:** a policy model (per repo/branch/path/reviewer) with severity thresholds, publish
mode, budgets, and required reviewers.

### F-057 — No CI/forge integration beyond review comments

**Severity:** S2
**Evidence:** only `pulls.createReview` and comment minimization. No GitHub Checks API, SARIF,
status checks, labels, assignees, or issue creation.
**Impact:** the review cannot gate a merge, feed a security dashboard, or route work.
**Instead:** check runs with annotations, SARIF export, configurable status conclusions, labels,
and integrations.

### F-058 — No notifications or digests

**Severity:** S3
**Evidence:** the only output is the GitHub review and the dashboard.
**Impact:** operators miss failed runs, budget overruns, or a reviewer that stopped working.
**Instead:** email/Slack/webhook notifications, a weekly digest, and alert policies.

### F-059 — No multi-forge support

**Severity:** S3 (deferred)
**Evidence:** GitHub-only; `github.ts` hard-codes `api.github.com` and GitHub App auth. No GHES
base URL.
**Impact:** excludes GitLab, Gitea, Bitbucket, and GitHub Enterprise Server users.
**Instead:** a forge adapter interface from day one (webhook normalize, auth, fetch diff, publish),
GitHub first, GHES base URL, then GitLab/Gitea.

### F-060 — Bundle size and dependency surface

**Severity:** S3
**Evidence:** the client bundle is about 763 kB (218 kB gzip); chunks are not split; the product
depends on a monolithic `radix-ui` package plus cmdk, sonner, lucide-react, and a full `octokit`
package that is not imported anywhere in the product (grep found no `from 'octokit'`).
**Impact:** slow first load, a larger supply-chain surface, and dead weight.
**Instead:** route-level code splitting, per-primitive Radix imports, remove unused dependencies,
and a bundle-size budget in CI.

### F-061 — No i18n / RTL / accessibility beyond the harness

**Severity:** S4
**Evidence:** English copy is hard-coded; no locale or direction support. The layout harness checks
contrast, targets, focus, and overflow, but not screen-reader flows.
**Impact:** limits reach and inclusive access.
**Instead:** a message catalog, RTL support, and an assistive-technology test pass for critical
flows.

---

## F. Process and documentation

### F-062 — Documentation drift

**Severity:** S3
**Evidence:** D-030 retired `main` and the release workflow, but `docs/architecture.md` still
describes `.github/workflows/release.yml` and a `dev` → `main` release flow; `docs/development.md`
still instructs creating release PRs to `main`. The workflow file does not exist.
**Impact:** a new contributor follows stale instructions; trust in the docs erodes.
**Instead:** a docs consistency check (links, referenced files, decision references) in CI and a
release checklist that reconciles the architecture/development docs.

### F-063 — The decision log has no revisit mechanism

**Severity:** S3
**Evidence:** 34 append-only decisions; no revisit triggers, no stale markers, no periodic review.
**Impact:** superseded decisions stay authoritative by inertia; contradictions accumulate.
**Instead:** status, revisit trigger, linked tests, and a quarterly review; mark stale ADRs.

### F-064 — Manual-only deployment verification

**Severity:** S3
**Evidence:** the status file records local checks and a live instance, but the first real review
had not run; deploy docs say remote deploy steps were not exercised at one point. The guided
script is dry-run tested, not executed against a real account in CI.
**Impact:** the riskiest path (real GitHub app, real webhook, real provider) is the least tested.
**Instead:** a disposable end-to-end environment, a smoke test after deploy, and a canary repo.

### F-065 — No contributor or security policy

**Severity:** S3
**Evidence:** no `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue templates, or
vulnerability disclosure process in the PoC.
**Impact:** unclear how to report a vulnerability or contribute safely.
**Instead:** add them before public launch; a `SECURITY.md` with a private channel is mandatory for
a security-adjacent product.

---

## G. Code-level defects (deep pass)

These came from reading the implementation line by line after the architecture-level review. They
are specific to the PoC's code and are the easiest to miss from docs alone.

### F-066 — `start()` can persist a run and never schedule its alarm

**Severity:** S1
**Evidence:** `product/worker/run-engine.ts` `start()`: it returns early if `payload` exists, then
writes `payload`, `step`, and `attempt`, then runs the D1 `INSERT` for the `runs` row, and only then
calls `setAlarm(Date.now())`. If the D1 insert throws, the webhook deletes the delivery row and
returns 500; GitHub retries; the retry sees the stored payload and returns early without ever
scheduling an alarm.
**Impact:** a transient D1 error can leave a run that never executes and has no row (or a row with
no alarm). The webhook retry path makes it permanent.
**Instead:** persist the start intent in D1/outbox first, then always ensure an alarm on retry (or
make `start()` idempotent by checking an alarm/step marker and rescheduling). Reconcile orphaned
runs with a janitor.

### F-067 — Previous findings include failed runs that never published

**Severity:** S2
**Evidence:** `run-engine.ts` `stepConfig()` loads previous findings with
`r.status IN ('completed', 'failed')` and `rr.findings_json != '[]'`, but does not require the run
to have published (`review_url` is not checked). A run can finish `failed` after some reviewers
produced findings but the post failed.
**Impact:** findings that never appeared on the pull request become "previously reported" in the
next prompt and in the Resolved / Still present / New buckets. The reviewer can suppress a real
issue or declare it resolved when it was never published.
**Instead:** only treat published findings as previous; store a `published_at`/publication id per
run or per finding, and keep unpublished findings in a separate diagnostic bucket.

### F-068 — Pack upload is parsed before the aggregate size cap

**Severity:** S2
**Evidence:** `product/worker/routes/packs.ts` calls `await c.req.json()` and only then
`analyzePack()`, which enforces the 2,000,000-byte total. `PackPreviewRequestSchema` caps each
file's `text` at 1,000,000 and the array at 1,000, but there is no aggregate request cap.
**Impact:** a direct API caller can make the Worker parse a very large JSON body before any cap
applies, consuming memory/CPU. The browser UI caps itself, but the API is the boundary.
**Instead:** a body-size middleware that enforces `Content-Length`/streamed limits per route
before JSON parsing, plus an aggregate cap in the schema.

### F-069 — ZIP decompression can exceed the cap before checking

**Severity:** S2
**Evidence:** `product/src/lib/zip.ts` `readZipBytes()` checks the central directory's
`uncompressedSize`, but calls `inflateRaw()` and only after full decompression checks
`bytes.byteLength > MAX_ENTRY_BYTES` and the total. A forged central directory or a high-ratio
deflate can expand far beyond the cap first.
**Impact:** a malicious pack zip can freeze or crash the operator's browser. The server re-validates
the normalized text, but the browser is already the victim.
**Instead:** stream decompression with a hard output cap (abort as soon as the cap is exceeded),
reject suspicious compression ratios, cap the total compressed and uncompressed sizes, and consider
decompressing in a worker.

### F-070 — Provider params can enable streaming and break the response parser

**Severity:** S2
**Evidence:** `product/worker/lib/providers.ts` spreads `call.params` into the request body, and
`callProvider()` always calls `response.json()`. `params` is `z.record(z.string(), z.unknown())`
(`worker/lib/reviewers.ts`), so `{ "stream": true }` (or another mode that changes the wire
format) is accepted and produces an SSE body that fails to parse.
**Impact:** an operator can configure a reviewer that always fails at the provider step, with a
confusing error. Arbitrary params can also change model behavior in ways the UI does not explain.
**Instead:** validate params against the provider/model capability schema; reject streaming until
implemented; type params per flavor; surface unsupported fields at save time.

### F-071 — Non-strict GitHub client loses status; setup errors become 500s

**Severity:** S3
**Evidence:** `product/worker/lib/github.ts` has two readers. `readJsonStrict()` throws
`GitHubApiError` with a status; `readJson()` throws a generic `Error('github_request_failed
(status)')`. `convertManifest`, `listAppInstallations`, `exchangeOAuthCode`, `fetchUser`, and
`fetchUserInstallations` use the non-strict reader, and the setup/auth routes do not map the error.
**Impact:** a GitHub outage, rate limit, or permission error during setup becomes an opaque
`internal_error` 500 instead of an actionable taxonomy code.
**Instead:** one GitHub error type with status/rate-limit metadata; map to `github_unavailable`,
`github_auth_failed`, `github_rate_limited`, and retry guidance; test the setup failure paths.

### F-072 — Stored JSON is parsed unguarded on read paths

**Severity:** S3
**Evidence:** `product/worker/routes/runs.ts` does `JSON.parse(row.files_json)`,
`JSON.parse(row.scope_skip_json)`, and `JSON.parse(row.knowledge_json)` without a guard;
`routes/repositories.ts` parses `files_json` in the scope-preview endpoint. A legacy, corrupt, or
hand-edited row throws and the global `onError` returns 500.
**Impact:** one bad row breaks a run detail or a scope preview with no recovery or diagnostic.
**Instead:** parse with a schema and fall back to a safe default; log a data-integrity event; add a
repair/export path.

### F-073 — Pack creation can leave an empty pack on partial failure

**Severity:** S2
**Evidence:** `product/worker/lib/packs.ts` `createPackVersion()` inserts the `packs` row first
(when the slug is new or `forceNew` is set), then later runs `db.batch()` for the version, files,
and pack update. There is no transaction spanning the pack insert and the version insert.
**Impact:** if the batch fails (DB error, limits), an empty pack remains. `listPacks` inner-joins
versions so it is invisible, but `findPackBySlug`/`uniqueSlug` still see it and it can block a
name or produce a confusing version count.
**Instead:** one transaction/batch for pack + version + files, or clean up the pack on failure;
make the slug allocation idempotent.

### F-074 — Setup and claim state writes are not atomic

**Severity:** S2
**Evidence:** `routes/setup.ts` writes `setup_session_hash` and `setup_session_expires` in two
`setMeta()` calls; `routes/auth.ts` claims with four `setMeta()` calls (`owner_login`, `owner_id`,
`owner_type`, `claimed_at`) plus `deleteMeta()`; `lib/github-app.ts` `storeGitHubApp()` does
`DELETE FROM github_app` then `INSERT` as two statements. A failure between them leaves partial
state.
**Impact:** an instance can be half-claimed (login without owner id, or claimed without a usable
app), with no reset endpoint. The operator must clear D1 to recover.
**Instead:** `DB.batch()`/transaction for related meta writes; make claim idempotent; add a
repair/diagnose command; never delete the app row before the replacement insert succeeds.

### F-075 — Reviewer count and per-run fan-out are unbounded

**Severity:** S2
**Evidence:** `run-engine.ts` `stepConfig()` selects every enabled reviewer; `stepReview()` runs
`Promise.allSettled` over all of them; `finishRun()` builds one `INSERT` per reviewer in a single
`DB.batch`; there is no maximum reviewer count in the schema or API (only manual try runs cap at
10).
**Impact:** a large reviewer set fans out unbounded provider calls and spend, can hit provider
rate limits, and produces a very large single `DB.batch` at finish. One noisy instance can starve
itself.
**Instead:** cap reviewers per run/repository (for example 20), enforce per-provider concurrency,
chunk DB writes, and return a clear policy error when the cap is exceeded.

### F-076 — Webhook and API bodies have no app-level size cap

**Severity:** S2
**Evidence:** `routes/webhooks.ts` reads `await c.req.text()` before JSON parsing; API routes such
as `routes/packs.ts`, `routes/reviewers.ts` (import), and the setup routes call `c.req.json()`
without a route-level limit. The platform has request limits, but the application does not enforce
its own.
**Impact:** a large or malicious body can consume memory/CPU before validation; the pack route is
the most exposed because its schema allows up to 1,000 × 1 MB texts.
**Instead:** a body-size middleware per route with an explicit 413 response; stream/parse with a
cap; reject early; log the rejection without the body.

### F-077 — Reviewer list query fans out to N×M rows

**Severity:** S3
**Evidence:** `product/worker/lib/reviewers.ts` `listReviewers()` runs
`REVIEWER_REPOSITORIES_SQL`, which joins every enabled repository to every reviewer and then groups
in memory. With many reviewers and repositories this returns a large intermediate set on every
reviewer list, readiness check, and repository-reviewer save.
**Impact:** dashboard latency and memory grow with the product of reviewers and repositories; the
query is run even when only a name or id is needed.
**Instead:** paginate the reviewer list, fetch the repository names only for the reviewers on the
page, or use a per-reviewer aggregate (JSON array / `COUNT`) in one indexed query.

## The pattern behind the flaws

Four root causes explain almost every entry:

1. **The runtime was chosen before the product.** Byte budgets, one DO per run, no queue, no
   index, no long workers — all consequences of Cloudflare's free plan.
2. **The review was treated as a prompt, not a pipeline.** No grounding, verification, consensus,
   evaluation, or feedback.
3. **Security stopped at the perimeter.** Credentials and signatures were handled well; untrusted
   content, egress, roles, and exfiltration were not.
4. **The single-operator assumption was never made explicit.** It is fine for a PoC, but it leaks
   into the data model, auth, and UI.

The target architecture and product docs address these directly. Read
[`../architecture/overview.md`](../architecture/overview.md) next.
