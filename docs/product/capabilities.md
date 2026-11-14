# Capability backlog

This is the product capability map. **The owner will supply the final capability list later**;
this page is the current baseline, built from the PoC study and the product thesis. It is expected
to change. Every capability is either proven by the PoC, planned for Jury Forge, deferred, or
explicitly out of scope.

Status key: **Proven** (the PoC shipped a version), **Planned** (in the target product),
**Deferred** (later, not v1), **Out** (not this product), **TBD** (owner decision pending).

## 1. Onboarding and installation

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| One-command local install (container/Compose) | Planned | Reference path; must be tested on a clean machine. |
| Guided first-run wizard | Proven | PoC: setup code → GitHub App manifest → install → claim. |
| Private GitHub App per instance | Proven | Keep; support multiple installations and GHES later. |
| First-run protection | Proven | Replace `SETUP_CODE` with a rate-limited bootstrap token and recovery flow. |
| Readiness checklist computed from state | Proven | Keep; derive from database, not client state. |
| Instance diagnostics and environment validation | Planned | Health, dependency checks, config lint, support bundle. |
| Local demo mode without a public URL | TBD | Would remove the tunnel requirement for evaluation. |
| One-click marketplace images | Deferred | Nice for adoption; not a substitute for Compose. |

## 2. Source control and events

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| GitHub pull-request events | Proven | opened, reopened, synchronize, ready_for_review. |
| Draft PR handling | Proven | Skip drafts. |
| Webhook signature verification and de-duplication | Proven | Keep. |
| Fork PR policy | Planned | Skip / restricted / approve; least privilege. |
| Repository discovery and enablement | Proven | Manual refresh; add installation events. |
| GitHub Checks / status / annotations | Planned | Gate merges, surface findings in CI. |
| SARIF export | Planned | Feed security dashboards. |
| GitHub Enterprise Server | Planned | Configurable API base; same App model where available. |
| GitLab / Gitea / Bitbucket adapters | Deferred | Forge interface from day one. |
| Monorepo / path-aware routing | Planned | Different reviewers and policies per path. |

## 3. Reviewers and the jury

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| User-defined reviewers (name, instructions, rules) | Proven | Keep. |
| Per-reviewer model and provider binding | Proven | Keep. |
| Multiple reviewers per run, in parallel | Proven | Keep; add limits and a deliberation stage. |
| Reviewer templates | Proven | Seven starters; keep as local prefill. |
| Reviewer versions and prompt diffs | Planned | Draft → active, rollback, prompt hash. |
| Reviewer↔repository enablement (opt-out) | Proven | Keep. |
| Path scope (include/exclude globs) | Proven | Keep; enforce at output. |
| Reference context paths | Proven | Keep; add semantic retrieval. |
| Cross-reviewer de-duplication and disagreement | Planned | The "jury" step. |
| Chair / consensus verdict | Planned | Configurable; not every team wants it. |
| Confidence and evidence per finding | Planned | Grounding and scoring. |
| Suggested fixes (validated diff suggestions) | Planned | Never auto-merge. |
| Reviewer marketplace | Out (v1) | Local templates and packs only. |

## 4. Context and code intelligence

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| Diff context with budgets | Proven | Replace bytes with tokens. |
| Skip lockfiles/generated/binaries | Proven | Keep; make configurable. |
| Priority file ordering | Proven | Keep; model-aware. |
| Repository instruction files | Proven | `AGENTS.md` / `CONTRIBUTING.md`, opt-in. |
| Reference file fetch | Proven | Literal roots; add retrieval. |
| Symbol / import / dependency index | Planned | The main quality differentiator. |
| Test impact analysis | Planned | Map changes to tests. |
| CODEOWNERS awareness | Planned | Route findings to owners. |
| Semantic retrieval / embeddings | TBD | Evaluate after symbol graph + benchmark. |
| Cross-repository context | Deferred | For platform teams later. |

## 5. Knowledge packs

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| Folder/zip upload with manifest | Proven | Keep. |
| Immutable content-hashed versions | Proven | Keep. |
| Global / repository / reviewer grants | Proven | Keep. |
| Precedence and path-scoped apply | Proven | Keep. |
| Provenance (`slug@hash`, injected bytes) | Proven | Keep; add token counts. |
| Never-quote files | Proven | Keep; audit. |
| Pinned versions / channels | Planned | Reproducible reviews. |
| Signed packs | Planned | Supply-chain trust. |
| Authenticated upload API | Planned | CI and automation. |
| Relevance retrieval inside packs | Planned | Don't inject whole docs. |
| Pack marketplace / sharing | Out (v1) | Not a marketplace. |

## 6. Review output and publishing

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| One consolidated review per run | Proven | Keep. |
| Inline comments on changed lines | Proven | Keep. |
| Multi-line findings | Proven | Keep. |
| Summary with per-reviewer attribution | Proven | Keep. |
| Overflow to summary with `file:line` | Proven | Keep; budget the body. |
| Resolution buckets | Proven | Keep; stable fingerprints. |
| Token usage per reviewer | Proven | Keep; add cost. |
| Publish modes (comment / request changes / check / label) | Partly proven | PoC has instance-wide blocking; make per-policy. |
| Preview and edit before publish | Planned | For new prompts and sensitive repos. |
| Suppression / known false positives | Planned | Per repo and per finding. |
| Review threading and resolution | Planned | Respect GitHub conversation state. |
| Notifications (Slack/email/webhook) | Planned | Run failures, budgets, digests. |

## 7. Policy and governance

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| Instance settings with bounds | Proven | Keep. |
| Per-repository / branch policy | Planned | Severity thresholds, publish mode, budgets, required reviewers. |
| Roles and membership | Planned | Owner/admin/maintainer/viewer/auditor; scoped. |
| Audit trail | Proven (basic) | Replace with append-only audit + export. |
| Data retention and deletion | Planned | Per data class; export/delete. |
| Approval workflow for prompt changes | Planned | Four-eyes for security reviewers. |
| Cost budgets and alerts | Planned | Per repo/instance/period. |

## 8. Providers and models

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| OpenAI-compatible chat | Proven | Keep. |
| Anthropic-compatible messages | Proven | Keep. |
| Local model servers | Planned | OpenAI-compatible path; document Ollama/vLLM. |
| Structured output / JSON schema | Planned | Prefer native support; repair fallback. |
| Streaming | Planned | Latency and UX. |
| Tool use / function calling | Planned | Retrieval, verification, suggestions. |
| Provider capability registry | Planned | Windows, prices, features, health. |
| Per-provider concurrency and rate limits | Planned | Protect the provider and the bill. |
| Provider fallback / routing | Deferred | Per reviewer first; org-level later. |
| Custom headers / Azure / gateways | Planned | Adapter config. |
| Embeddings provider | TBD | Only if semantic retrieval lands. |

## 9. Operations and platform

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| Container image / Compose stack | Planned | Reference deployment. |
| PostgreSQL | Planned | Source of truth. |
| Durable job queue + workers | Planned | Leases, retries, DLQ, cancellation. |
| Object storage for artefacts | Planned | Raw responses, patches, reports; S3-compatible, optional. |
| Backups and restore | Planned | Tested drill, not a doc. |
| Upgrades and migrations | Planned | Expand/contract, rollback, backup-first. |
| Metrics, traces, structured logs | Planned | OpenTelemetry; no vendor lock-in. |
| Health and readiness | Planned | Dependency checks, degraded state. |
| Horizontal worker scaling | Planned | Queue-based; stateless workers. |
| Kubernetes / Helm | Deferred | After Compose is solid. |
| Air-gapped install | TBD | Local model + mirrored images; forge connectivity caveat. |
| Multi-installation / multi-tenant | TBD | One instance per org first. |

## 10. Quality and evaluation

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| Unit/integration/contract tests | Proven | Keep the discipline. |
| Accessibility harness | Proven | Keep; add browser matrix. |
| Evaluation benchmark (golden PRs) | Planned | Precision/recall, acceptance, false positives. |
| Per-reviewer scorecards | Planned | Which roles earn their keep. |
| A/B prompt experiments | Planned | Versioned prompts, measured. |
| Feedback capture | Planned | Helpful / wrong / fixed, with reasons. |
| Cost/latency budgets in CI | Planned | Deterministic stub model. |
| Fault-injection tests | Planned | Duplicate, crash, publish-then-fail, cancel. |
| Security test suite (prompt injection, SSRF, authz) | Planned | First-class. |

## 11. Owner-supplied capabilities

> **TBD.** The owner will provide the final capability list. Add rows here with a source (owner
> message, date), a status, and a link to the spec. Do not implement a TBD capability from
> inference.

| Capability | Source | Status | Spec |
| ---------- | ------ | ------ | ---- |
| _Pending owner input_ | — | TBD | — |

## How a capability becomes a feature

1. Add or update a row here with the owner's source.
2. Write a spec in `docs/product/specs/<slug>.md` using the `product-spec` skill.
3. Write an ADR if the capability is durable or architectural.
4. Get the owner's approval at the human gate.
5. Only then implement, with acceptance criteria and a test plan.
