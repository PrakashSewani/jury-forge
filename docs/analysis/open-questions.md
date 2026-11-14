# Open questions

Questions that need an owner decision. Each has a **default assumption** so work can continue, and
a **close condition** so it does not float forever. Do not silently resolve these in code.

| ID    | Question | Why it matters | Default assumption | Close condition |
| ----- | -------- | -------------- | ------------------ | --------------- |
| Q-001 | What are the final product capabilities the owner will provide? | The architecture and roadmap are provisional until they are known. | The 2026-11-15 agentic set: per-PR sessions, manual-first triggers, dynamic agent routing, provider/model discovery, encrypted keys, diff-first + context graph, agent-only resolution, Docker. | Owner delivers further capabilities; `docs/product/capabilities.md` is updated and an ADR records the scope. |
| Q-002 | Which deployment is the primary target: Docker Compose on a VPS, a single binary, or Kubernetes? | Determines the whole operations surface. | Docker Compose is first-class; a single container is ideal later; Kubernetes is a later adapter. | Deployment ADR accepted after the install spike. |
| Q-003 | Which database is the source of truth: PostgreSQL only, SQLite for small installs, or both? | Affects migrations, concurrency, full-text/vector search, backups. | PostgreSQL for the reference deployment; evaluate SQLite for a single-user mode. | Storage ADR accepted; migration path documented. |
| Q-004 | Is multi-tenancy in scope for v1, or one instance per organisation? | Changes auth, data model, and operations. | One instance per organisation for v1, but the data model carries an organisation/installation boundary so multi-installation can follow. | Product scope ADR accepted. |
| Q-005 | Do we need roles/teams in v1? | A self-hosted team product without roles is unsafe (F-029). | Yes: at least owner/admin/maintainer/viewer/auditor, scoped per installation/repository. | Auth model ADR + authorization matrix. |
| Q-006 | Which forges are in v1? | Adapter shape and test matrix. | GitHub.com and GitHub Enterprise Server; GitLab is the next adapter. | Forge ADR accepted. |
| Q-007 | Which model providers are first-class? | Provider adapters and conformance tests. | CommandCode (OpenAI-compatible) first; OpenAI-compatible, Anthropic-compatible, and one local server (Ollama/vLLM). | Provider ADR accepted (ADR-0011). |
| Q-008 | What is the publish policy? | Blocking a merge is a serious default; never blocking is weak. | Non-blocking by default; per-repo policy can request changes or set a check conclusion. | Policy ADR + UI spec. |
| Q-009 | Do we need a code index/RAG in v1? | It is the main quality differentiator and now required for branch review. | Yes: incremental graph for symbols/imports/tests/configs; embeddings deferred until the benchmark. | ADR-0014 + indexer spike + benchmark. |
| Q-010 | What is the evaluation benchmark? | Without it, "better" is unmeasurable. | A curated set of labelled PRs (bugs, security, tests, docs) plus a live dogfood repo; precision/recall and acceptance. | Benchmark spec + first baseline. |
| Q-011 | Is a hosted demo/cloud offering in scope? | The product is self-hosted; a demo still helps adoption. | A read-only demo instance with a fake forge and a local model; no central service for customer code. | Go-to-market decision. |
| Q-012 | What is the support matrix? | Self-hosted products live or die on supported environments. | Linux + Docker Compose; x86_64 and arm64; Postgres 16+; Node LTS if TypeScript. | Operations doc + CI matrix. |
| Q-013 | What telemetry, if any, is collected? | Trust is the product. | None by default; opt-in, documented, self-hostable collector, never code content. | Privacy ADR + settings UI. |
| Q-014 | What is the data retention default? | Code-bearing findings and prompts accumulate. | Configurable per data class; default 90 days for prompts/raw responses, keep findings until deleted; operator can change. | Retention ADR + delete/export flows. |
| Q-015 | What is the licence and contribution model? | MIT is decided; contribution mechanics are not. | MIT, no CLA, DCO-style sign-off optional, security policy and code of conduct before launch. | `CONTRIBUTING.md` + `SECURITY.md` merged. |
| Q-016 | What is the release cadence and versioning? | Self-hosters need predictable upgrades. | SemVer, monthly minor, patch as needed, signed images, changelog with migration notes. | Release ADR + first release. |
| Q-017 | Is a single maintainer + agent chain the delivery model? | Capacity planning and bus factor. | Yes for now; docs-first and automation are the mitigation. | Ongoing. |
| Q-018 | What does "self-hosted" mean for air-gapped environments? | Some buyers cannot reach the public internet. | Core review works with a local model and no telemetry; forge connectivity still requires network or a mirror. | Deployment doc + offline install test. |
| Q-019 | Which UI stack and design system? | The PoC's React/tokens/accessibility work is worth keeping. | React + a token-based design system + a small primitive layer; no heavy component framework until proven. | Frontend ADR. |
| Q-020 | What is the first paid-tier boundary, if any? | MIT core must stay useful. | No paid tier required; optional support/managed hosting can come later without closing the core. | Business decision; not a v1 blocker. |
| Q-021 | Which agent harness? | Session/loop/tool/human-in-the-loop state is the core. | Spike LangGraph.js + Postgres checkpointer; fallback thin Vercel AI SDK turn runner. | ADR-0010 spike result. |
| Q-022 | How does a user ask for a review? | Discoverability vs noise. | Check Run actions (`PR review` / `Branch review`) + `jury:pr-review`/`jury:branch-review` labels; slash command fallback. Reviewer picker is unsupported for arbitrary apps (tested). | ADR-0013 + check-run spike. |
| Q-023 | Must the user explicitly confirm before resolution, or can the agent judge satisfaction? | Premature resolves destroy trust. | Agent judges with evidence + guard; explicit confirmation for ambiguous cases. | Resolution guard tests + ADR-0012. |
| Q-024 | Automatic review policy: config-as-code only, or org UI? | Teams need a default without per-repo toggles. | `.jury-forge.yml` first; org defaults later. | ADR-0013 follow-up. |
| Q-025 | Which languages get deep symbols in v1? | Parser/indexing effort. | TS/JS first; Python/Go next; file/import/test graph for others. | Indexer spike + ADR-0014. |
| Q-026 | Graph store: Postgres adjacency vs a graph database? | Operational simplicity vs graph query power. | Postgres first; extract at measured scale. | ADR-0014. |
| Q-027 | Session/message retention? | Code-bearing conversations accumulate. | 90 days after merge/close; configurable. | Retention ADR + delete flow. |
| Q-028 | Who can trigger/resolve besides the bot? | Abuse and authorization. | Repo write access; org roles; every action audited. | Authz matrix + ADR-0012. |

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
