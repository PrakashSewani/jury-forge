# Open questions

Questions that need an owner decision. Each has a **default assumption** so work can continue, and
a **close condition** so it does not float forever. Do not silently resolve these in code.

> **G0 (2026-11-16):** the owner accepted the default assumptions for Q-028 and Q-032–Q-048; they are
> closed and binding. Phase 1a then decided the technology questions. Closed IDs are kept in the
> tables below so other documents can keep citing them. Only the rows in "Still open" need action.

## Still open

| ID    | Question | Why it matters | Default assumption | Close condition |
| ----- | -------- | -------------- | ------------------ | --------------- |
| Q-001 | What are the final product capabilities the owner will provide? | The architecture and roadmap are provisional until they are known. | The 2026-11-15 agentic set, extended by the 2026-11-16 deep dive: per-PR sessions, manual-first triggers, capability-selectable reviewers, provider/model discovery, encrypted keys, diff-only PR review, branch review + graph in v1.1, `suggest` resolution, Docker. | Owner delivers further capabilities; `docs/product/capabilities.md` is updated and an ADR records the scope. |
| Q-010 | What is the evaluation benchmark? | Without it, "better" is unmeasurable. | A curated set of labelled PRs (bugs, security, tests, docs) plus a live dogfood repo; precision/recall and acceptance. | Benchmark spec + first baseline (Phase 3). |
| Q-011 | Is a hosted demo/cloud offering in scope? | The product is self-hosted; a demo still helps adoption. | A read-only demo instance with a fake forge and a local model; no central service for customer code. | Go-to-market decision. |
| Q-017 | Is a single maintainer + agent chain the delivery model? | Capacity planning and bus factor. | Yes for now; docs-first and automation are the mitigation. | Ongoing. |
| Q-018 | What does "self-hosted" mean for air-gapped environments? | Some buyers cannot reach the public internet. | Core review works with a local model and no telemetry; forge connectivity still requires network or a mirror. | Deployment doc + offline install test. |
| Q-020 | What is the first paid-tier boundary, if any? | MIT core must stay useful. | No paid tier required; optional support/managed hosting can come later without closing the core. | Business decision; not a v1 blocker. |
| Q-030 | Is a single-container evaluation mode in the first release? | The Compose + Postgres + queue install is heavy for the small-team persona. | Documented as a labelled evaluation mode after the Compose path passes G1 (ADR-0003 option 2); not a separate architecture. | Clean-machine install spike with timings. |
| Q-049 | Does a GitHub-native resolve of a `critical` finding by a non-owner clear a `failure` merge gate? | ADR-0028 lets only the owner dismiss a critical finding in Jury Forge, but anyone with write access can resolve the thread in GitHub. | No: it is recorded as a human resolve, but only a verified fix (S2) or an owner dismissal clears the gate. | Owner confirms, or a pilot shows the rule blocks merges it should not. |
| Q-050 | How do ADR-0015's session numbers (20 turns/session soft, 3 consecutive agent turns without a human) combine with ADR-0024's budgets (40 turns/session/generation, 6 replies/thread, 10 reply turns/user/hour)? | Both ADRs were accepted at G0 with different numbers and neither amends the other. | Read together: ADR-0024's numbers are hard ceilings that stop with a hand-off; ADR-0015's 20 is a soft quota that only warns; its 3-consecutive rule stops automatic turns (v1 re-reviews on push) until a human acts. Recorded in `session-capacity-and-visibility.md` §3 (MVP spec review, 2026-11-27). | Owner confirms, or an ADR supersedes one set of numbers. |
| Q-031 | What are the default per-turn token/tool/wall-clock caps? | Bounds cost and injection blast radius. | Conservative defaults, operator-configurable; token/wall-clock are hard; tool caps apply to tool-enabled modes; currency only when priced. **Evidence (spike 2026-11-27, small synthetic diffs):** 680–920 output tokens per juror call, about half of it reasoning on `/chat/completions` (`/messages` reported no reasoning count); p90 12–27 s in the healthy modes; a runaway reached an 8000-token cap after about 100 s, so the output cap should sit well below that. | Benchmark v0 results. |

## Closed at G0 (2026-11-16)

The owner accepted these; they are binding.

| ID | Question | Decision | Recorded in |
| -- | -------- | -------- | ----------- |
| Q-028 | Who can trigger/resolve besides the bot? | Write roles (and the PR author on its own threads) trigger; others and bots never start a turn; forks skipped by default. Resolve: owner/admin any, SME in domain, maintainer reopen only, author/auditor read; every action audited. **v1 amended (2026-11-27):** maintainer accepts, dismisses, and reopens, except that only the owner dismisses or resolves a `critical` finding. | ADR-0024 §1, ADR-0012, ADR-0028 |
| Q-032 | Does diff-only allow `AGENTS.md`/`CONTRIBUTING.md` as a capped instruction input? | Yes: those two files only, at the base SHA, ~8 KB each, trust-labelled as instructions context; no other file read. **Amended (2026-11-27):** the S11 set of six instruction-file types, same rules, default on. | ADR-0023, ADR-0027, `product/specs/knowledge-system.md` |
| Q-033 | Is the per-repo provider allowlist (B-02) in v1? | No: the egress/redaction receipt is v1; the per-repo allowlist stays v1.x unless a buyer requires it. | ADR-0023 |
| Q-034 | Primary ICP? | The 20–200 person org with a platform/security function; the solo/homelab persona is served by the labelled evaluation mode. | ADR-0023, `product/vision.md`, `product/personas.md` |
| Q-035 | Are validated suggested fixes MVP or v1? | v1: single-hunk GitHub `suggestion` blocks validated against the reviewed SHA; multi-file fixes v1.x; never MVP. | ADR-0025 (Q-042), `product/capabilities.md` §6 |
| Q-036 | Starter/default jury on install? | A three-reviewer default jury on install (opt-out) plus a one-click "bind starter jury" action on the fallback. | ADR-0023, `product/specs/reviewer-assignment-and-roles.md` §8 |
| Q-037 | Does PR review expand each hunk to its enclosing function (T0+)? | Yes, in v1: ~200 lines per hunk, deterministic, recorded in the coverage manifest; reads only files already in the diff. | ADR-0025 §1 (narrows ADR-0019) |
| Q-038 | Add a non-voting verifier before the chair? | Yes, v1: `confirmed`/`unconfirmed`/`wrong`; it never votes or adds findings. | ADR-0025 §4 |
| Q-039 | Are jury charges (pass/fail checks) v1? | Yes, v1; max 10 per repo by default. | `product/specs/standout-features.md` (S12) |
| Q-040 | Promote large-PR handling (B-04)? | Yes: deterministic fitting + coverage manifest, and it is in the MVP. | ADR-0025 §2 |
| Q-041 | Ingest existing CI SARIF results as juror evidence? | Yes, v1, read-only from the PR's check runs; running analyzers ourselves is v1.x and needs an ADR. | ADR-0025 §3, `product/specs/standout-features.md` (S13) |
| Q-042 | Validated GitHub `suggestion` blocks in v1? | Yes, single-hunk only, with an applied-cleanly check in code. | ADR-0025 (Q-035) |
| Q-043 | Check Run merge-gate policy? | `neutral` by default; opt-in `failure` on unresolved critical findings or a failed charge. | `product/specs/jury-output.md` (Check Run policy) |
| Q-044 | Instance model roles (`reasoning`/`fast`)? | Yes, v1: `reasoning` for jurors/verifier/appeals, `fast` for classification and summaries. | ADR-0025 §5, ADR-0011 |
| Q-045 | Egress preview in v1? | Yes; replay stays v1.x. | `product/specs/standout-features.md` |
| Q-046 | Default retention? | Raw prompts/responses 30 d; findings and receipts 1 y; configurable. | ADR-0025, `architecture/security.md` |
| Q-047 | First forge after GitHub? | GHES, then GitLab self-managed. | `delivery/roadmap.md` v1.x, ADR-0018 |
| Q-048 | v1 hardware floor? | 2 vCPU / 4 GB / 20 GB for ≤20 developers, release-gated. | ADR-0026, `architecture/technical-approach.md` §6 |

## Closed at Phase 1a and earlier (2026-11-14 → 2026-11-16)

These were answered by an accepted ADR or an approved document. Listed so no one re-opens them by
accident.

| ID | Question | Decision | Recorded in |
| -- | -------- | -------- | ----------- |
| Q-002 | Which deployment is the primary target? | Docker Compose is the reference; the all-in-one mode is a labelled evaluation mode; the Helm chart is v1.2 and secondary. | ADR-0003, ADR-0022 as amended |
| Q-003 | Which database is the source of truth? | PostgreSQL only, for queue and artefacts too; a SQLite-backed single-user mode is explicitly not decided. | ADR-0004 |
| Q-004 | Multi-tenancy in v1? | One instance per organisation; the data model is tenant-scoped from day one. | ADR-0008 |
| Q-005 | Roles/teams in v1? | v1 ships owner/maintainer/reader; the full model is owner/admin/maintainer/viewer/auditor, with SME and catalog roles in v1.2. | ADR-0008, ADR-0023 |
| Q-006 | Which forges in v1? | GitHub.com in v1; GHES in v1.1; GitLab after that. | ADR-0018, ADR-0023 |
| Q-007 | Which model providers are first-class? | OpenAI-compatible and Anthropic-compatible HTTP APIs, plus a local server (Ollama/vLLM) behind the same boundary. | ADR-0011, ADR-0026 |
| Q-008 | What is the publish policy? | Non-blocking by default: the Check Run concludes `neutral`; per-repo policy may request changes or set `failure`. | `product/specs/jury-output.md`, Q-043 |
| Q-009 | Code index/RAG in v1 or v1.1? | v1.1, measurement-gated; embeddings deferred. | ADR-0014, ADR-0018 |
| Q-012 | What is the support matrix? | Ubuntu 24.04 LTS; Docker 24+/Compose v2; amd64 + arm64; Postgres 17 bundled, 16 tested; Node 24 LTS. | Owner confirmation 2026-11-15, ADR-0026 |
| Q-013 | What telemetry is collected? | None by default and no phone-home; `TELEMETRY=off`; optional and documented at most. | `architecture/deployment.md`, `architecture/observability.md`, AGENTS.md |
| Q-014 | Data retention default? | Superseded by Q-046: 30 d raw prompts/responses, 1 y findings and receipts. | Q-046, ADR-0025 |
| Q-015 | Licence and contribution model? | MIT, no CLA; `CONTRIBUTING.md` and `SECURITY.md` exist. | ADR-0009, repository root |
| Q-016 | Release cadence and versioning? | SemVer, signed images with SBOM and provenance, changelog with migration notes; no fixed calendar cadence is committed yet. | `architecture/technical-approach.md` §18, `delivery/ways-of-working.md` |
| Q-019 | Which UI stack and design system? | React 19 + Vite 8 + TanStack Router/Query, Radix + Tailwind, served by `app`. | ADR-0026 |
| Q-021 | Which agent harness? | None in v1: a thin turn runner on the `ai` SDK, with the provider gateway behind a port. | ADR-0010 as amended |
| Q-022 | How does a user ask for a review? | Check Run actions and `jury:*` mode/capability labels plus the UI picker; no slash commands. | ADR-0013 |
| Q-023 | Must the user confirm before resolution? | `suggest` is the default; `auto` is opt-in behind the evidence gate; `off` leaves it to humans. | ADR-0012, ADR-0024 |
| Q-024 | Automatic review policy: config-as-code or UI? | Opt-in config-as-code (`.jury-forge.yml` / `.github/jury-forge.yml`, org default later); no per-repo enable/disable UI. | ADR-0013 |
| Q-025 | Which languages get deep symbols? | Eight shipped grammars (TS/JS/TSX, Python, Go, Java, C#, Rust, Ruby, PHP); everything else uses the ±20-line fallback. | `architecture/technical-approach.md` §3.8 |
| Q-026 | Graph store: Postgres adjacency or a graph database? | Postgres adjacency first; a dedicated store only if measured scale demands it. | ADR-0014 |
| Q-027 | Session/message retention? | Included in Q-046: 30 d raw, 1 y findings and receipts, configurable. | Q-046 |
| Q-029 | How do we differ from existing self-hostable reviewers? | The privacy/audit story, jury + durable conversation, and the verifiable receipt; breadth is not the differentiator. | `analysis/competitive-landscape-2026-11-16.md` |

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
4. Move the row to a closed table with the ID, the decision, and where it is recorded.

## Questions we should not answer yet

- Exact pricing, if any.
- Exact hosting partner, if any.
- Exact model vendor partnerships.
- A marketplace for reviewers or packs.
- Auto-fix or auto-merge.

These depend on the capability list and the first release's reception. Keeping them out of the
critical path is deliberate.
