# Open questions

Questions that need an owner decision. Each has a **default assumption** so work can continue, and
a **close condition** so it does not float forever. Do not silently resolve these in code.

> **G0 (2026-11-16):** the owner accepted the default assumptions for **Q-028 and Q-032–Q-048**;
> they are closed and binding. Technology-related questions (for example Q-025 languages) move to
> Phase 1a.

| ID    | Question | Why it matters | Default assumption | Close condition |
| ----- | -------- | -------------- | ------------------ | --------------- |
| Q-001 | What are the final product capabilities the owner will provide? | The architecture and roadmap are provisional until they are known. | The 2026-11-15 agentic set: per-PR sessions, manual-first labels/Check Run/UI, capability-selectable reviewers, provider/model discovery, encrypted keys, **strict diff-only PR review**, branch review + graph in v1.1, `suggest` resolution with SME/admin override, Docker. | Owner delivers further capabilities; `docs/product/capabilities.md` is updated and an ADR records the scope. |
| Q-002 | Which deployment is the primary target: Docker Compose on a VPS, a single binary, or Kubernetes? | Determines the whole operations surface. | Docker Compose is the reference; Helm/Kubernetes ships in v1 as a secondary target (ADR-0022); the all-in-one container is a labelled evaluation mode (Q-030). | Deployment ADR accepted after the install spike. |
| Q-003 | Which database is the source of truth: PostgreSQL only, SQLite for small installs, or both? | Affects migrations, concurrency, full-text/vector search, backups. | PostgreSQL for the reference deployment; evaluate SQLite for a single-user mode. | Storage ADR accepted; migration path documented. |
| Q-004 | Is multi-tenancy in scope for v1, or one instance per organisation? | Changes auth, data model, and operations. | One instance per organisation for v1, but the data model carries an organisation/installation boundary so multi-installation can follow. | Product scope ADR accepted. |
| Q-005 | Do we need roles/teams in v1? | A self-hosted team product without roles is unsafe (F-029). | Yes: owner/admin/**SME**/maintainer/member/viewer/auditor, scoped per org/repo/domain. | Auth model ADR + authorization matrix. |
| Q-006 | Which forges are in v1? | Adapter shape and test matrix. | GitHub.com in v1; GitHub Enterprise Server in v1.1 (ADR-0018); GitLab is the next adapter. | Forge ADR accepted. |
| Q-007 | Which model providers are first-class? | Provider adapters and conformance tests. | OpenAI-compatible and Anthropic-compatible first (named vendors, e.g. CommandCode, are examples only); OpenAI-compatible, Anthropic-compatible, and one local server (Ollama/vLLM). | Provider ADR accepted (ADR-0011). |
| Q-008 | What is the publish policy? | Blocking a merge is a serious default; never blocking is weak. | Non-blocking by default; per-repo policy can request changes or set a check conclusion. | Policy ADR + UI spec. |
| Q-009 | Do we need a code index/RAG in v1 or v1.1? | It is the main quality differentiator and required for branch review. | Not for the first release: PR review is strict diff-only (T0). The incremental graph and branch review ship in v1.1 only if the benchmark justifies them (ADR-0018); embeddings deferred. | ADR-0014 + indexer spike + benchmark. |
| Q-010 | What is the evaluation benchmark? | Without it, "better" is unmeasurable. | A curated set of labelled PRs (bugs, security, tests, docs) plus a live dogfood repo; precision/recall and acceptance. | Benchmark spec + first baseline. |
| Q-011 | Is a hosted demo/cloud offering in scope? | The product is self-hosted; a demo still helps adoption. | A read-only demo instance with a fake forge and a local model; no central service for customer code. | Go-to-market decision. |
| Q-012 | What is the support matrix? | Self-hosted products live or die on supported environments. | **Confirmed 2026-11-15:** Ubuntu 24.04 LTS; Docker 24+ with Compose v2; amd64 + arm64; Postgres 16+; Node LTS if TypeScript. | Operations doc + CI matrix. |
| Q-013 | What telemetry, if any, is collected? | Trust is the product. | None by default; opt-in, documented, self-hostable collector, never code content. | Privacy ADR + settings UI. |
| Q-014 | What is the data retention default? | Code-bearing findings and prompts accumulate. | Configurable per data class; default 90 days for prompts/raw responses, keep findings until deleted; operator can change. | Retention ADR + delete/export flows. |
| Q-015 | What is the licence and contribution model? | MIT is decided; contribution mechanics are not. | MIT, no CLA, DCO-style sign-off optional, security policy and code of conduct before launch. | `CONTRIBUTING.md` + `SECURITY.md` merged. |
| Q-016 | What is the release cadence and versioning? | Self-hosters need predictable upgrades. | SemVer, monthly minor, patch as needed, signed images, changelog with migration notes. | Release ADR + first release. |
| Q-017 | Is a single maintainer + agent chain the delivery model? | Capacity planning and bus factor. | Yes for now; docs-first and automation are the mitigation. | Ongoing. |
| Q-018 | What does "self-hosted" mean for air-gapped environments? | Some buyers cannot reach the public internet. | Core review works with a local model and no telemetry; forge connectivity still requires network or a mirror. | Deployment doc + offline install test. |
| Q-019 | Which UI stack and design system? | The PoC's React/tokens/accessibility work is worth keeping. | React + a token-based design system + a small primitive layer; no heavy component framework until proven. | Frontend ADR. |
| Q-020 | What is the first paid-tier boundary, if any? | MIT core must stay useful. | No paid tier required; optional support/managed hosting can come later without closing the core. | Business decision; not a v1 blocker. |
| Q-021 | Which agent harness? | Session/loop/tool/human-in-the-loop state is the core. | Spike LangGraph.js + Postgres checkpointer; fallback thin Vercel AI SDK turn runner. | ADR-0010 spike result. |
| Q-022 | How does a user ask for a review? | Discoverability vs noise. | Check Run actions (`PR review` / `Branch review`) + `jury:pr-review`/`jury:branch-review` + `jury:cap:*` labels + UI picker; no slash commands. Reviewer picker is unsupported for arbitrary apps (tested). | ADR-0013 + check-run spike. |
| Q-023 | Must the user explicitly confirm before resolution, or can the agent judge satisfaction? | Premature resolves destroy trust. | `suggest` is the default: the agent proposes a resolution summary, the human resolves natively/UI. `auto` (opt-in) lets the agent judge with evidence + guard; `off` leaves it to humans. SMEs/admins override (owner decision 2026-11-15, ADR-0012). | Resolution guard tests + ADR-0012. |
| Q-024 | Automatic review policy: config-as-code only, or org UI? | Teams need a default without per-repo toggles. | `.jury-forge.yml` first; org defaults later. | ADR-0013 follow-up. |
| Q-025 | Which languages get deep symbols in v1.1? | Parser/indexing effort. | TS/JS first; Python/Go next; file/import/test graph for others. | Indexer spike + ADR-0014. |
| Q-026 | Graph store: Postgres adjacency vs a graph database? | Operational simplicity vs graph query power. | Postgres first; extract at measured scale. | ADR-0014. |
| Q-027 | Session/message retention? | Code-bearing conversations accumulate. | 90 days after merge/close; configurable. | Retention ADR + delete flow. |
| Q-028 | Who can trigger/resolve besides the bot? | Abuse and authorization. | Proposed answer: ADR-0024 §1 (write roles trigger; PR author replies on its own threads; others and bots never start a turn; forks skipped by default). Trigger: repo write/org role. Resolve: owner/admin any; SME in domain; maintainer reopen only; author/auditor read; every action audited. | Authz matrix + ADR-0012. |
| Q-029 | How do we differ from existing self-hostable AI reviewers (e.g. Qodo PR-Agent)? | Positioning, and which capabilities are table stakes vs differentiating. | Differentiators are the privacy/audit story, reviewer catalog with SME ownership, and guarded resolution; breadth is not. | Competitor teardown doc in `docs/analysis/` with sourced feature/licence comparison. |
| Q-030 | Is a single-container evaluation mode (one image, embedded or bundled Postgres) in the first release? | The Compose + Postgres + queue install is heavy for the small-team persona. | Documented as a labelled evaluation mode after the Compose path passes G1 (ADR-0003 option 2); not a separate architecture. | Clean-machine install spike with timings. |
| Q-031 | What are the default per-turn token/tool/wall-clock caps? | Bounds cost and injection blast radius. | Conservative defaults, operator-configurable; token/wall-clock are hard; tool caps apply to tool-enabled modes; currency only when priced. | Benchmark v0 results. |
| Q-032 | Does strict T0 allow `AGENTS.md`/`CONTRIBUTING.md` as a capped instruction input? | The default PR review currently cannot read the repo's own conventions, which contradicts the "knows our standards" promise. | **ADR-0023 (proposed) includes this:** a narrow T0 exception — fetch only those two files at the base SHA, cap ~8 KB each, trust-label them as instructions context; no other repo file read. | Owner confirms at G0; update the T0 tool list and knowledge-system. |
| Q-033 | Is the per-repo provider allowlist (B-02) in v1 or still backlog? | Egress policy and origin-bound keys exist, but per-repo data zones are the security buyer's proof. | **ADR-0023 (proposed):** the egress/redaction receipt is v1; the per-repo allowlist stays v1.x unless the first security buyer requires it. | Owner decides at G0; update capabilities tiers and security.md egress section if promoted. |
| Q-034 | Who is the primary ICP: 20–200 person org with a platform/security function, or the solo developer/homelab? | The v1 install (public domain, GitHub App, OAuth, Postgres) serves the former; P4 needs the evaluation mode. | **ADR-0023 (proposed):** primary ICP is the 20–200 person org with a platform/security function; P4 is served by the labelled evaluation mode, not a supported v1 install. | Owner confirms at G0; update vision/personas and the setup mode table. |
| Q-035 | Are validated suggested fixes MVP or v1? | The owner named "suggest fixes"; the current tier puts them in v1. | **Updated 2026-11-16 (Q-042):** single-hunk GitHub `suggestion` blocks validated against the reviewed SHA are v1; multi-file fixes v1.x; never MVP. | Owner confirms at G0; update capabilities.md §6 and the MVP list. |
| Q-036 | Should a starter/default jury auto-bind on install and on newly added repos? | The first interaction on an unbound repo is currently a "no reviewers configured" fallback, not a review. | **ADR-0023 (proposed):** a three-reviewer default jury on install (opt-out) and a one-click "bind starter jury" action on the fallback. | Owner confirms at G0; update reviewer-assignment §8, first-run setup, and scope. |
| Q-037 | Does PR review expand each hunk to its enclosing function (T0+)? | Strict T0 cuts hunks mid-function; PR-Agent's dynamic context does this cheaply. Reads only files already in the diff. | Yes, capped ~200 lines/hunk, deterministic, recorded in the coverage manifest. | Owner at G0; amend ADR-0019 rejection note. |
| Q-038 | Add a non-voting Verifier step before the chair? | Drops ungrounded findings; the market's precision lever. | Yes, v1. | Owner at G0; update ai-pipeline.md. |
| Q-039 | Are jury charges (natural-language pass/fail checks) v1? | CodeRabbit pre-merge checks are table stakes for gating. | Yes, v1, max 10 per repo by default. | Owner at G0. |
| Q-040 | Promote large-PR handling (B-04) to v1? | Silent partial reviews destroy trust. | Yes: deterministic fitting + coverage manifest. | Owner at G0. |
| Q-041 | Ingest existing CI SARIF results as juror evidence in v1? | Precision without running code. | Yes, read-only from the PR's check runs. Running analyzers ourselves is v1.x with an ADR. | Owner at G0. |
| Q-042 | Validated GitHub `suggestion` blocks in v1 (instead of v1.x)? | Table stakes in Copilot. | Yes, single-hunk only, applied-cleanly check in code. | Owner at G0; update Q-035. |
| Q-043 | Check Run merge-gate policy options? | Teams want gating without bot approvals. | `neutral` default; opt-in `failure` on unresolved critical or failed charge. | Owner at G0. |
| Q-044 | Instance model roles (`reasoning`/`fast`)? | Replies and classification on a cheap model halve cost. | Yes, v1. | Owner at G0; update ADR-0011. |
| Q-045 | Egress preview in v1 (replay stays v1.x)? | Security buyer's demo moment. | Yes. | Owner at G0. |
| Q-046 | Default retention? | Privacy promise needs numbers. | Raw prompts/responses 30 d; findings/receipts 1 y; configurable. | Owner at G0; update security.md. |
| Q-047 | First forge after GitHub? | Self-host buyers often run GitLab. | GHES, then GitLab self-managed. | Owner at G0; update roadmap v1.x order. |
| Q-048 | v1 hardware floor? | Footprint is a self-host buying criterion. | 2 vCPU / 4 GB / 20 GB for ≤20 devs, release-gated. | Owner at G0; update deployment.md. |

Backlog-specific questions are tracked inside their specs, not as global Q-IDs:
`SH-01…` (shadow mode), `PA-01…` (provider allowlist), `CLI-01…` (local CLI),
`LP-01…` (large PRs), `RC-01…` (reviewers-as-code), `HS-01…` (history-seeded conventions),
`MCP-01…` (MCP surface), `PW-01…` (PR walkthrough).

> **ID convention:** Q-xxx IDs in this table are global. Spec-local questions use a spec prefix
> (`AG-`, `KG-`, `SC-`, `RV-`, `KN-`, `UI-`, `SH-`, `PA-`, `CLI-`, `LP-`, `RC-`, `HS-`, `MCP-`, `PW-`).
> Promote a spec-local question to a global Q-ID when it blocks a cross-cutting decision.

## How to close a question

1. Write the options and trade-offs in an ADR.
2. Get the owner's decision (or record a default with a revisit date).
3. Update the affected docs and `docs/delivery/status.md`.
4. Delete the row from this table and link the ADR.

## Questions we should not answer yet

- Exact pricing, if any.
- Exact hosting partner, if any.
- Exact model vendor partnerships.
- A marketplace for reviewers or packs.
- Auto-fix or auto-merge.

These depend on the capability list and the first release's reception. Keeping them out of the
critical path is deliberate.
