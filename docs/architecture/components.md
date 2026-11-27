# Components

The logical components of Jury Forge, their responsibilities, and the seams between them. Names
are normative; the implementation is a modular monolith with two deployable processes (web/API and
worker) plus infrastructure.

## 1. Web/API service

**Responsibility:** the operator-facing surface and the ingress for forge events.

- Serve the React SPA and static assets (with CSP and security headers).
- Authenticate users (GitHub OAuth and/or OIDC), manage sessions, and enforce roles.
- Expose the versioned JSON API (`/api/v1`), validated by shared schemas.
- Receive forge webhooks: verify signature, enforce replay/idempotency, persist an event, enqueue
  a job. No forge API work in the request.
- Serve the admin surface: installations, repositories, reviewers, policies, packs, budgets,
  audit, diagnostics.
- Generate the OpenAPI document from the same schemas.

**Non-responsibilities:** running reviews, calling model providers, holding long-lived
connections to forges, or doing CPU-heavy indexing.

**Key modules:** `auth`, `tenancy`, `forge-webhook`, `api`, `spa-host`, `admin`, `diagnostics`.

## 2. Review worker

**Responsibility:** execute the review pipeline for one claimed job at a time.

- Claim a job with a lease; load the run and its configuration snapshot.
- Execute steps: `resolve`, `fetch`, `index` (T2 branch review only), `plan`, `review`, `ground`,
  `jury`, `publish`, `record`. Each step is idempotent and recorded; T0 PR review skips `index`.
- Call the provider gateway; stream/normalize responses; store raw artefacts.
- Enforce budgets, timeouts, cancellation, and per-provider concurrency.
- Publish at most one review per run with an idempotency key.
- Emit metrics, traces, and audit events.

**Scaling:** stateless; scale horizontally. Concurrency is bounded by the queue and per-provider
limits. A worker never owns durable state outside Postgres/object storage.

## 3. Indexer

**Responsibility:** build and refresh the repository knowledge that makes branch reviews grounded (T2).

- Clone/fetch the repository at a SHA (or use the forge API) into an ephemeral workspace.
- Extract symbols, imports, call references, tests, configs, and ownership.
- Store a compact index in Postgres (or a dedicated store) keyed by repository + commit.
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

Inputs: PR diff/hunks and metadata (T0); repository index/graph (T2 branch review); instructions
(`AGENTS.md`, `CONTRIBUTING.md`, repo policy), knowledge packs, previous findings, reviewer role,
model window, and budget.

Outputs: a structured, trust-labelled context bundle. **T0:** diff/hunks, PR metadata, reviewer
instructions, granted packs, thread and prior findings. **T2:** changed files with patches, file
slices, related symbols, tests, repo docs, previous findings. Both include a manifest of what was
included/omitted and why.

Rules: token-aware; deterministic; auditable; never silently drops a changed file (it may degrade
with a reason). T0 does not read files or the graph; T2 prioritises changed source, then related
code, then docs.

## 6. Reviewer runtime

**Responsibility:** execute one reviewer's instructions against the context.

- Build a system prompt from the reviewer version, role, rules, output schema, and trust policy.
- Build a user message with escaped, delimited data blocks.
- Enforce output schema, size limits, and forbidden content.
- Support tools for retrieval/verification where the model/provider allows it.
- Capture raw response, usage, latency, and errors.

A reviewer is a **versioned configuration**, not a mutable row: `reviewer_version` holds the prompt
and model binding; a run references the version it used.

## 7. Grounding and verification

**Responsibility:** turn a model claim into an evidence-backed finding or drop it.

- Resolve the file and line at the reviewed SHA.
- Fetch the actual line range (and surrounding context).
- Ask a verifier (or apply deterministic checks) whether the claim matches the code.
- Attach evidence: quoted snippet, line range, file hash.
- Assign confidence; drop below threshold or mark as "unverified" per policy.
- For suggested fixes, validate the patch applies cleanly to the SHA.

## 8. Jury / consensus

**Responsibility:** combine independent reviewer outputs into one verdict.

- Cluster duplicate findings (file + issue signature + semantic similarity).
- Merge attribution: which reviewers found it, with what confidence.
- Surface disagreements: one reviewer says "safe", another says "vulnerable".
- Optional chair step: a final model call (or deterministic policy) decides severity and verdict.
- Produce the publish plan: inline comments, summary, status/check conclusion.

## 9. Policy engine

**Responsibility:** decide what runs and what is published.

- Per organisation / installation / repository / branch / path.
- Which reviewers are required, optional, or disabled.
- Severity thresholds, inline caps, publish mode (comment, request changes, check, label).
- Token/cost budgets, model allowlist, data policy (redaction, local-only), fork policy.
- Suppression rules and known false positives.
- Evaluation gates for prompt changes.

The policy is data, not code, and is validated by a schema. A policy change is audited.

## 10. Knowledge service

**Responsibility:** store, version, grant, and retrieve team knowledge.

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

## 12. Scheduler and janitor

**Responsibility:** keep the system honest without a human.

- Expire leases and recover stuck runs.
- Retry transient failures with backoff; move exhausted jobs to a DLQ.
- Enforce retention and deletion.
- Reconcile budgets and usage.
- Refresh repository indexes on a schedule or on demand.
- Emit alerts for stale runs, failed publishes, budget overruns, and provider outages.

## 13. Notifications

**Responsibility:** tell the operator when it matters.

- Channels: email, Slack, generic webhook, GitHub check/comment.
- Events: run failed, publish failed, budget threshold, provider down, reviewer disabled, new
  installation, security event.
- Per-tenant policy; no telemetry to the project.

## 14. Admin CLI

**Responsibility:** the escape hatch for operators.

- `jury-forge install`, `upgrade`, `backup`, `restore`, `doctor`, `rotate-key`,
  `create-admin`, `export`, `import`, `reconcile`.
- Non-interactive flags for automation.
- Never requires editing the database by hand.

## 15. Identity and tenancy

**Responsibility:** who can do what, in which scope.

- Users, organisations, memberships, roles.
- Installation and repository scopes.
- Sessions, API tokens, and service accounts.
- SSO/OIDC later; GitHub OAuth first.
- An authorization matrix with a test per mutating endpoint.

## Component interaction rules

1. The web/API never calls a model provider. It enqueues.
2. The worker never serves HTTP to the browser. It publishes to the forge and writes state.
3. The provider gateway is the only component that knows a provider's wire format.
4. The forge adapter is the only component that knows a forge's API.
5. The policy engine is the only component that decides publish mode and budgets.
6. The context planner is the only component that decides what the model sees.
7. The audit writer is called by every mutating path, in the same transaction where possible.
8. Object storage holds bytes; Postgres holds facts; the index holds derived knowledge.

## What can be extracted later

| Component | Extract when | Interface |
| --------- | ------------ | --------- |
| Indexer | CPU/memory or language-specific parsing demands it | `IndexQuery` over a queue |
| Provider gateway | Multiple services need model calls | Internal HTTP/gRPC |
| Context planner | It becomes a shared service across products | `PlanContext` request/response |
| Grounding | Verification becomes a separate, rate-heavy workload | `VerifyFindings` |
| Notifications | Many channels or per-tenant routing | Event bus |

Do not extract before the seam is painful. A modular monolith is the target.
