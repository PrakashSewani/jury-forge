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

**Done this session (2026-11-14/15):**

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
  encrypted keys, strict diff-only PR review, graph-backed branch review (v1.1), and resolution
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

**Verified:**

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

**Blocked by:**

- G0 sign-off: the owner approves or amends ADR-0010–0019 and the specs before implementation.
- The owner's final capability list (Q-001) may add or change scope before the gate.

**Backlog (2026-11-15):** eight candidate items (B-01–B-08: shadow mode, per-repo provider allowlist,
local/CLI diff review, large-PR handling, reviewers-as-code, history-seeded conventions, MCP surface,
PR walkthrough) are recorded in `capabilities.md` §13 with a capability breakdown and one spec each under
`product/specs/` (shadow-mode, provider-allowlist, local-cli-review, large-pr-handling,
reviewers-as-code, history-seeded-conventions, mcp-surface, pr-walkthrough); questions live
inside each spec (`SH-`, `PA-`, `CLI-`, `LP-`, `RC-`, `HS-`, `MCP-`, `PW-`). They are not committed,
not in any tier, and do not block G0.

**Next action:**

Owner G0 sign-off on ADR-0010–0019 and the specs. After the gate, the first build is the manual
conversational walking skeleton; ADR-0019 is rejected and PR review stays strict T0.

**Next evidence (optional):** the live instance is currently unconfigured (0 reviewers, 0 enabled
repositories). Enabling one repository and adding one reviewer with a key would produce a fresh
run and a full dashboard state; it is not required for G0, but it would close the remaining live
UI gap.

## G0 checklist

- [ ] Owner has read `docs/product/vision.md`, `scope.md`, `capabilities.md`, the specs index, and `analysis/flaws.md`.
- [ ] Owner has answered Q-001–Q-031 (or recorded defaults); backlog spec questions are optional.
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
| ADR-0014 | proposed | Strict diff-only PR review; branch review + graph in v1.1. |
| ADR-0015 | proposed | Session capacity, interface, roles, and visibility. |
| ADR-0016 | proposed | Reviewer catalog, repo bindings, SME roles, fallback. |
| ADR-0017 | proposed | Knowledge sources, snapshots, grants, retrieval. |
| ADR-0018 | proposed | Release tiering; eval harness + hard caps in Phase 1; graph/branch review v1.1. |
| ADR-0019 | rejected | T1 bounded reads for PR review; owner chose strict T0. |

## How to update this file

- Change the phase table only when a phase actually starts or ends.
- Keep "Done this session" to what landed in the current session; move history to a short
  `## History` section if it grows.
- "Verified" states what was run and observed, never "works".
- "Blocked by" names the exact question or dependency, not a vague concern.
- "Next action" is one concrete action, not a list.
