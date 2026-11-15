# Status

Persistent project tracker and handoff. Update it as work lands, not retrospectively. Keep exactly
one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0 | Product definition and documentation | **in progress** |
| 1 | Foundation and walking skeleton | not started |
| 2 | Trust and security | not started |
| 3 | Review quality | not started |
| 4 | Operations and release | not started |
| 5 | v1 launch | not started |

## Current handoff

**Phase:** 0 — product definition and documentation.

**Branch:** `docs/poc-analysis-product-foundations`.

**Done this session (2026-11-15, ADR-0023 viability tests):**

- **Workstream A (quality spike): BLOCKED, not run.** Pre-registered protocol, prompts (hashed),
  config, and scoring rules are in `docs/analysis/quality-spike-2026-11-15.md`. Harness plumbing
  is in `spikes/quality/` (throwaway; 8/8 offline unit checks). No model was called, no dataset
  exists, and no decision is made.
- **Workstream B (install readiness): documentation dry run only.**
  `docs/analysis/install-readiness-2026-11-15.md` records 3 blockers, 1 likely defect, 13
  ambiguities, and 3 contradictions. Installability is **unproven**; no timing was taken.
- Found and fixed two bugs in the throwaway harness during the offline checks (path normalisation
  order; a mangled regex and a truncated module that were rewritten).

**Earlier session (2026-11-14/15):**

- Cloned and studied `PrakashSewani/jury-forge-poc` at `1cc22b7` (final `dev` commit).
- Read the PoC's product, architecture, design, decisions, development, roadmap, status, rework,
  tests, source, migrations, and CI.
- Completed a second, code-level pass through the Worker routes, libs, run engine, D1 schema,
  React data layer/UI, test suites, and scripts; the result is `docs/poc/code-review.md` and
  twelve additional findings (F-066–F-077).
- Captured the **live instance** read-only through D1: it is claimed and installed, with 47
  repositories (0 enabled), 0 reviewers, and 25 runs (23 skipped, 1 completed auto, 1 completed
  manual). Verified the only posted review (guinea-pig PR #3): 8/8 auto findings valid, 9/9 manual
  findings valid, and one critical issue outside the diff. Recorded in
  `docs/poc/live-instance.md`.
- Created the knowledge base:
  - `docs/poc/` — overview, architecture, behaviour, deployment, data model, API, decisions,
    testing, retrospective, code review.
  - `docs/analysis/` — flaw register (77 findings), risks, inherit/reject/rethink, open questions,
    assumptions.
  - `docs/product/` — vision, personas, principles, capabilities, scope, success metrics.
  - `docs/architecture/` — overview, components, data model, job pipeline, security, AI pipeline,
    extensibility, observability, operations, deployment.
  - `docs/delivery/` — roadmap, status, agent chain, ways of working, quality gates.
  - `docs/reference/` — glossary, sources.
  - `docs/decisions/` — ADR process and proposed decisions.
- Wrote `README.md`, `AGENTS.md`, and the MIT `LICENSE`.
- Added project skills under `.agents/skills/` and project agents under `.pi/agents/`, plus a
  chain prompt in `.pi/prompts/`.
- **Capability intake (2026-11-15):** the owner shifted the product to an **agentic reviewer** with
  per-PR sessions, manual-first triggering, dynamic multi-agent routing, provider/model discovery,
  encrypted keys, strict diff-only PR review, graph-backed branch review (v1.x), and resolution
  modes (`suggest` default). Captured in:
  - `docs/product/specs/agentic-review-sessions.md`
  - `docs/product/specs/provider-model-discovery.md`
  - `docs/product/specs/repo-knowledge-graph.md`
  - `docs/product/specs/session-capacity-and-visibility.md`
  - `docs/product/specs/reviewer-assignment-and-roles.md`
  - `docs/product/specs/knowledge-system.md`
  - `docs/product/specs/v1-ui.md`
  - `docs/architecture/tech-depth/branch-review.md`
  - `docs/architecture/agentic-review.md`
  - `docs/decisions/ADR-0010` … `ADR-0017`
  - `docs/product/capabilities.md`, `docs/product/scope.md`, `docs/delivery/roadmap.md`

**Verified (2026-11-15, this session):**

- `npm test` in `spikes/quality/`: 8 pass, 0 fail (offline; Node v24.19.0; no dependencies).
- Prompt and config SHA-256 hashes recorded before any run (quality-spike doc §2).
- Install dry run: file search found no compose file, Caddyfile, CLI, Dockerfile, release tag,
  minisign signature, or public key; cited lines were read and re-checked.
- Not verified: any model output, any scoring, any install on a host. Nothing here is a "works" claim.

**Verified earlier (2026-11-14/15):**

- All files written and inspected for links and paths.
- The PoC claims are cited to file/decision where practical; no PoC code was copied.
- The deep code pass added F-066–F-077 with file/function evidence (start/alarm ordering, previous
  findings from failed runs, pack request/zip limits, provider params, GitHub error mapping,
  unguarded JSON, pack atomicity, setup/claim atomicity, unbounded receivers, body limits, N×M
  reviewer query).
- Live evidence: the only posted review's 8 findings all check out against the PR code; the same
  Testing reviewer that failed with a provider 401 in the auto run succeeded in a manual try run
  with 9 valid findings; the reviewers were later deleted, leaving only UUIDs in run history.
- No product code, no dependencies, no secrets. The live queries were read-only; no instance
  configuration was changed.

**Owner decisions from the capability review (2026-11-15):**

- `jury:pr-review` is **strict T0 diff-only** (no repository file reads, no graph). Branch review is the full-context path (T2); ADR-0019 is **rejected**.
- Resolution defaults to **`suggest`**: the agent proposes, a human resolves natively in GitHub or the UI; `auto`/`off` are opt-in. No `/jury resolve`.
- **No slash commands in PR conversations.** Triggers are labels, Check Run actions, and the UI picker.
- Reviewer selection modes: `required` (always), `default` (plain review), `capability` (only when requested). Required overrides capability gating.
- Capabilities are first-class tenant objects: immutable `jury:cap:<id>` labels, one-level groups, SME-drafted/admin-approved custom capabilities, all active labels synced to every installed repo; disabled labels remain with a capability fallback.
- Hard per-turn token/tool/wall-clock caps; currency best-effort when pricing is known.
- CommandCode is an example provider, not a requirement.

**Capability/architecture review (2026-11-15, second pass):** ADR-0018 adds release tiering, eval harness v0, and hard caps in Phase 1. ADR-0019 was proposed and then rejected by the owner (strict T0). ADR-0012 is amended to `suggest` default with SME/admin override. Tiers, scope, roadmap, gates, capability registry/labels, and the backlog specs are aligned to these decisions. ADRs stay `proposed`/`rejected` until formally accepted at G0.

**Blocked by (2026-11-15):**

- **Quality spike (Workstream A):** no experiment provider key or model; no approved dataset or
  human ground truth; no written permission to send diffs to a provider. The guinea-pig PR is
  contaminated as a case (its findings were already seen). Owner items are in quality-spike §8.
- **Install readiness (Workstream B):** no runnable build. Doc defects to fix before any timed test:
  B1 Stage 2 needs OAuth credentials that Stage 3 creates; B2 origin TLS validation needs an `ask`
  authorization that does not exist yet; B3 no compose file, CLI, or signed release.

**Blocked by (earlier, G0):**

- G0 sign-off: the owner approves or amends ADR-0010–0019, ADR-0023, and the specs, and decides Q-032–Q-036, before implementation.
- The owner's final capability list (Q-001) may add or change scope before the gate.

**Backlog (2026-11-15):** eight candidate items (B-01–B-08: shadow mode, per-repo provider allowlist,
local/CLI diff review, large-PR handling, reviewers-as-code, history-seeded conventions, MCP surface,
PR walkthrough) are recorded in `capabilities.md` §13 with a capability breakdown and one spec each under
`product/specs/` (shadow-mode, provider-allowlist, local-cli-review, large-pr-handling,
reviewers-as-code, history-seeded-conventions, mcp-surface, pr-walkthrough); questions live
inside each spec (`SH-`, `PA-`, `CLI-`, `LP-`, `RC-`, `HS-`, `MCP-`, `PW-`). They are not committed,
not in any tier, and do not block G0.

**Next action (2026-11-15):** the owner supplies the quality-spike inputs in
`docs/analysis/quality-spike-2026-11-15.md` §8: an experiment provider and model (key via environment
variable only, with prices), five public PRs with a named ground-truth author, and written permission
to send those public diffs to that provider. Until then, Workstream A cannot produce a GO, NO-GO, or
CHANGE DIRECTION decision. Install-readiness fixes (B1–B3, D1) are a separate doc-edit step after
this gate.

**Next action (earlier):**

Owner G0 sign-off on ADR-0010–0019 and ADR-0023, plus decisions on Q-032–Q-036 (T0 instruction-file
exception, provider allowlist tier, primary ICP, suggested-fixes tier, starter/default jury). After the
gate, the first build is the **trust loop** (ADR-0023), not the platform: install → provider → default
jury → diff review → verdict/dissent → receipt → session → feedback. ADR-0019 is rejected and PR review
stays strict T0.

**Assessment fixes 2026-11-15 (fourth pass):**

- Fixed consistency contradictions: branch review removed from Phase 1 (v1.x); first-review target
  aligned at ≤15 min median / ≤60 min p90; false-resolve scoped to `auto`; context reuse redefined
  for T0/T2; viewer reply clarified as GitHub-native only; leftover `jury:full`/`jury:pause`
  removed; reviewer stepper aligned to eight steps; MVP `capability` selection clarified as UI-picker
  (the registry and `jury:cap:*` labels are v1).
- Added `docs/product/specs/jury-output.md`: jury composition, per-finding provenance, deliberation,
  preserved dissent, chair rule and verdict, display surfaces, acceptance criteria, metrics, and
  open questions (JO-01–JO-05). It is the missing signature experience for the product name.
- Added a **review contract** to the sessions spec and a **stalled-session policy** to session
  capacity (7-day flag, 30-day archive, no auto-resolve, no silent drop).
- Made diff-only explicit: it is the default for any repository with a bound/default jury; branch
  review is explicit and never auto-upgraded. A mode recommendation for high-risk PRs is recorded as
  proposed.
- Added proposed owner decisions: Q-032 (strict-T0 `AGENTS.md`/`CONTRIBUTING.md` exception), Q-033
  (per-repo provider allowlist in v1), Q-034 (primary ICP), Q-035 (suggested fixes MVP vs v1), Q-036
  (starter/default jury on install).
- Added capability rows: jury composition/dissent/verdict, per-finding feedback, and the egress and
  redaction receipt; clarified suggested fixes are v1, validated, and never auto-applied.
- **Direction decision (ADR-0023, proposed):** narrow v1 to the **trust loop** — install, provider,
  three built-in reviewers (Security/Correctness/Tests), diff + repo instruction files, evidence-backed
  verdict with dissent, auditable receipt, per-PR session, `suggest` resolution, one-click feedback,
  three roles, Compose, audit, backup. Defer catalog/studio, capability registry/labels, SME/admin
  roles, knowledge packs, graph/branch review, Helm, and seven roles to v1.x. `vision.md` and
  `scope.md` carry a direction banner pointing at ADR-0023; the full alignment is the next docs pass.
- **Trust-loop alignment (2026-11-15, fifth pass):** `scope.md` rewritten to the trust loop;
  `roadmap.md` re-phased (Phase 1 walking skeleton, Phase 2 trust loop, Phase 3 quality proof);
  `capabilities.md` re-tiered (MVP / v1 / v1.x / later) with platform rows marked v1.x;
  `personas.md` priority note (P1 primary, P4 evaluation-only, P5 v1.x); `v1-ui.md` reduced to nine
  pages; `first-run-setup.md` Stage 5 is now the default jury; `quality-gates.md` G1/G2 aligned;
  `success.md` adds progress/completion metrics; architecture and platform specs carry v1.x banners.
- **Progress and completion spec:** [`specs/review-progress-and-completion.md`](../product/specs/review-progress-and-completion.md)
  — the Check Run is the progress bar, the review is the completion, one placeholder comment is on by
  default for explicit manual triggers and edited in place, and there is no progress-comment stream;
  failure and cancellation are visible. The capability row is in `capabilities.md` §6 and the metrics
  are in `success.md`.

**Docs added 2026-11-15 (setup/deployment):**

- `docs/product/specs/first-run-setup.md` — preflight, bootstrap token, GitHub OAuth owner claim and
  login, App/installation selection, provider, first reviewer, first review, recovery, funnel.
- `docs/architecture/deployment.md` — rewritten: deployment matrix, GitHub-facing URL contract
  (webhook/OAuth/manifest), per-service ports/health/persistence, hardened Compose sketch, existing
  LB and external-service variants, egress, secrets, lifecycle, backups, sizing, open decisions.
- Aligned `capabilities.md`, `roadmap.md`, `security.md`, `operations.md`, `specs/README.md` so
  **GitHub OAuth login is MVP** and the public-origin requirement is explicit.

**Gap fixes 2026-11-15 (second pass):**

- ADR-0020 (install/update channel): signed release bundle, verify before extract; removed
  `curl | sh` from the docs. Ops install now uses `jury-forge verify` + `init`.
- Secrets use `*_FILE` paths (Docker secrets) in the reference Compose file; env-value secrets
  removed from the example.
- `TRUSTED_PROXIES` pinned to the Compose subnet (not `172.16.0.0/12`); reference `Caddyfile` added
  (webhook/SSE no-buffering, body limits, headers).
- Artefact storage clarified: the driver is optional (local volume default), the capability is not.
- Enterprise first-run blockers documented: org IP allowlist, SAML SSO, OAuth app restrictions,
  repo access policy, edge blocking — with typed errors and preflight warnings.
- Upgrade path: `--dry-run`, expected write pause, maintenance page, rollback safety conditions.
- Backup baseline stated (24 h RPO / 4 h RTO, proposed) instead of "TBD"; DEP-04/DEP-05 flagged for
  owner decision.
- MVP limit stated: single operator, no invites; roles in v1. Local/evaluation mode defaults to the
  fixture forge; branch-review egress hosts added.

**Owner answers 2026-11-15 (third pass):**

- Support matrix confirmed: Ubuntu 24.04 LTS, Docker 24+/Compose v2, amd64 + arm64 (Q-012/DEP-05).
- Backup baseline accepted: daily dump, 24 h RPO / 4 h RTO; WAL/PITR is the team/HA upgrade (DEP-04).
- Sub-path hosting decided unsupported (DEP-08); subdomain only.
- GitHub App permissions pinned to least privilege in the setup spec (contents read; pull requests,
  issues, checks write; metadata read; events listed). `members: read` stays out until org-role
  mapping ships.
- **Domain is a setup step:** new ADR-0021 — origin stored in Postgres, entered and validated in
  setup before the GitHub App, loopback-only bootstrap (`SETUP_BIND`), on-demand TLS with an `ask`
  allowlist, host enforcement (`421`), owner origin-change flow via `PATCH /app`. `PUBLIC_URL` env
  only freezes the origin.
- Signing tool chosen: minisign; releases hosted on GitHub Releases; no project download domain.
- Bare LAN/IP origins rejected (DEP-10); local/homelab uses the evaluation mode with a fixture forge
  or a tunnel + real domain.
- **Advanced deployment models in v1 — decided (Option 2, 2026-11-15; re-scoped to v1.x by ADR-0023):** A–D plus **E (Helm) in v1**
  (ADR-0022); F (air-gapped) stays out of v1. Updated ADR-0003, ADR-0022, capabilities/scope tiers,
  roadmap Phase 4, G4 gate, support matrix, deployment/operations docs, and the setup spec.
  Kubernetes 1.29+/Helm 3.14+, ingress-nginx tested, `kind` e2e required; chart ships no databases and
  no on-demand TLS; Compose stays the reference.

**Next evidence (optional):** the live instance is currently unconfigured (0 reviewers, 0 enabled
repositories). Enabling one repository and adding one reviewer with a key would produce a fresh
run and a full dashboard state; it is not required for G0, but it would close the remaining live
UI gap.

## G0 checklist

- [ ] Owner has read `docs/product/vision.md`, `scope.md`, `capabilities.md`, the specs index, and `analysis/flaws.md`.
- [ ] Owner has answered Q-001–Q-036 (or recorded defaults); backlog spec questions are optional.
- [ ] Owner has approved or amended ADR-0001–0003 and ADR-0010–0019 (ADR-0019 is rejected).
- [ ] Agent chain and skills are usable in the owner's harness.
- [ ] No unresolved contradiction between docs.

## Recent decisions

| ADR | Status | Summary |
| --- | ------ | ------- |
| ADR-0001 | accepted (owner directive) | Self-hosted, MIT, vendor-neutral. |
| ADR-0002 | accepted | The Cloudflare PoC is reference only. |
| ADR-0003 | proposed | Docker Compose is the reference deployment. |
| ADR-0004 | proposed | PostgreSQL is the source of truth. |
| ADR-0005 | proposed | TypeScript-first runtime for v1. |
| ADR-0006 | proposed | Queue + stateless workers, not per-run actors. |
| ADR-0007 | proposed | Token-aware context + retrieval. |
| ADR-0008 | proposed | Roles and trust boundaries. |
| ADR-0009 | accepted (owner directive) | MIT licence, no CLA. |
| ADR-0010 | proposed | Agent runtime harness: LangGraph.js spike, thin runner fallback. |
| ADR-0011 | proposed | Provider/model discovery; no free-text model; encrypted keys. |
| ADR-0012 | proposed | PR sessions; `suggest` default resolution, `auto`/`off` opt-in, SME/admin override. |
| ADR-0013 | proposed | Manual-first triggering and dynamic agent routing. |
| ADR-0014 | proposed | Strict diff-only PR review; branch review + graph in v1.x. |
| ADR-0015 | proposed | Session capacity, interface, roles, and visibility. |
| ADR-0016 | proposed | Reviewer catalog, repo bindings, SME roles, fallback (v1.x per ADR-0023). |
| ADR-0017 | proposed | Knowledge sources, snapshots, grants, retrieval. |
| ADR-0018 | proposed | Release tiering; eval harness + hard caps in Phase 1; graph/branch review v1.x. |
| ADR-0019 | rejected | T1 bounded reads for PR review; owner chose strict T0. |
| ADR-0020 | proposed | Install/update channel: signed release bundle, verify before extract, no pipe-to-shell. |
| ADR-0021 | proposed | Runtime-configured public origin; domain is a setup step, loopback bootstrap. |
| ADR-0022 | proposed | Helm chart in v1 (moved to v1.x by ADR-0023). |
| ADR-0023 | proposed | Product direction: the auditable review layer, not a review platform; v1 is the trust loop. |

## How to update this file

- Change the phase table only when a phase actually starts or ends.
- Keep "Done this session" to what landed in the current session; move history to a short
  `## History` section if it grows.
- "Verified" states what was run and observed, never "works".
- "Blocked by" names the exact question or dependency, not a vague concern.
- "Next action" is one concrete action, not a list.
