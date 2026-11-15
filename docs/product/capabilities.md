# Capability backlog

This is the product capability map. **The owner will supply the final capability list later**;
this page is the current baseline, built from the PoC study and the product thesis. It is expected
to change. Every capability is either proven by the PoC, planned for Jury Forge, deferred, or
explicitly out of scope.

Status key: **Proven** (the PoC shipped a version), **Planned** (in the target product),
**Deferred** (later, not v1), **Out** (not this product), **TBD** (owner decision pending),
**Backlog** (candidate that can be picked up; not committed; see section 13).

## Release tiers (proposed, ADR-0018; pending owner approval)

Nothing below is removed from the owner's list; it is sequenced. Status above says *what*; the tier
says *when*. PR review is strict T0 (diff-only); branch review uses T2 (graph). T1 bounded reads were rejected for PR review.

| Tier | Capabilities |
| ---- | ------------ |
| **MVP / Phase 1** | Compose install + bootstrap; GitHub App setup; **GitHub OAuth login + first-owner claim**; provider add + `/models` discovery + encrypted keys; **one built-in reviewer** bound to a catalog model; manual trigger via `jury:pr-review` label, Check Run action, or UI picker (no slash); **PR review strict T0 diff-only + repo instruction files**; one posted review; reply → next turn; **`suggest` resolution**; one-click feedback; **Check Run progress and completion**; session/turn/tool records + basic timeline; hard per-turn token/tool/time caps; evaluation harness v0; health/readiness. |
| **v1 — the trust loop** | **Three built-in reviewers: Security, Correctness, Tests**; jury composition + per-finding provenance + preserved dissent + explainable verdict; **review receipt** (provider, model, tokens, redactions, withheld, context, policy, resolver); stalled-session policy; audit stream + export; backup/restore; owner/maintainer/reader; minimal control plane (setup, overview, sessions, reviewers, providers, audit, settings); secret redaction + origin-bound keys; **quality spike + public benchmark**. |
| **v1.x** | Reviewer catalog + studio + approval; capability registry + `jury:cap:*` labels; SME/admin/viewer/auditor roles; knowledge packs, doc links, retrieval UI; repository graph + branch review (benchmark-gated); Helm; per-repo provider allowlists/data zones; analytics/scorecards; notifications; GHES; signed packs. |
| **Later** | Multi-forge (GitLab/Gitea/Bitbucket); SSO/OIDC; multi-installation; air-gapped; MCP; CLI; marketplace; cross-repo context. |

The graph and branch review enter v1.x only if the benchmark shows strict T0 PR review leaves
meaningful recall on the table (ADR-0018/ADR-0023).

## 1. Onboarding and installation

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| One-command local install (container/Compose) | Planned | Reference path; must be tested on a clean machine. |
| Guided first-run wizard | Proven | PoC: setup code → GitHub App manifest → install → claim. Spec: [`specs/first-run-setup.md`](specs/first-run-setup.md). |
| GitHub OAuth dashboard login | Planned (MVP) | Same GitHub App (`request_oauth_on_install`) or a separate OAuth app; login is required in MVP — the first owner is claimed through it. Sessions, roles, and re-auth harden in v1. |
| Public origin contract (domain set in setup, webhook/OAuth paths) | Planned (MVP) | The origin is entered and validated in setup **before** the App step (ADR-0021), stored in Postgres; `PUBLIC_URL` only freezes it. GitHub calls `POST /api/webhooks/github` and `GET /api/auth/github/callback` on that HTTPS origin. |
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
| Fork PR policy + OSS mode | Planned (v1.x) | Skip / restricted / approve; explicit visibility for external contributors; no secrets or fork code execution; a maintainer can invite a review on a fork PR. |
| Repository discovery and enablement | Proven | Manual refresh; add installation events. No per-repo enable toggle for agentic review (ADR-0013). |
| Manual review trigger (Check Run action, labels, UI picker) | Planned | Available on any PR in an installed repo; Check Run + mode/capability labels; no slash commands; reviewer picker unsupported for arbitrary apps. |
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
| Reviewer catalog + approval | Planned (v1.x) | Org catalog; SME drafts/owns, admin approves; maintainer binds approved reviewers only when `allowMaintainerBindings` is on (ADR-0016). |
| Per-repo reviewer bindings | Planned (v1.x) | Required/optional, path/language/label scope, budget; no binding = not available. |
| No-reviewers / no-match fallback | Planned | Comment with setup/retrigger; never a misleading clean review. |
| Capability agents + tool policy | Planned (T2, v1.x) | Graph/tests/static tools for branch review; agent chooses verification; sandbox `tests.run`/`build.run` are later. |
| Reviewer creation studio (capabilities, model, tools, availability) | Planned (v1.x) | Capability tags, catalog model/endpoint, tool policy, optional repo binding, test/activate. |
| Capability labels (`jury:cap:*`) | Planned (v1.x) | Request a capability group only within the repo’s bound/approved reviewers. |
| Dynamic agent availability (repo/path/language/label scope) | Planned (v1.x) | Router selects the jury; no per-repo enable toggle (ADR-0013). |
| Path scope (include/exclude globs) | Proven | Keep; enforce at output. |
| Reference context paths | Proven; T2 v1.x | Keep for branch review; PR review is strict diff-only (T0). |
| Cross-agent de-duplication and disagreement | Planned (v1) | The "jury" step. |
| Chair / consensus verdict | Planned (v1) | Configurable; not every team wants it. |
| Confidence and evidence per finding | Planned (v1) | Grounding and scoring. |
| Suggested fixes (validated diff suggestions) | Planned (v1.x; Q-035) | Proposed, never auto-applied or auto-merged; validated against the reviewed SHA and the diff; acceptance measured. |
| Agent marketplace | Out (v1) | Local templates and packs only. |

## 4. Context and code intelligence

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| Diff context with budgets | Proven | Replace bytes with tokens. |
| Skip lockfiles/generated/binaries | Proven | Keep; make configurable. |
| Priority file ordering | Proven | Keep; model-aware. |
| Repository instruction files | Proven | `AGENTS.md` / `CONTRIBUTING.md`, opt-in. |
| Reference file fetch | Proven | Literal roots; add retrieval. |
| Symbol / import / dependency index | Planned (v1.x, benchmark-gated) | Potential quality differentiator; justify with the benchmark before building (ADR-0018). |
| Bounded on-demand file reads for PR review (T1) | Rejected | Owner chose strict T0; file reads/graph are branch review only (ADR-0019 rejected). |
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
| Repo docs (AGENTS/CONTRIBUTING/ADRs/docs) at SHA | Planned (v1.x; v1 reads only AGENTS.md/CONTRIBUTING.md as instructions) | Index + retrieve relevant sections; opt-in per repo. |
| Live doc links (allowlisted) + per-run snapshot | Planned (v1.x) | Live fetch at turn time with SSRF/rate/size guards; store the fetched copy for audit; stale fallback. |
| Capability-scoped knowledge grants | Planned | Org/repo/reviewer/capability; precedence; pin/latest. |
| Retrieval + citations | Planned | Relevant chunks under token budget; cite source/hash/path. |
| Never-quote files | Proven | Keep; audit. |
| Pinned versions / channels | Planned | Reproducible reviews. |
| Signed packs | Planned (v1.x) | Supply-chain trust. |
| Authenticated upload API | Planned | CI and automation. |
| Relevance retrieval inside packs | Planned | Don't inject whole docs. |
| Pack marketplace / sharing | Out (v1) | Not a marketplace. |

## 6. Review output and publishing

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| One consolidated review per run | Proven | Keep. |
| Check Run progress and completion | Planned (MVP) | `queued` → `in_progress` → `completed`; the review is the completion; for manual triggers, one placeholder comment on by default, edited in place; no comment stream. See [`specs/review-progress-and-completion.md`](specs/review-progress-and-completion.md). |
| Inline comments on changed lines | Proven | Keep. |
| Multi-line findings | Proven | Keep. |
| Summary with per-reviewer attribution | Proven | Keep. |
| Jury composition, dissent, and verdict | Planned (v1) | One review with per-reviewer provenance, preserved dissent, and an explainable chair rule; see [`specs/jury-output.md`](specs/jury-output.md). |
| Overflow to summary with `file:line` | Proven | Keep; budget the body. |
| Resolution buckets | Proven | Keep; stable fingerprints. |
| Token usage per reviewer | Proven | Keep; add cost. |
| Publish modes (comment / request changes / check / label) | Partly proven | PoC has instance-wide blocking; make per-policy. |
| Preview and edit before publish | Planned | For new prompts and sensitive repos. |
| Suppression / known false positives | Planned | Per repo and per finding. |
| Per-finding feedback (valid / wrong / fixed / duplicate) | Planned (MVP) | One-click signal on the finding; feeds the benchmark and the reviewer scorecard. |
| Review threading and resolution | Planned | Respect GitHub conversation state; `suggest` default (human resolves natively/UI), `auto`/`off` opt-in (ADR-0012). |
| Resolution policy (`suggest`/`auto`/`off`) + SME/admin override | Planned (MVP) | `suggest` default: agent proposes, human resolves natively/UI; `auto` guarded; SMEs/admins override; wrong-resolution rate measured (ADR-0012). |
| Conversational PR sessions | Planned | Per-PR session, thread replies, context alive across days (ADR-0012). |
| Agentic turn loop | Planned | Tools, grounding, verification, chair, budgets; not one LLM call. |
| Notifications (Slack/email/webhook) | Planned | Run failures, budgets, digests. |

## 7. Policy and governance

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| Instance settings with bounds | Proven | Keep. |
| Per-repository / branch policy | Planned | Severity thresholds, publish mode, budgets, required reviewers. |
| Roles and membership | Planned (v1: owner/maintainer/reader; v1.x: SME/admin/viewer/auditor) | The wider model is scoped to org/repo/domain. **MVP has a single operator (the claimed owner) and no invites** — login exists, roles do not. |
| Audit trail | Proven (basic) | Replace with append-only audit + export. |
| Data retention and deletion | Planned | Per data class; export/delete. |
| Approval workflow for prompt changes | Planned | Four-eyes for security reviewers. |
| Egress and redaction receipt | Planned (v1; Q-033) | Per repo/turn: provider, model, tokens, redactions, withheld files, policy decision; the operator's privacy proof. |
| Cost budgets and alerts | Planned | Per repo/instance/period; estimates and alerts in v1. |
| Hard per-turn caps (tokens, tool calls, wall-clock) | Planned (MVP) | Server-enforced stop with a recorded reason; bounds spend and injection blast radius. |

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
| Kubernetes / Helm | Planned (v1.x) | Secondary target (ADR-0022): chart deploys app/worker/scheduler/migrations only; external Postgres+S3; ingress TLS; `kind` e2e gate. Compose stays the reference. |
| Air-gapped install | TBD | Local model + mirrored images; forge connectivity caveat. |
| Multi-installation / multi-tenant | TBD | One instance per org first. |

## 10. Quality and evaluation

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| Unit/integration/contract tests | Proven | Keep the discipline. |
| Accessibility harness | Proven | Keep; add browser matrix. |
| Evaluation harness v0 (≈20 labelled PRs, stub-model CI) | Planned (MVP) | Exists before the first release of review logic; regressions blocked. |
| Evaluation benchmark (golden PRs) | Planned (v1) | Precision/recall, acceptance, false positives, wrong-resolution rate; baseline vs single strong model. |
| Competitor teardown (e.g. PR-Agent) | Planned (docs) | Q-029; informs which capabilities are table stakes. |
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
| Resolution modes (`suggest` default; `auto`/`off`) | Planned | Agent proposes in suggest; human resolves natively/UI; auto guarded; SME/admin override; reopen on reply. |
| Manual-first triggering | Planned | `jury:pr-review`/`jury:branch-review` labels + Check Run actions + UI picker; no slash commands; no repo enable toggle. |
| Reviewer catalog + repo bindings | Planned | `required`/`default`/`capability` selection per repo; SME-owned/approved catalog; admin/SME bind, maintainer opt-in (ADR-0016). |
| No-reviewers fallback | Planned | Comment with setup/retrigger; no review posted. |
| Capability registry + `jury:cap:<id>` labels | Planned (v1.x) | Built-in/custom, one-level groups, every installed repo, SME draft/admin approve; capability reviewers only when requested. |
| Dynamic agent availability/router | Planned (v1.x) | Scope by repo/path/language/label; explicit request wins; record why. |
| PR review default + branch review | Planned (PR review MVP; branch review v1.x) | PR review is strict T0 diff-only; `jury:branch-review` compares to the default branch and reviews the full delta against context; estimate; cancellable. |
| Repository knowledge graph | Planned (v1.x) | Symbols/imports/tests/configs/docs/owners/findings; incremental updates; benchmark-gated (ADR-0018). |
| Context reuse across runs | Planned (session reuse MVP; graph summaries v1.x) | Reuse thread/session state and diff; graph summaries/content hashes only when the graph lands. |
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
| Per-repo reviewer catalog + required/default/capability bindings | Owner, 2026-11-15 | Planned | [`specs/reviewer-assignment-and-roles.md`](specs/reviewer-assignment-and-roles.md) |
| SME/admin reviewer ownership and approval | Owner, 2026-11-15 | Planned | [`specs/reviewer-assignment-and-roles.md`](specs/reviewer-assignment-and-roles.md) |
| No-reviewers fallback + retrigger | Owner, 2026-11-15 | Planned | [`specs/reviewer-assignment-and-roles.md`](specs/reviewer-assignment-and-roles.md) |
| Reviewer knowledge basis (skills/docs/links) | Owner, 2026-11-15 | Planned | [`specs/knowledge-system.md`](specs/knowledge-system.md) |
| V1 website control plane + session UI | Owner, 2026-11-15 | Planned | [`specs/v1-ui.md`](specs/v1-ui.md) |
| Provider model discovery, no free text | Owner, 2026-11-15 | Planned | [`specs/provider-model-discovery.md`](specs/provider-model-discovery.md) |
| Encrypted provider keys | Owner, 2026-11-15 | Planned | [`specs/provider-model-discovery.md`](specs/provider-model-discovery.md) |
| Resolution modes (`suggest` default; `auto`/`off`) + SME/admin override | Owner, 2026-11-15 | Planned | [`specs/agentic-review-sessions.md`](specs/agentic-review-sessions.md) |
| PR review default; branch review against default branch with context graph | Owner, 2026-11-15 | Planned | [`specs/repo-knowledge-graph.md`](specs/repo-knowledge-graph.md) |
| Incremental graph update every branch/T2 run | Owner, 2026-11-15 | Planned | [`specs/repo-knowledge-graph.md`](specs/repo-knowledge-graph.md) |
| Dockerized self-hosted backend + UI | Owner, 2026-11-15 | Planned | [`../architecture/deployment.md`](../architecture/deployment.md) |

> **TBD.** The owner will supply further capabilities later. Add a row with the source and a spec;
> do not implement a TBD capability from inference.

## 13. Backlog (candidates, not committed)

> **2026-11-15:** the owner asked for these to be recorded as backlog items that can be picked up.
> They were proposed by the architect during the capability review, not supplied as owner
> requirements. **Status: Backlog** — not in any release tier and not in `scope.md` until the owner
> promotes one. Promotion follows "How a capability becomes a feature" below (row here, spec, ADR if
> durable, owner approval). Do not implement from this table.
>
> **Tier note (ADR-0023):** the “suggested tier if promoted” column was written against the earlier
> platform-shaped v1. Under ADR-0023, read “v1” as **v1.x** unless the owner explicitly promotes the
> item into the trust loop.

| ID | Item | Suggested tier if promoted | Why | Entry criteria / notes |
| -- | ---- | -------------------------- | --- | ---------------------- |
| B-01 ([spec](specs/shadow-mode.md)) | **Shadow mode** — reviewers run on live PRs without posting; findings stored and compared with what human reviewers said and did | v1 | Builds operator trust before go-live; feeds the benchmark with real data; safe way to trial a new reviewer version. Preview/approve is per-publish and does not cover it. | Needs the session/finding store and the benchmark metrics (ADR-0018). Must document retention of unpublished findings and the cost of unpublished runs (budgeted). |
| B-02 ([spec](specs/provider-allowlist.md)) | **Per-repo provider allowlist (data classification)** — each repo is tagged with the providers/local models allowed to see its code | v1 | Clearest expression of the privacy thesis (e.g. "payments repo: local model only"). Egress policy and key-origin binding exist; repo-to-provider binding is not explicit. | Extends ADR-0011 and `security.md` egress policy; the router and reviewer binding must refuse a disallowed model with a visible reason, not fall back silently. |
| B-03 ([spec](specs/local-cli-review.md)) | **Local/CLI review of a diff** — e.g. `jury-forge review --diff` on a local branch or in CI, no PR or GitHub App required | v1.x | Lets people evaluate without the forge setup; same entry point can drive the evaluation harness; second input path beyond the forge. | Must stay forge-agnostic at the boundary (non-negotiable 8); document how local runs are audited and whether they create sessions. No hosted service. |
| B-04 ([spec](specs/large-pr-handling.md)) | **Large-PR handling** — when a PR exceeds the caps, say so and suggest a split or review order instead of truncating silently or failing | v1 | Hard caps exist (ADR-0018); the user-facing behaviour is unspecified. A silent partial review is a trust failure. | Spec the message, the "what was and was not reviewed" manifest, and the interaction with the no-misleading-clean-review rule. |
| B-05 ([spec](specs/reviewers-as-code.md)) | **Reviewers-as-code** — reviewer definitions, bindings, and policy exported or synced as YAML in git | v1.x | Versions, diffs, and four-eyes review via the normal PR flow; fits the audit story. UI studio remains. | Must not bypass catalog approval (ADR-0016): synced definitions land as drafts and still need SME/admin approval. Define conflict rules between UI and git. |
| B-06 ([spec](specs/history-seeded-conventions.md)) | **Seed conventions from history** — mine past human review comments into a draft knowledge pack for SME approval | Later | Speeds up "knows our standards". | Quality and privacy risks: review comments are untrusted data and may hold secrets or personal data; redaction and SME approval are mandatory. Needs the knowledge system (ADR-0017). |
| B-07 ([spec](specs/mcp-surface.md)) | **MCP surface** — expose findings to IDE/coding agents; let reviewers consume operator-configured MCP tools | Later | High demand from AI platform teams. | Widens the attack surface and egress; wait until the security phase (G2) is signed off. Tools must go through the same read-only, bounded, audited tool policy. |
| B-08 ([spec](specs/pr-walkthrough.md)) | **PR walkthrough / description generation** | Later (only if adoption feedback asks) | Competitors treat it as table stakes; cheap. | Not review; keep out of the wedge unless justified. Output is a proposal, never auto-written to the PR body without an explicit action. |

### Backlog capability breakdown

Each row is a capability that exists only if its backlog item is promoted. Status for every row is
**Backlog**. Detail, acceptance criteria, and security notes are in the linked spec.

| ID | Capability | Spec |
| -- | ---------- | ---- |
| B-01 | Per-binding/repo `shadow` mode: full pipeline, zero forge writes, findings stored as unpublished | [`shadow-mode.md`](specs/shadow-mode.md) |
| B-01 | Distinct "shadow ran, nothing published" status (no false no-reviewer fallback) | [`shadow-mode.md`](specs/shadow-mode.md) |
| B-01 | Shadow report per reviewer version: match vs human comments/commits, precision and recall proxies, cost, latency | [`shadow-mode.md`](specs/shadow-mode.md) |
| B-01 | SME/maintainer labelling of shadow findings; audited promote-to-live action | [`shadow-mode.md`](specs/shadow-mode.md) |
| B-02 | Provider zones assigned by admins; per-repo/org data policy (provider allowlist or minimum zone) | [`provider-allowlist.md`](specs/provider-allowlist.md) |
| B-02 | Enforcement at bind time, route time, and (authoritatively) call time; fail-closed; no silent provider fallback | [`provider-allowlist.md`](specs/provider-allowlist.md) |
| B-02 | Policy covers every repo-content model call (reviewer, chair, verifier, summarizers, branch/T2 context, mining) | [`provider-allowlist.md`](specs/provider-allowlist.md) |
| B-02 | Per-repo egress ledger (provider, model, tokens, decision; no content) | [`provider-allowlist.md`](specs/provider-allowlist.md) |
| B-03 | CLI client that sends a change set to the operator's instance; keys never on the client | [`local-cli-review.md`](specs/local-cli-review.md) |
| B-03 | Short-lived, scoped, revocable personal tokens; role-checked; audited | [`local-cli-review.md`](specs/local-cli-review.md) |
| B-03 | Outputs: text, JSON, Markdown, SARIF; severity-threshold exit codes for CI | [`local-cli-review.md`](specs/local-cli-review.md) |
| B-03 | Local review records (`source: cli`); repo mapping or admin-defined local profile | [`local-cli-review.md`](specs/local-cli-review.md) |
| B-04 | Coverage manifest on every turn (reviewed / partial / not reviewed, with reasons) | [`large-pr-handling.md`](specs/large-pr-handling.md) |
| B-04 | Over-budget strategy: prioritise, propose split into ordered chunks, continue per chunk | [`large-pr-handling.md`](specs/large-pr-handling.md) |
| B-04 | Minimum-coverage rule: never a clean pass below the repo threshold | [`large-pr-handling.md`](specs/large-pr-handling.md) |
| B-04 | Pre-run estimate comment for large manual triggers | [`large-pr-handling.md`](specs/large-pr-handling.md) |
| B-05 | YAML export/import of reviewers, versions, bindings, policy (no secrets) | [`reviewers-as-code.md`](specs/reviewers-as-code.md) |
| B-05 | Git-managed reviewers from a protected default branch of a config repo; all-or-nothing validated sync | [`reviewers-as-code.md`](specs/reviewers-as-code.md) |
| B-05 | Synced changes land as drafts needing normal catalog approval; commit SHA in provenance; drift view | [`reviewers-as-code.md`](specs/reviewers-as-code.md) |
| B-06 | Bounded, confirmed, redacted mining of human review comments into candidate rules with permalink evidence | [`history-seeded-conventions.md`](specs/history-seeded-conventions.md) |
| B-06 | SME accept/edit/reject; publish as immutable pack version; diff on re-run; no per-person stats | [`history-seeded-conventions.md`](specs/history-seeded-conventions.md) |
| B-07 | Read-only MCP server for findings, threads, summary, coverage; scoped tokens; no write tools | [`mcp-surface.md`](specs/mcp-surface.md) |
| B-07 | MCP client for reviewers: remote HTTP allowlisted servers, approved tool catalog, bounded and audited calls, untrusted results | [`mcp-surface.md`](specs/mcp-surface.md) |
| B-08 | Opt-in walkthrough comment (purpose, grouped changes, review order, hotspots, tests, coverage); not a review | [`pr-walkthrough.md`](specs/pr-walkthrough.md) |
| B-08 | Explicit, delimited description write-back (off by default) | [`pr-walkthrough.md`](specs/pr-walkthrough.md) |

Explicitly **not** backlog (already out or deferred): auto-fix/auto-merge, marketplace, multi-forge,
embeddings and cross-repo context (benchmark-gated; see ADR-0018).

## How a capability becomes a feature

1. Add or update a row here with the owner's source.
2. Write a spec in `docs/product/specs/<slug>.md` using the `product-spec` skill.
3. Write an ADR if the capability is durable or architectural.
4. Get the owner's approval at the human gate.
5. Only then implement, with acceptance criteria and a test plan.
