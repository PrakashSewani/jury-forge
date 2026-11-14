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

**Done this session (2026-11-14):**

- Cloned and studied `PrakashSewani/jury-forge-poc` at `1cc22b7` (final `dev` commit).
- Read the PoC's product, architecture, design, decisions, development, roadmap, status, rework,
  tests, source, migrations, and CI.
- Completed a second, code-level pass through the Worker routes, libs, run engine, D1 schema,
  React data layer/UI, test suites, and scripts; the result is `docs/poc/code-review.md` and
  twelve additional findings (F-066–F-077).
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

**Verified:**

- All files written and inspected for links and paths.
- The PoC claims are cited to file/decision where practical; no PoC code was copied.
- The deep code pass added F-066–F-077 with file/function evidence (start/alarm ordering, previous
  findings from failed runs, pack request/zip limits, provider params, GitHub error mapping,
  unguarded JSON, pack atomicity, setup/claim atomicity, unbounded receivers, body limits, N×M
  reviewer query).
- No product code, no dependencies, no secrets.

**Blocked by:**

- The owner's final capability list (`docs/product/capabilities.md`, Q-001) for scope certainty.
- The owner's decisions on deployment, storage, runtime, and tenancy (Q-002–Q-005, ADR-0003–0005).

**Next action:**

The owner reviews the knowledge base and the proposed ADRs, answers the blocking open questions,
and approves or amends the scope. Implementation does not start until G0 passes.

## G0 checklist

- [ ] Owner has read `docs/product/vision.md`, `scope.md`, and `analysis/flaws.md`.
- [ ] Owner has answered Q-001–Q-005 (or recorded defaults).
- [ ] Owner has approved or amended ADR-0001–0003.
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

## How to update this file

- Change the phase table only when a phase actually starts or ends.
- Keep "Done this session" to what landed in the current session; move history to a short
  `## History` section if it grows.
- "Verified" states what was run and observed, never "works".
- "Blocked by" names the exact question or dependency, not a vague concern.
- "Next action" is one concrete action, not a list.
