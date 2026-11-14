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
  encrypted keys, diff-first + full-repo graph reviews, and agent-only resolution. Captured in:
  - `docs/product/specs/agentic-review-sessions.md`
  - `docs/product/specs/provider-model-discovery.md`
  - `docs/product/specs/repo-knowledge-graph.md`
  - `docs/architecture/agentic-review.md`
  - `docs/decisions/ADR-0010` … `ADR-0014`
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

**Blocked by:**

- The owner's further capability list (`docs/product/capabilities.md`, Q-001) — the 2026-11-15 set is
  captured, but more may follow.
- Owner decisions on the harness spike (Q-021), trigger surface (Q-022), resolution semantics
  (Q-023), automatic policy (Q-024), graph languages (Q-025), and the existing deployment/storage/
  runtime/tenancy questions (Q-002–Q-005).

**Next action:**

The owner reviews the agentic specs and ADRs, approves the harness spike (ADR-0010), the manual
trigger/router (ADR-0013), the session/resolution model (ADR-0012), provider discovery (ADR-0011),
and the incremental graph (ADR-0014). Implementation follows the G0 gate; the first build is the
manual conversational walking skeleton.

**Next evidence (optional):** the live instance is currently unconfigured (0 reviewers, 0 enabled
repositories). Enabling one repository and adding one reviewer with a key would produce a fresh
run and a full dashboard state; it is not required for G0, but it would close the remaining live
UI gap.

## G0 checklist

- [ ] Owner has read `docs/product/vision.md`, `scope.md`, the three specs, and `analysis/flaws.md`.
- [ ] Owner has answered Q-001–Q-005 and Q-021–Q-028 (or recorded defaults).
- [ ] Owner has approved or amended ADR-0001–0003 and the agentic ADRs 0010–0014.
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
| ADR-0012 | proposed | PR sessions and agent-only resolution. |
| ADR-0013 | proposed | Manual-first triggering and dynamic agent routing. |
| ADR-0014 | proposed | Diff-first review with an incremental repository graph. |

## How to update this file

- Change the phase table only when a phase actually starts or ends.
- Keep "Done this session" to what landed in the current session; move history to a short
  `## History` section if it grows.
- "Verified" states what was run and observed, never "works".
- "Blocked by" names the exact question or dependency, not a vague concern.
- "Next action" is one concrete action, not a list.
