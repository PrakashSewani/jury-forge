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
| Repository discovery and enablement | Proven | Manual refresh; add installation events. No per-repo enable toggle for agentic review (ADR-0013). |
| Manual review trigger (Check Run action, label, slash command, UI) | Planned | Available on any PR in an installed repo; Check Run button + `jury:pr-review` label primary; reviewer picker unsupported for arbitrary apps. |
| Automatic review policy (config-as-code) | Planned | `.jury-forge.yml`; default off; manual bypasses the allowlist. |
| GitHub Checks / status / annotations | Planned | Gate merges, surface findings in CI. |
| SARIF export | Planned | Feed security dashboards. |
| GitHub Enterprise Server | Planned | Configurable API base; same App model where available. |
| GitLab / Gitea / Bitbucket adapters | Deferred | Forge interface from day one. |
| Monorepo / path-aware routing | Planned | Different reviewers and policies per path. |

## 3. Agents and the jury

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| User-defined agents (name, instructions, rules) | Proven | Keep. |
| Per-agent model and provider binding | Proven | Keep; model from the catalog only (ADR-0011). |
| Multiple agents per turn, in parallel | Proven | Keep; add limits, routing, and a deliberation stage. |
| Agent templates | Proven | Seven starters; keep as local prefill. |
| Agent versions and prompt diffs | Planned | Draft → active, rollback, prompt hash, run snapshot. |
| Reviewer catalog + approval | Planned | Org catalog; SME drafts/owns, admin approves; maintainer binds approved (ADR-0016). |
| Per-repo reviewer bindings | Planned | Required/optional, path/language/label scope, budget; no binding = not available. |
| No-reviewers / no-match fallback | Planned | Comment with setup/retrigger; never a misleading clean review. |
| Capability agents + tool policy | Planned | Graph/tests/static tools; agent chooses verification; `tests.run`/`build.run` opt-in sandbox. |
| Capability labels (`jury:cap:*`) | Planned | Request a capability group only within the repo’s bound/approved reviewers. |
| Dynamic agent availability (repo/path/language/label scope) | Planned | Router selects the jury; no per-repo enable toggle (ADR-0013). |
| Path scope (include/exclude globs) | Proven | Keep; enforce at output. |
| Reference context paths | Proven | Keep; add semantic retrieval and the repo graph. |
| Cross-agent de-duplication and disagreement | Planned | The "jury" step. |
| Chair / consensus verdict | Planned | Configurable; not every team wants it. |
| Confidence and evidence per finding | Planned | Grounding and scoring. |
| Suggested fixes (validated diff suggestions) | Planned | Never auto-merge. |
| Agent marketplace | Out (v1) | Local templates and packs only. |

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
| Review threading and resolution | Planned | Respect GitHub conversation state; only Jury Forge resolves its threads after a satisfactory reply (ADR-0012). |
| Conversational PR sessions | Planned | Per-PR session, thread replies, context alive across days (ADR-0012). |
| Agentic turn loop | Planned | Tools, grounding, verification, chair, budgets; not one LLM call. |
| Notifications (Slack/email/webhook) | Planned | Run failures, budgets, digests. |

## 7. Policy and governance

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| Instance settings with bounds | Proven | Keep. |
| Per-repository / branch policy | Planned | Severity thresholds, publish mode, budgets, required reviewers. |
| Roles and membership | Planned | Owner/admin/**SME**/maintainer/member/viewer/auditor; scoped to org/repo/domain. |
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
| Provider model discovery | Planned | Fetch `/models` with the key; no free-text model input (ADR-0011). |
| Model catalog + registry enrichment | Planned | Provider truth + context/prices/capabilities; unknown models flagged. |
| Encrypted, write-only provider keys | Planned | Envelope encryption, origin binding, rotation, audit. |
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

## 11. Agentic sessions (owner directive, 2026-11-15)

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| Per-PR durable session | Planned | One session per PR; threads, messages, findings, turns, generations. |
| User reply → agent response | Planned | GitHub review-comment/issue-comment events; debounce/coalesce; no parallel turns. |
| Agent-only resolution | Planned | Guarded `resolve_thread`; evidence + human response; reopen on reply. |
| Manual-first triggering | Planned | `jury:pr-review`/`jury:branch-review` labels + Check Run actions; slash command/UI fallback; no repo enable toggle. |
| Reviewer catalog + repo bindings | Planned | Required/optional reviewers per repo; SME-owned/approved catalog; admin/maintainer bind (ADR-0016). |
| No-reviewers fallback | Planned | Comment with setup/retrigger; no review posted. |
| Dynamic agent availability/router | Planned | Scope by repo/path/language/label; explicit request wins; record why. |
| PR review default + branch review | Planned | `jury:branch-review` compares the PR branch to the default branch and reviews the full delta against context; estimate; cancellable. |
| Repository knowledge graph | Planned | Symbols/imports/tests/configs/docs/owners/findings; incremental updates. |
| Context reuse across runs | Planned | Content-hash summaries; manifest; only changed files re-indexed. |
| Session inbox / conversation UI | Planned | Timeline, agent activity, tool calls, findings, cost, resolve state. |
| Dockerized backend + UI | Planned | Compose reference; Postgres/queue/object storage; no Cloudflare. |

## 12. Owner-supplied capabilities

> **2026-11-15:** the owner supplied the agentic-review capability set. The rows below are the
> source; the specs and ADRs are the plan.

| Capability | Source | Status | Spec |
| ---------- | ------ | ------ | ---- |
| Agentic reviewer, not a single LLM call | Owner, 2026-11-15 | Planned | [`specs/agentic-review-sessions.md`](specs/agentic-review-sessions.md) |
| Per-PR session with replies and live context | Owner, 2026-11-15 | Planned | [`specs/agentic-review-sessions.md`](specs/agentic-review-sessions.md) |
| Manual trigger above all installed repos | Owner, 2026-11-15 | Planned | [`specs/agentic-review-sessions.md`](specs/agentic-review-sessions.md) |
| Dynamic multi-agent availability | Owner, 2026-11-15 | Planned | [`specs/agentic-review-sessions.md`](specs/agentic-review-sessions.md) |
| Per-repo reviewer catalog + required/optional bindings | Owner, 2026-11-15 | Planned | [`specs/reviewer-assignment-and-roles.md`](specs/reviewer-assignment-and-roles.md) |
| SME/admin reviewer ownership and approval | Owner, 2026-11-15 | Planned | [`specs/reviewer-assignment-and-roles.md`](specs/reviewer-assignment-and-roles.md) |
| No-reviewers fallback + retrigger | Owner, 2026-11-15 | Planned | [`specs/reviewer-assignment-and-roles.md`](specs/reviewer-assignment-and-roles.md) |
| Provider model discovery, no free text | Owner, 2026-11-15 | Planned | [`specs/provider-model-discovery.md`](specs/provider-model-discovery.md) |
| Encrypted provider keys | Owner, 2026-11-15 | Planned | [`specs/provider-model-discovery.md`](specs/provider-model-discovery.md) |
| Only Jury Forge resolves conversations | Owner, 2026-11-15 | Planned | [`specs/agentic-review-sessions.md`](specs/agentic-review-sessions.md) |
| PR review default; branch review against default branch with context graph | Owner, 2026-11-15 | Planned | [`specs/repo-knowledge-graph.md`](specs/repo-knowledge-graph.md) |
| Incremental graph update every run | Owner, 2026-11-15 | Planned | [`specs/repo-knowledge-graph.md`](specs/repo-knowledge-graph.md) |
| Dockerized self-hosted backend + UI | Owner, 2026-11-15 | Planned | [`../architecture/deployment.md`](../architecture/deployment.md) |

> **TBD.** The owner will supply further capabilities later. Add a row with the source and a spec;
> do not implement a TBD capability from inference.

## How a capability becomes a feature

1. Add or update a row here with the owner's source.
2. Write a spec in `docs/product/specs/<slug>.md` using the `product-spec` skill.
3. Write an ADR if the capability is durable or architectural.
4. Get the owner's approval at the human gate.
5. Only then implement, with acceptance criteria and a test plan.
