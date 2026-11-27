# Capability backlog

This is the product capability map. **The owner will supply the final capability list later**;
this page is the current baseline, built from the PoC study and the product thesis. It is expected
to change. Every capability is either proven by the PoC, planned for Jury Forge, deferred, or
explicitly out of scope.

Status key: **Proven** (the PoC shipped a version; *(partial)* means only part of it),
**Planned** (in the target product; the tier is in brackets), **Deferred** (later, no tier yet),
**Out** (not this product), **Rejected** (considered and declined in an ADR), **TBD** (owner decision
pending), **Backlog** (candidate that can be picked up; not committed; see section 13), **Done** (a
documentation deliverable that exists).

## Release tiers (accepted at G0, 2026-11-16; ADR-0018/0023/0024/0025)

Nothing below is removed from the owner's list; it is sequenced. Status above says *what*; the tier
says *when*. PR review is diff-only: strict **T0** in the MVP, **T0+** from v1 (hunks expanded to the enclosing function inside files already in the diff, ADR-0025); branch review uses T2 (graph). T1 bounded reads stay rejected.

**Tier names:** **v1.1** = *depth* (quality and reach), **v1.2** = *platform* (org scale). **v1.x**
means either. Older docs that say v1.1 for the graph, branch review, or GHES are still correct.

| Tier | Theme | Capabilities |
| ---- | ----- | ------------ |
| **MVP / Phase 1** | *Safe loop*: one reviewer, a real conversation, nothing exploitable | Compose install + bootstrap; GitHub App; **GitHub OAuth login + first-owner claim**; provider add + `/models` discovery + encrypted keys + **model capability probe (ADR-0029)**; **one built-in reviewer** on a catalog model; manual trigger (`jury:pr-review` label, Check Run action, UI picker; no slash); **T0 diff review + base-SHA instruction files (S11)**; **large-PR fitting + coverage manifest**; one review per turn; Check Run progress/completion; reply → next turn; **`suggest` resolution**; one-click feedback; **ADR-0024 safety core: trigger authz, self-detection by App ID, bot/fork skip, turn budgets, finding fingerprints**; hard per-turn caps; session timeline; health/readiness; **eval harness v0 (stub model)**; licence check in CI. |
| **v1 — the trust loop** | *A review you can defend* | **Jury:** Security, Correctness, Tests + non-voting verifier; code-first chair; provenance, dissent, verdict; presets (`quick`/`standard`/`deep`) with a cost estimate; `reasoning`/`fast` model roles + prompt-cache ordering (ADR-0025). **Context:** T0+ enclosing-function expansion; linked-issue and CI SARIF evidence; base-SHA `.jury-forge.yml`; one org conventions pack (ADR-0017/0023). **Conversation:** full ADR-0024 (comment versioning, re-anchoring, evidence-gated `auto`, enforced budgets, GitHub write queue); appeal; verified-fixed; incremental review on push; originating-juror thread ownership; stalled-session policy. **Output:** noise budget; risk score; jury charges; validated `suggestion` blocks; fix-prompt handoff; Check Run merge-gate policy. **Learning:** reactions + implicit acceptance; repo memory (suppressions + human-confirmed facts); per-juror scorecard. **Trust:** signed, chained receipt; egress preview; secret redaction; origin-bound keys; retention defaults (30 d raw / 1 y findings and receipts); audit + export; owner/maintainer/reader. **Ops:** backup/restore including keys; N-1 upgrade and rollback; webhook reconciler; PR-checkbox trigger; bot-author defaults; sizing floor of 2 vCPU / 4 GB / 20 GB for ≤20 devs; injection corpus as a release gate. |
| **v1.1 — depth** | *Better reviews, more places* | Replay benchmark tooling and the public scorecard; **branch review + callers-of-changed-symbols index**, then the full graph (measurement-gated); sandboxed analyzer runs (own ADR); provider fallback; `code-review` skill folder; read-only MCP; SARIF upload; rule auto-tuning suggestions; **GHES**; CLI `--staged`. |
| **v1.2 — platform** | *Org scale* | Reviewer catalog + studio + approval; capability registry + `jury:cap:*` labels; SME/admin/viewer/auditor roles; knowledge packs, doc links, retrieval UI, signed packs; history-seeded conventions; OIDC; Helm; per-repo provider allowlists/data zones; analytics UI; notifications; **GitLab self-managed**. |
| **Later** | — | Gitea/Bitbucket; multi-installation; air-gapped; marketplace; cross-repo context; IDE/Slack surfaces. |

Branch review and the graph enter v1.1 only if post-v1 measurement (feedback + replay on real PRs)
shows T0+ PR review leaves meaningful recall on the table (ADR-0018/ADR-0023).

> **2026-11-16:** the owner accepted the deep-dive direction
> ([`../analysis/capability-deep-dive-2026-11-16.md`](../analysis/capability-deep-dive-2026-11-16.md)).
> The tiers were consolidated: the cheap safety controls moved into the MVP, v1 is grouped by
> theme, and v1.x is split into v1.1 (depth) and v1.2 (platform). If v1 must shrink, cut in this
> order: scorecard UI → linked issue → jury charges → suggestion blocks. Never cut ADR-0024, the
> verifier, the coverage manifest, or the receipt.

## 0. v1 trust-loop capabilities (ADR-0023/0024/0025, deep dive 2026-11-16)

The rows that define v1. They were accepted at G0 with the deep dive and had no row of their own
before 2026-11-27. "Deep dive" refers to the row numbers in
[`../analysis/capability-deep-dive-2026-11-16.md`](../analysis/capability-deep-dive-2026-11-16.md).

| Theme | Capability | Status | Source | Spec |
| ----- | ---------- | ------ | ------ | ---- |
| Jury | Default jury: Security, Correctness, Tests | Planned (v1; MVP has one reviewer) | ADR-0023, Q-036 | [`specs/reviewer-assignment-and-roles.md`](specs/reviewer-assignment-and-roles.md) §8 |
| Jury | Non-voting verifier (`confirmed`/`unconfirmed`/`wrong`) | Planned (v1) | ADR-0025 §4, Q-038 | [`../architecture/ai-pipeline.md`](../architecture/ai-pipeline.md) |
| Jury | Code-first chair (fingerprint merge, policy-capped severity, ranked) | Planned (v1) | ADR-0025 §4 | [`specs/jury-output.md`](specs/jury-output.md) |
| Jury | Presets `quick`/`standard`/`deep` with an up-front cost estimate (prices from the registry or an admin override; output estimates include the probed reasoning share; otherwise tokens + "cost unknown") | Planned (v1) | S7, ADR-0029 | [`specs/standout-features.md`](specs/standout-features.md) |
| Jury | Model roles `reasoning`/`fast` + prompt-cache prefix order. The probe's reasoning share shows whether a `fast` candidate is actually fast (DeepSeek V4.1 Flash spent about half its output on reasoning); caching was confirmed through CommandCode (51 of 90 calls) | Planned (v1) | ADR-0025 §5, Q-044, spike 2026-11-27 | — (spec gap; ADR-0025 §5 is the requirement) |
| Context | T0+ enclosing-function expansion (files already in the diff) | Planned (v1; MVP is strict T0) | ADR-0025 §1, Q-037 | [`../architecture/ai-pipeline.md`](../architecture/ai-pipeline.md) |
| Context | Base-SHA instruction files (the S11 set, default on) | Planned (MVP) | ADR-0027, S11 | [`specs/standout-features.md`](specs/standout-features.md) |
| Context | Large-PR fitting + coverage manifest | Planned (MVP) | ADR-0025 §2, Q-040 (B-04) | [`specs/large-pr-handling.md`](specs/large-pr-handling.md) |
| Context | Linked-issue and CI SARIF evidence ingest (trust-labelled) | Planned (v1) | ADR-0025 §3, Q-041, S13 | [`specs/standout-features.md`](specs/standout-features.md) |
| Context | Base-SHA `.jury-forge.yml` (policy, charges, presets) | Planned (v1) | Deep dive 2.4 | [`specs/agentic-review-sessions.md`](specs/agentic-review-sessions.md) |
| Context | One org conventions pack, cited `slug@hash` | Planned (v1) | ADR-0017, ADR-0023 | [`specs/knowledge-system.md`](specs/knowledge-system.md) |
| Conversation | Trigger authz, self-detection by App ID, bot/fork skip, turn budgets, fingerprints | Planned (MVP) | ADR-0024 §1, §2, §4 | [`specs/agentic-review-sessions.md`](specs/agentic-review-sessions.md) |
| Conversation | Comment versioning, re-anchoring, evidence-gated `auto`, enforced budgets, GitHub write queue | Planned (v1) | ADR-0024 §3, §5–§7 | [`specs/agentic-review-sessions.md`](specs/agentic-review-sessions.md) |
| Conversation | Appeal (author disputes; the jury re-deliberates once) | Planned (v1) | S1 | [`specs/standout-features.md`](specs/standout-features.md) |
| Conversation | Verified fixed (recheck only threads whose anchored code changed) | Planned (v1) | S2, ADR-0024 §5 | [`specs/standout-features.md`](specs/standout-features.md) |
| Conversation | Incremental review on push | Planned (v1) | Deep dive 7.4, ADR-0024 §5 | [`specs/agentic-review-sessions.md`](specs/agentic-review-sessions.md) |
| Conversation | Originating juror owns its thread; the chair answers PR-level questions | Planned (v1) | Deep dive 7.6 | — (spec gap) |
| Conversation | Stalled sessions: flag at 7 days, archive at 30, never auto-resolve | Planned (v1) | ADR-0023, deep dive 7.5 | [`scope.md`](scope.md) §3 |
| Output | Noise budget (default 7 inline comments; withheld findings in the receipt) | Planned (v1) | S3 | [`specs/standout-features.md`](specs/standout-features.md) |
| Output | Deterministic PR risk score with listed factors | Planned (v1) | S9 | [`specs/standout-features.md`](specs/standout-features.md) |
| Output | Jury charges (≤10 pass/fail checks from `.jury-forge.yml`) | Planned (v1) | S12, Q-039 | [`specs/standout-features.md`](specs/standout-features.md) |
| Output | Copy-fix-prompt handoff to the developer's own agent | Planned (v1) | S8 | [`specs/standout-features.md`](specs/standout-features.md) |
| Output | Check Run merge-gate policy (`neutral` default; opt-in `failure`) | Planned (v1) | Q-043, deep dive 6.6 | [`specs/jury-output.md`](specs/jury-output.md) §2 |
| Learning | Feedback from GitHub reactions + implicit acceptance | Planned (v1) | S10, deep dive 9.1 | [`specs/standout-features.md`](specs/standout-features.md) |
| Learning | Repo memory: suppressions + human-confirmed facts, visible and expiring | Planned (v1) | S4 | [`specs/standout-features.md`](specs/standout-features.md) |
| Trust | Signed, hash-chained review receipt; offline `receipt verify` | Planned (v1) | S5, ADR-0023 | [`specs/standout-features.md`](specs/standout-features.md) |
| Trust | Egress preview (no provider call) | Planned (v1) | Q-045, S6 | [`specs/standout-features.md`](specs/standout-features.md) |
| Trust | Retention defaults: 30 d raw, 1 y findings and receipts | Planned (v1) | Q-046 | [`../architecture/security.md`](../architecture/security.md) §10 |
| Triggers | PR-description checkbox trigger | Planned (v1) | Deep dive 2.3 | — (spec gap) |
| Triggers | Bot-author defaults (exclude Dependabot/Renovate, or `quick`) | Planned (v1) | Deep dive 2.7 | — (spec gap) |
| Ops | Webhook reconciler (re-enqueue missed triggers; sync human resolves) | Planned (v1) | Deep dive 2.8, 8.3 | [`../architecture/job-pipeline.md`](../architecture/job-pipeline.md) |
| Ops | Sizing floor 2 vCPU / 4 GB / 20 GB for ≤20 developers, release-gated | Planned (v1) | Q-048, ADR-0026 | [`../architecture/technical-approach.md`](../architecture/technical-approach.md) §6 |
| Quality | Injection corpus as a release gate | Planned (v1) | Deep dive 11.2 | [`../architecture/security.md`](../architecture/security.md) §9 |

Rows marked *spec gap* have no spec section yet; the source ADR or deep-dive row is the
requirement until the spec is updated; do not infer behaviour beyond it.

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
| Instance diagnostics and environment validation | Planned | Health, dependency checks, config lint, support bundle; each bound model's last capability probe (ADR-0029). |
| Local demo mode without a public URL | TBD | Would remove the tunnel requirement for evaluation. |
| One-click marketplace images | Deferred | Nice for adoption; not a substitute for Compose. |

## 2. Source control and events

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| GitHub pull-request events | Proven | opened, reopened, synchronize, ready_for_review. |
| Draft PR handling | Proven | Skip drafts. |
| Webhook signature verification and de-duplication | Proven | Keep. |
| Fork PR policy + OSS mode | Planned (MVP: skip by default + maintainer trigger, ADR-0024; OSS mode v1.2) | Skip / restricted / approve; explicit visibility for external contributors; no secrets or fork code execution; a maintainer can invite a review on a fork PR. |
| Repository discovery and enablement | Proven | Manual refresh; add installation events. No per-repo enable toggle for agentic review (ADR-0013). |
| Manual review trigger (Check Run action, labels, UI picker) | Planned (MVP; PR-description checkbox v1) | Available on any PR in an installed repo; Check Run + mode/capability labels; no slash commands; reviewer picker unsupported for arbitrary apps. |
| Automatic review policy (config-as-code) | Planned (v1; org defaults v1.x) | `.jury-forge.yml`; default off; manual bypasses the allowlist. |
| GitHub Checks / status / annotations | Planned | Gate merges, surface findings in CI. |
| SARIF export | Planned (v1.1; v1 only ingests CI SARIF as evidence) | Feed security dashboards. |
| GitHub Enterprise Server | Planned (v1.1) | Configurable API base; same App model where available. |
| GitLab / Gitea / Bitbucket adapters | Planned (GitLab self-managed v1.2); Deferred (Gitea/Bitbucket) | Forge interface from day one (Q-047). |
| Monorepo / path-aware routing | Planned | Different reviewers and policies per path. |

## 3. Agents and the jury

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| User-defined agents (name, instructions, rules) | Proven | Keep. |
| Per-agent model and provider binding | Proven | Keep; model from the catalog only (ADR-0011). v1 has one provider per instance (ADR-0023), so the v1 binding is per model. |
| Multiple agents per turn, in parallel | Proven | Keep; add limits, routing, and a deliberation stage. |
| Agent templates | Proven | Seven starters; keep as local prefill. |
| Agent versions and prompt diffs | Planned | Draft → active, rollback, prompt hash, run snapshot. |
| Reviewer catalog + approval | Planned (v1.2) | Org catalog; SME drafts/owns, admin approves; maintainer binds approved reviewers only when `allowMaintainerBindings` is on (ADR-0016). |
| Per-repo reviewer bindings | Planned (v1: the three default bindings; v1.2: catalog bindings) | Required/optional, path/language/label scope, budget; no binding = not available. |
| No-reviewers / no-match fallback | Planned | Comment with setup/retrigger; never a misleading clean review. |
| Capability agents + tool policy | Planned (T2, v1.1 with branch review) | Graph/tests/static tools for branch review; agent chooses verification; sandbox `tests.run`/`build.run` are later. |
| Reviewer creation studio (capabilities, model, tools, availability) | Planned (v1.2) | Capability tags, catalog model/endpoint, tool policy, optional repo binding, test/activate. |
| Capability labels (`jury:cap:*`) | Planned (v1.2) | Request a capability group only within the repo’s bound/approved reviewers. |
| Dynamic agent availability (repo/path/language/label scope) | Planned (v1.2) | Router selects the jury; no per-repo enable toggle (ADR-0013). |
| Path scope (include/exclude globs) | Proven | Keep; enforce at output. |
| Reference context paths | Proven; Planned (T2, v1.1) | Keep for branch review; PR review is diff-only (strict T0 in the MVP, T0+ from v1). |
| Cross-agent de-duplication and disagreement | Planned (v1) | The "jury" step. |
| Chair / consensus verdict | Planned (v1) | Deterministic code, not a prompt (ADR-0025 §4); its rules are printed in the receipt. Repo policy sets the severity cap and verdict policy; the rule itself is not configurable. |
| Confidence and evidence per finding | Planned (v1) | Grounding and scoring. |
| Suggested fixes (validated diff suggestions) | Planned (v1: single-hunk GitHub `suggestion` blocks validated against the reviewed SHA; multi-file v1.x) | Proposed, never auto-applied or auto-merged; validated against the reviewed SHA and the diff; acceptance measured. |
| Agent marketplace | Out (v1) | Local templates and packs only. |

## 4. Context and code intelligence

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| Diff context with budgets | Proven | Replace bytes with tokens. |
| Skip lockfiles/generated/binaries | Proven | Keep; make configurable. |
| Priority file ordering | Proven | Keep; model-aware. |
| Repository instruction files | Proven | PoC: `AGENTS.md` / `CONTRIBUTING.md`, opt-in. Jury Forge: the S11 set at the base SHA, on by default (ADR-0027, MVP). |
| Reference file fetch | Proven | Literal roots; add retrieval. |
| Symbol / import / dependency index | Planned (v1.1, measurement-gated) | Potential quality differentiator; justify with the benchmark before building (ADR-0018). |
| Bounded on-demand file reads for PR review (T1) | Rejected | T1 rejected (ADR-0019): no reads of files outside the diff and no graph. T0+ (enclosing-function expansion of files already in the diff) is accepted for v1 (ADR-0025). |
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
| Repo docs (AGENTS/CONTRIBUTING/ADRs/docs) at SHA | Planned (v1.2; v1 reads only base-SHA instruction files, ADR-0027) | Index + retrieve relevant sections; opt-in per repo. |
| Live doc links (allowlisted) + per-run snapshot | Planned (v1.2) | Live fetch at turn time with SSRF/rate/size guards; store the fetched copy for audit; stale fallback. |
| Capability-scoped knowledge grants | Planned | Org/repo/reviewer/capability; precedence; pin/latest. |
| Retrieval + citations | Planned | Relevant chunks under token budget; cite source/hash/path. |
| Never-quote files | Proven | Keep; audit. |
| Pinned versions / channels | Planned | Reproducible reviews. |
| Signed packs | Planned (v1.2) | Supply-chain trust. |
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
| Publish modes (comment / request changes / check / label) | Proven (partial) | PoC has instance-wide blocking; make per-policy. |
| Preview and edit before publish | Planned | For new prompts and sensitive repos. |
| Suppression / known false positives | Planned | Per repo and per finding. |
| Per-finding feedback (valid / wrong / fixed / duplicate) | Planned (MVP) | One-click signal on the finding; feeds the benchmark and the reviewer scorecard. |
| Review threading and resolution | Planned | Respect GitHub conversation state; `suggest` default (human resolves natively/UI), `auto`/`off` opt-in (ADR-0012). |
| Resolution policy (`suggest`/`auto`/`off`) + human override | Planned (MVP: `suggest` only; v1: evidence-gated `auto` and `off`; SME/admin override v1.2) | `suggest` default: agent proposes, human resolves natively/UI; `auto` guarded (ADR-0024 §6); who may override in the UI follows ADR-0028 (v1) and ADR-0012 (v1.2 roles); wrong-resolution rate measured. |
| Conversational PR sessions | Planned | Per-PR session, thread replies, context alive across days (ADR-0012). |
| Agentic turn loop | Planned | Tools, grounding, verification, chair, budgets; not one LLM call. |
| Notifications (Slack/email/webhook) | Planned (v1.2) | Run failures, budgets, digests. |

## 7. Policy and governance

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| Instance settings with bounds | Proven | Keep. |
| Per-repository / branch policy | Planned | Severity thresholds, publish mode, budgets, required reviewers. |
| Roles and membership | Planned (v1: owner/maintainer/reader; v1.2: SME/admin/viewer/auditor) | The wider model is scoped to org/repo/domain. **MVP has a single operator (the claimed owner) and no invites** — login exists, roles do not. |
| Audit trail | Proven (partial) | Replace with append-only audit + export. |
| Data retention and deletion | Planned | Per data class; export/delete. |
| Approval workflow for prompt changes | Planned | Four-eyes for security reviewers. |
| Egress and redaction receipt | Planned (v1; Q-033, Q-045) | Per repo/turn: provider, model, tokens, redactions, withheld files, policy decision; the operator's privacy proof. |
| Cost budgets and alerts | Planned | Per repo/instance/period; estimates and alerts in v1. Prices come from the registry or an admin override, because a provider's `/models` may have none (CommandCode has none); an unpriced model gets a token-only budget and "cost unknown". |
| Hard per-turn caps (tokens, tool calls, wall-clock) | Planned (MVP) | Server-enforced stop with a recorded reason; bounds spend and injection blast radius. Output caps budget for reasoning tokens (about half the output on `/chat/completions` for the spike model; a 5-token cap returned nothing), and `finish=length` on structured output is a failure, not a repair (ADR-0029). Defaults: Q-031. |

## 8. Providers and models

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| OpenAI-compatible chat | Proven | Keep. |
| Anthropic-compatible messages | Proven | Keep. |
| Local model servers | Planned | OpenAI-compatible path; document Ollama/vLLM. Probed like any other model (ADR-0029); spike S-C has not covered Ollama yet. |
| Structured output / JSON schema | Planned (MVP) | The mode is chosen per provider, model, and endpoint by the capability probe — forced tool call, native schema, or prompt JSON with one repair — not by claimed support (ADR-0029). Spike: forced tool 18/18; native `json_schema` 16/18 with a runaway on empty results; Anthropic `output_format` ignored by CommandCode (0/18). |
| Streaming | Planned | Latency and UX. Not covered by the 2026-11-27 spike; probe before relying on it. |
| Tool use / function calling | Planned (v1.1, branch review) | Retrieval, verification, suggestions. PR review (T0/T0+) runs no tools; a forced tool call may be used only as a structured-output mode chosen by the probe (ADR-0029). |
| Provider capability registry | Planned | Windows, prices, features, health. Features are claims until a capability probe verifies them on this instance (ADR-0029). |
| Provider model discovery | Planned (MVP) | Fetch `/models`; no free-text model input (ADR-0011). `/models` never validates a key on its own: some providers answer without one (spike 2026-11-27). |
| Model capability probe | Planned (MVP) | Before a model is bound, a budgeted probe on synthetic fixtures checks auth, picks the structured-output mode that actually works, and records reasoning share, caching, and latency (ADR-0029). |
| Model catalog + registry enrichment | Planned (MVP) | Provider truth + context/prices; capabilities are claimed by the registry and verified by the probe; unknown models flagged. |
| Encrypted, write-only provider keys | Planned | Envelope encryption, origin binding, rotation, audit. |
| Per-provider concurrency and rate limits | Planned | Protect the provider and the bill. 429 → backoff; errors are classified by HTTP status, because one provider returned two different 401 body shapes (spike 2026-11-27). |
| Provider fallback / routing | Planned (v1.1) | Per reviewer first; org-level later. |
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
| Kubernetes / Helm | Planned (v1.2) | Secondary target (ADR-0022): chart deploys app/worker/scheduler/migrations only; external Postgres+S3; ingress TLS; `kind` e2e gate. Compose stays the reference. |
| Air-gapped install | TBD | Local model + mirrored images; forge connectivity caveat. |
| Multi-installation / multi-tenant | TBD | One instance per org first. |

## 10. Quality and evaluation

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| Unit/integration/contract tests | Proven | Keep the discipline. |
| Accessibility harness | Proven | Keep; add browser matrix. |
| Evaluation harness v0 (≈20 labelled PRs, stub-model CI) | Planned (MVP) | Exists before the first release of review logic; regressions blocked. |
| Evaluation benchmark (golden PRs + replay) | Planned (Phase 3 / G3 with the internal replay tool; public replay UI + scorecard v1.1) | Precision/recall, acceptance, false positives, wrong-resolution rate; baseline vs single strong model (Q-010, roadmap Phase 3, WP 3-03). |
| Competitor teardown (e.g. PR-Agent) | Done | Q-029 closed; [`../analysis/competitive-landscape-2026-11-16.md`](../analysis/competitive-landscape-2026-11-16.md). |
| Per-reviewer scorecards | Planned | Which roles earn their keep. |
| A/B prompt experiments | Planned | Versioned prompts, measured. |
| Feedback capture | Planned | Helpful / wrong / fixed, with reasons. |
| Cost/latency budgets in CI | Planned | Deterministic stub model. |
| Fault-injection tests | Planned | Duplicate, crash, publish-then-fail, cancel. |
| Security test suite (prompt injection, SSRF, authz) | Planned | First-class. |

## 11. Agentic sessions (owner directive, 2026-11-15)

| Capability | Status | Notes |
| ---------- | ------ | ----- |
| Per-PR durable session | Planned (MVP) | One session per PR; threads, messages, findings, turns, generations. |
| User reply → agent response | Planned (MVP) | GitHub review-comment/issue-comment events; debounce/coalesce; no parallel turns. |
| Resolution modes (`suggest` default; `auto`/`off`) | Planned (MVP `suggest`; v1 `auto`/`off`) | Agent proposes in suggest; human resolves natively/UI; auto guarded; SME/admin override; reopen on reply. |
| Manual-first triggering | Planned (MVP; `jury:branch-review` v1.1) | `jury:pr-review`/`jury:branch-review` labels + Check Run actions + UI picker; no slash commands; no repo enable toggle. |
| Reviewer catalog + repo bindings | Planned (v1.2) | `required`/`default`/`capability` selection per repo; SME-owned/approved catalog; admin/SME bind, maintainer opt-in (ADR-0016). |
| No-reviewers fallback | Planned (v1) | Comment with setup/retrigger; no review posted. |
| Capability registry + `jury:cap:<id>` labels | Planned (v1.2) | Built-in/custom, one-level groups, every installed repo, SME draft/admin approve; capability reviewers only when requested. |
| Dynamic agent availability/router | Planned (v1.2) | Scope by repo/path/language/label; explicit request wins; record why. |
| PR review default + branch review | Planned (PR review MVP; branch review v1.1, measurement-gated) | PR review is diff-only (strict T0 in the MVP, T0+ from v1); `jury:branch-review` compares to the default branch and reviews the full delta against context; estimate; cancellable. |
| Repository knowledge graph | Planned (v1.1) | Symbols/imports/tests/configs/docs/owners/findings; incremental updates; measurement-gated (ADR-0018). |
| Context reuse across runs | Planned (session reuse MVP; graph summaries v1.1) | Reuse thread/session state and diff; graph summaries/content hashes only when the graph lands. |
| Session inbox / conversation UI | Planned (MVP basic timeline; v1 inbox sorted by risk) | Timeline, agent activity, tool calls, findings, cost, resolve state. |
| Dockerized backend + UI | Planned (MVP) | Compose reference; Postgres/queue/object storage; no Cloudflare. |

## 12. Owner-supplied capabilities

> **2026-11-15:** the owner supplied the agentic-review capability set. The rows below are the
> source; the specs and ADRs are the plan.

| Capability | Source | Status | Spec |
| ---------- | ------ | ------ | ---- |
| Agentic reviewer, not a single LLM call | Owner, 2026-11-15 | Planned (MVP) | [`specs/agentic-review-sessions.md`](specs/agentic-review-sessions.md) |
| Per-PR session with replies and live context | Owner, 2026-11-15 | Planned (MVP) | [`specs/agentic-review-sessions.md`](specs/agentic-review-sessions.md) |
| Manual trigger above all installed repos | Owner, 2026-11-15 | Planned (MVP) | [`specs/agentic-review-sessions.md`](specs/agentic-review-sessions.md) |
| Dynamic multi-agent availability | Owner, 2026-11-15 | Planned (v1.2) | [`specs/agentic-review-sessions.md`](specs/agentic-review-sessions.md) |
| Per-repo reviewer catalog + required/default/capability bindings | Owner, 2026-11-15 | Planned (v1.2) | [`specs/reviewer-assignment-and-roles.md`](specs/reviewer-assignment-and-roles.md) |
| SME/admin reviewer ownership and approval | Owner, 2026-11-15 | Planned (v1.2) | [`specs/reviewer-assignment-and-roles.md`](specs/reviewer-assignment-and-roles.md) |
| No-reviewers fallback + retrigger | Owner, 2026-11-15 | Planned (v1) | [`specs/reviewer-assignment-and-roles.md`](specs/reviewer-assignment-and-roles.md) |
| Reviewer knowledge basis (skills/docs/links) | Owner, 2026-11-15 | Planned (v1: instruction files + one pack; rest v1.2) | [`specs/knowledge-system.md`](specs/knowledge-system.md) |
| V1 website control plane + session UI | Owner, 2026-11-15 | Planned (v1; MVP subset) | [`specs/v1-ui.md`](specs/v1-ui.md) |
| Provider model discovery, no free text | Owner, 2026-11-15 | Planned (MVP) | [`specs/provider-model-discovery.md`](specs/provider-model-discovery.md) |
| Encrypted provider keys | Owner, 2026-11-15 | Planned (MVP) | [`specs/provider-model-discovery.md`](specs/provider-model-discovery.md) |
| Resolution modes (`suggest` default; `auto`/`off`) + SME/admin override | Owner, 2026-11-15 | Planned (MVP `suggest`; v1 `auto`/`off`; SME/admin v1.2) | [`specs/agentic-review-sessions.md`](specs/agentic-review-sessions.md) |
| PR review default; branch review against default branch with context graph | Owner, 2026-11-15 | Planned (PR review MVP; branch review v1.1) | [`specs/repo-knowledge-graph.md`](specs/repo-knowledge-graph.md) |
| Incremental graph update every branch/T2 run | Owner, 2026-11-15 | Planned (v1.1, measurement-gated) | [`specs/repo-knowledge-graph.md`](specs/repo-knowledge-graph.md) |
| Dockerized self-hosted backend + UI | Owner, 2026-11-15 | Planned (MVP) | [`../architecture/deployment.md`](../architecture/deployment.md) |

> **TBD.** The owner will supply further capabilities later. Add a row with the source and a spec;
> do not implement a TBD capability from inference.

## 13. Backlog (candidates and promotions)

> **2026-11-15:** the owner asked for these to be recorded as backlog items that can be picked up.
> They were proposed by the architect during the capability review, not supplied as owner
> requirements. **Status: Backlog** — not in any release tier and not in `scope.md` until the owner
> promotes one.
>
> **Promotions (G0, 2026-11-16).** Accepting the deep dive and its tiers promoted parts of the
> backlog; the rest stays Backlog:
>
> | ID | Promotion | Decided by |
> | -- | --------- | ---------- |
> | B-04 | **Promoted to the MVP:** deterministic fitting + coverage manifest | Q-040, ADR-0025 §2 |
> | B-03 | **Promoted to v1.1:** `jury-forge review --staged` CLI against the operator's instance | Deep dive 14.1, tier table |
> | B-07 | **Promoted to v1.1 (reviewer side only):** read-only, allowlisted MCP servers per reviewer; the findings server stays Backlog | Deep dive 4.6, tier table |
> | B-02 | **Promoted to v1.2:** per-repo provider allowlists / data zones (earlier if a security buyer requires it) | Q-033, roadmap v1.2 |
> | B-06 | **Promoted to v1.2:** history-seeded draft conventions pack | Deep dive 5.5, tier table |
> | B-01, B-05, B-08 | Still Backlog. B-08 is partly covered by the v1 three-line review summary (deep dive 3.7) | — |
>
> A promoted item still needs its spec approved before implementation. Promotion follows "How a capability becomes a feature" below (row here, spec, ADR if
> durable, owner approval). Do not implement from this table.
>
> **Tier note (ADR-0023):** the “suggested tier if promoted” column was written against the earlier
> platform-shaped v1. Under ADR-0023, read “v1” as **v1.x** unless the owner explicitly promotes the
> item into the trust loop.

| ID | Item | Suggested tier if promoted | Why | Entry criteria / notes |
| -- | ---- | -------------------------- | --- | ---------------------- |
| B-01 ([spec](specs/shadow-mode.md)) | **Shadow mode** — reviewers run on live PRs without posting; findings stored and compared with what human reviewers said and did | v1 | Builds operator trust before go-live; feeds the benchmark with real data; safe way to trial a new reviewer version. Preview/approve is per-publish and does not cover it. | Needs the session/finding store and the benchmark metrics (ADR-0018). Must document retention of unpublished findings and the cost of unpublished runs (budgeted). |
| B-02 ([spec](specs/provider-allowlist.md)) | **Per-repo provider allowlist (data classification)** — each repo is tagged with the providers/local models allowed to see its code | **Promoted: v1.2** | Clearest expression of the privacy thesis (e.g. "payments repo: local model only"). Egress policy and key-origin binding exist; repo-to-provider binding is not explicit. | Extends ADR-0011 and `security.md` egress policy; the router and reviewer binding must refuse a disallowed model with a visible reason, not fall back silently. |
| B-03 ([spec](specs/local-cli-review.md)) | **Local/CLI review of a diff** — e.g. `jury-forge review --diff` on a local branch or in CI, no PR or GitHub App required | **Promoted: v1.1** (`--staged`) | Lets people evaluate without the forge setup; same entry point can drive the evaluation harness; second input path beyond the forge. | Must stay forge-agnostic at the boundary (non-negotiable 8); document how local runs are audited and whether they create sessions. No hosted service. |
| B-04 ([spec](specs/large-pr-handling.md)) | **Large-PR handling** — when a PR exceeds the caps, say so and suggest a split or review order instead of truncating silently or failing | **Promoted: MVP** (Q-040) | Hard caps exist (ADR-0018); the user-facing behaviour is unspecified. A silent partial review is a trust failure. | Spec the message, the "what was and was not reviewed" manifest, and the interaction with the no-misleading-clean-review rule. |
| B-05 ([spec](specs/reviewers-as-code.md)) | **Reviewers-as-code** — reviewer definitions, bindings, and policy exported or synced as YAML in git | v1.x | Versions, diffs, and four-eyes review via the normal PR flow; fits the audit story. UI studio remains. | Must not bypass catalog approval (ADR-0016): synced definitions land as drafts and still need SME/admin approval. Define conflict rules between UI and git. |
| B-06 ([spec](specs/history-seeded-conventions.md)) | **Seed conventions from history** — mine past human review comments into a draft knowledge pack for SME approval | **Promoted: v1.2** | Speeds up "knows our standards". | Quality and privacy risks: review comments are untrusted data and may hold secrets or personal data; redaction and SME approval are mandatory. Needs the knowledge system (ADR-0017). |
| B-07 ([spec](specs/mcp-surface.md)) | **MCP surface** — expose findings to IDE/coding agents; let reviewers consume operator-configured MCP tools | **Promoted: v1.1** (reviewer MCP client only); findings server Later | High demand from AI platform teams. | Widens the attack surface and egress; wait until the security phase (G2) is signed off. Tools must go through the same read-only, bounded, audited tool policy. |
| B-08 ([spec](specs/pr-walkthrough.md)) | **PR walkthrough / description generation** | Later (only if adoption feedback asks) | Competitors treat it as table stakes; cheap. | Not review; keep out of the wedge unless justified. Output is a proposal, never auto-written to the PR body without an explicit action. |

### Backlog capability breakdown

Each row is a capability that exists only if its backlog item is promoted. Status is **Backlog**
unless the promotions table above tiers it: the B-04 coverage-manifest row is MVP (fitting per
ADR-0025 §2; the split, threshold, and estimate rows are not tiered), the B-03 rows are v1.1, the B-07
reviewer-client row is v1.1, and the B-02 and B-06 rows are v1.2. Detail, acceptance criteria, and security notes are in the linked spec.

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
embeddings and cross-repo context (measurement-gated; see ADR-0018).

## How a capability becomes a feature

1. Add or update a row here with the owner's source.
2. Write a spec in `docs/product/specs/<slug>.md` using the `product-spec` skill.
3. Write an ADR if the capability is durable or architectural.
4. Get the owner's approval at the human gate.
5. Only then implement, with acceptance criteria and a test plan.
