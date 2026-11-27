# Components

The logical components of Jury Forge, their responsibilities, and the seams between them. Names
are normative; the implementation is a modular monolith with two deployable roles of one image
(`app` and `worker`) plus Postgres and Caddy ([`technical-approach.md`](technical-approach.md) §2,
§4). Components marked v1.1 or v1.2 are not built in v1.

## 1. Web/API service

**Responsibility:** the operator-facing surface and the ingress for forge events.

- Serve the React SPA and static assets (with CSP and security headers).
- Authenticate users (GitHub OAuth; OIDC is v1.2), manage sessions, and enforce roles.
- Expose the versioned JSON API (`/api/v1`), validated by shared schemas.
- Receive forge webhooks: verify signature, enforce replay/idempotency, persist an event, enqueue
  a job. No forge API work in the request.
- Serve the admin surface: setup, installations, repositories, providers, reviewers, budgets,
  audit, diagnostics (packs and the reviewer catalog are v1.2).
- Generate the OpenAPI document from the same schemas.

**Non-responsibilities:** running reviews, calling model providers, holding long-lived
connections to forges, or doing CPU-heavy indexing.

**Key modules:** `auth`, `tenancy`, `forge-webhook`, `api`, `spa-host`, `admin`, `diagnostics`.

## 2. Review worker

**Responsibility:** execute turns and the other queue jobs ([`job-pipeline.md`](job-pipeline.md)).

- Take jobs from graphile-worker; load the turn and its configuration snapshot.
- Execute the turn steps: `resolve`, `fetch`, `plan`, `review*`, `ground`, `verify` (v1), `chair`,
  `summarise` (v1), `publish`, `evaluate` (v1), then the receipt (v1). Each step stores its result
  by `(turn_id, step)`, so a retry skips finished steps (technical-approach §3.4, §5.2).
- Call the provider gateway; normalize responses; store redacted requests and responses as
  artefacts in Postgres.
- Enforce budgets, timeouts, cancellation, and per-provider concurrency.
- Publish at most one review per turn through the per-installation write queue, checking the stored
  `external_id` first.
- Run cron: reconciler, retention, stalled sessions, reaction poll.
- Emit metrics, traces, and audit events.

**Scaling:** stateless; scale horizontally. Concurrency is bounded by the queue and per-provider
limits. A worker never owns durable state outside Postgres.

## 3. Indexer (v1.1)

**Responsibility:** build and refresh the repository knowledge that makes branch reviews grounded
(T2, ADR-0014). Not in v1: PR review reads no index, and v1 has no git client in the image.

- Clone/fetch the repository at a SHA (or use the forge API) into an ephemeral workspace.
- Extract symbols, imports, call references, tests, configs, and ownership.
- Store a compact index in Postgres adjacency tables keyed by repository + commit.
- Optionally compute embeddings (deferred until the benchmark justifies the cost).
- Serve context queries to the review worker: "what calls this function?", "which tests cover this
  file?", "what does this type look like?".

**First version:** symbol/import/test graph only. No embeddings. Extract into its own service only
if CPU/memory requires it.

## 4. Provider gateway

**Responsibility:** one internal interface for all model calls.

- Provider registry: capabilities (chat, structured output, tools, streaming, embeddings), context
  window, tokenizer, price, health.
- Adapters: OpenAI-compatible, Anthropic-compatible, local (OpenAI-compatible), and later others.
- Request policy: timeouts, retries with jitter, `Retry-After`, circuit breaker, concurrency.
- Structured output: the mode the model's capability probe passed (forced tool, native schema, or
  prompt JSON with one repair); `finish=length` is a failure (ADR-0029).
- Capability probe runner: synthetic fixtures, token budget, results stored per provider, model,
  endpoint, and probe version.
- Usage and cost accounting per call, per reviewer, per run.
- Egress enforcement: the destination must match the credential's allowed origin.
- Redaction hooks before the request leaves the process.

**Non-responsibility:** prompt construction (that is the pipeline) and provider-specific business
logic outside the adapter.

## 5. Context planner

**Responsibility:** decide what the model sees, within a token and cost budget.

Inputs: PR diff/hunks and metadata; the instruction files read from the base SHA (ADR-0027) and
`.jury-forge.yml`; from v1 the enclosing functions of changed hunks (T0+), the linked issue, SARIF
results, and one org conventions pack; previous findings; reviewer role; model window; budget. The
repository graph is v1.1 (T2 branch review); knowledge packs beyond the conventions pack are v1.2.

Outputs: a structured, trust-labelled context bundle and a **coverage manifest** (reviewed /
expanded / summarised / skipped / excluded, each with a reason; ADR-0025 §2). **PR review:** strict
T0 hunks in the MVP; T0+ from v1. **T2 (v1.1):** changed files with patches, file slices, related
symbols, tests, repo docs.

Rules: token-aware; deterministic; auditable; never silently drops a changed file (it may degrade
with a reason). PR review reads no file outside the diff; T0+ reads only the head-SHA content of
files already in the diff. T2 prioritises changed source, then related code, then docs.

## 6. Reviewer runtime

**Responsibility:** execute one reviewer's instructions against the context.

- Build a system prompt from the reviewer version, role, rules, output schema, and trust policy.
- Build a user message with escaped, delimited data blocks.
- Enforce output schema, size limits, and forbidden content.
- Use the structured-output mode the model's capability probe passed (ADR-0029). PR review runs no
  model tool loop; tool calling exists in the gateway for v1.1 branch review.
- Capture raw response, usage, latency, and errors.

A reviewer is a **versioned configuration**, not a mutable row: `reviewer_versions` holds the prompt
and model binding; a turn references the version it used. v1 ships three built-in jurors (Security,
Correctness, Tests) and a non-voting verifier (ADR-0025).

## 7. Grounding and verification

**Responsibility:** turn a model claim into an evidence-backed finding or drop it.

- Resolve the file and line at the reviewed SHA.
- Fetch the actual line range (and surrounding context).
- Apply deterministic checks; from v1, one non-voting verifier call answers `confirmed`,
  `unconfirmed`, or `wrong` for each grounded candidate (ADR-0025 §4).
- Attach evidence: quoted snippet, line range, file hash.
- Assign confidence; drop below threshold or mark as "unverified" per policy.
- For suggested fixes, validate the patch applies cleanly to the SHA.

## 8. Jury / consensus

**Responsibility:** combine independent reviewer outputs into one verdict. **The chair is code**
(ADR-0025 §4); no model decides identity, severity, or the verdict.

- Merge duplicates by the code-assigned fingerprint (ADR-0024 §4).
- Merge attribution: which jurors found it, with what confidence.
- Severity = the highest severity among confirming jurors, capped by policy; agreement = jurors
  flagging it ÷ jurors that saw the file; rank by `severity × confidence × agreement`.
- Apply the noise budget and suppressions; surface disagreement as dissent.
- Produce the publish plan: inline comments, summary, status/check conclusion. A fast model writes
  only the summary and dissent text.

## 9. Policy engine

**Responsibility:** decide what runs and what is published.

- Per organisation / installation / repository / branch / path.
- Which reviewers are required, optional, or disabled.
- Severity thresholds, inline caps, publish mode (comment, request changes, check, label).
- Token/cost budgets, model allowlist, data policy (redaction, local-only), fork policy.
- Suppression rules and known false positives.
- Evaluation gates for prompt changes.

The policy is data, not code, and is validated by a schema. A policy change is audited.

## 10. Knowledge service (v1.2)

**Responsibility:** store, version, grant, and retrieve team knowledge (ADR-0017). v1 has only one
org conventions pack, injected as an instruction source and recorded in the receipt.

- Packs: immutable content-hashed versions, manifests, docs.
- Grants: global / repository / reviewer, precedence, path scoping, pinning.
- Retrieval: relevance-ranked chunks within a token budget; provenance of what was used.
- Signing and verification for supply-chain trust.
- API for CI upload and export.

## 11. Audit and activity

**Responsibility:** explain what happened and who changed what.

- **Audit:** append-only, durable, exportable, retention-policied events for every mutation and
  every publish/data-egress decision.
- **Activity:** a best-effort, human-readable feed for the dashboard (can be derived from audit).
- Include actor, action, target, before/after (redacted), request id, run id, and timestamp.

## 12. Cron jobs (inside the worker)

**Responsibility:** keep the system honest without a human. There is no separate scheduler or
janitor process; graphile-worker runs these inside `worker` (technical-approach §3.3).

- **Reconciler** (10 min): enqueue triggers a missed webhook would have caused; sync human thread
  resolutions.
- **Retention** (daily): expire artefacts and other rows past their retention.
- **Stalled sessions** (hourly): mark sessions waiting 30 days `needs human`.
- **Reaction poll** (5 min, open sessions): read feedback reactions.
- The queue retries transient failures with backoff; a job that exhausts its attempts stays
  permanently failed, inspectable and retryable by an admin.
- Index refresh is v1.1. Alerts come from `/metrics` in the operator's monitoring.

## 13. Notifications (v1.2)

**Responsibility:** tell the operator when it matters. Not in v1 (capabilities.md); v1 reports
through the Check Run, the inbox, and `/metrics`.

- Channels: email, Slack, generic webhook, GitHub check/comment.
- Events: run failed, publish failed, budget threshold, provider down, reviewer disabled, new
  installation, security event.
- Per-tenant policy; no telemetry to the project.

## 14. Admin CLI

**Responsibility:** the escape hatch for operators.

- A bash wrapper over `docker compose` in v1 (technical-approach TQ-2): `verify --release`,
  `init`, `install`, `setup domain|token|disable|rotate`, `doctor`, `backup`, `restore`, `upgrade`,
  `rotate-key`, `create-admin --recover`, `receipt verify`, `export` (technical-approach §3.13,
  first-run-setup, ADR-0020).
- Non-interactive flags for automation.
- Never requires editing the database by hand.

## 15. Identity and tenancy

**Responsibility:** who can do what, in which scope.

- Users and organisations. v1 roles are owner, maintainer, and reader: the owner is the claimed
  account; maintainer and reader come from GitHub repo access (ADR-0023, ADR-0028). Stored
  memberships and the admin, SME, viewer, and auditor roles are v1.2.
- Installation and repository scopes.
- User sessions (random IDs stored hashed). API tokens and service accounts are v1.2 (the API/CLI
  surface).
- GitHub OAuth in v1; SSO/OIDC is v1.2.
- An authorization matrix with a test per mutating endpoint.

## Component interaction rules

1. The web/API never calls a model provider. It enqueues.
2. The worker never serves HTTP to the browser. It publishes to the forge and writes state.
3. The provider gateway is the only component that knows a provider's wire format.
4. The forge adapter is the only component that knows a forge's API.
5. The policy engine is the only component that decides publish mode and budgets.
6. The context planner is the only component that decides what the model sees.
7. The audit writer is called by every mutating path, in the same transaction where possible.
8. Postgres holds facts and, in `artefacts`, bounded bytes with retention; the index (v1.1) holds
   derived knowledge.
9. Decisions are code: finding identity, dedup, the chair, risk, budgets, and resolution guards
   live in `domain`, which does no I/O (technical-approach §4).

## What can be extracted later

| Component | Extract when | Interface |
| --------- | ------------ | --------- |
| Indexer | CPU/memory or language-specific parsing demands it | `IndexQuery` over a queue |
| Provider gateway | Multiple services need model calls | Internal HTTP/gRPC |
| Context planner | It becomes a shared service across products | `PlanContext` request/response |
| Grounding | Verification becomes a separate, rate-heavy workload | `VerifyFindings` |
| Notifications | Many channels or per-tenant routing | Event bus |

Do not extract before the seam is painful. A modular monolith is the target.
