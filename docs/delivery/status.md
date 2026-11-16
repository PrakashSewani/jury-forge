# Status

Persistent project tracker and handoff. Update it as work lands, not retrospectively. Keep exactly
one phase `in progress` and exactly one next action.

## Phase tracker

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0 | Product definition and documentation | **done — G0 passed 2026-11-16** |
| 1a | Technology and approach (decisions only, no code) | **done — accepted 2026-11-16** |
| 1b | Foundation and walking skeleton (MVP, gate G1) | **next — waiting for owner go** |
| 2 | Trust and security | not started |
| 3 | Review quality | not started |
| 4 | Operations and release | not started |
| 5 | v1 launch | not started |

## Current handoff

**Phase:** 1a complete. Phase 1b has not started; there is no product code in the tree.

**Branch:** `docs/claude-fix` (documentation only).

**Next action:** merge this documentation PR, then say go for **Phase 1b / M1.0 (repository and CI)**
on branch `feat/walking-skeleton`, per [`implementation-plan.md`](implementation-plan.md) and
[`../architecture/technical-approach.md`](../architecture/technical-approach.md) §4.

### Landed this session (2026-11-16, consistency pass)

- **T0+ propagated.** ADR-0025 now names what it amends (ADR-0007, 0011, 0014, 0016, 0018, 0019,
  0023) and states its tier: the MVP stays strict T0, T0+ ships in v1. Fifteen documents that said
  "strict T0 / no repository file reads" now say diff-only with **no file outside the diff read**:
  `ADR-0007`, `ADR-0014`, `ADR-0016`, `ADR-0018`, `ADR-0019` (note only), `ai-pipeline.md`,
  `overview.md`, `agentic-review.md`, `quality-gates.md`, `capabilities.md`, `glossary.md`,
  `agentic-review-sessions.md`, `reviewer-assignment-and-roles.md`, `pr-walkthrough.md`,
  `knowledge-system.md`.
- **Open questions closed.** Q-028 and Q-032–Q-048 moved to a "Closed at G0" table that keeps the
  IDs and names the document each decision lives in. A second pass closed the questions an accepted
  ADR had already answered (Q-002–Q-009, Q-012–Q-016, Q-019, Q-021–Q-027, Q-029) into a
  "Closed at Phase 1a and earlier" table. Eight questions remain open — Q-001, Q-010, Q-011, Q-017,
  Q-018, Q-020, Q-030, Q-031 — none of which blocks Phase 1b.
- **G0 ticked with evidence** in [`quality-gates.md`](quality-gates.md); the tracker no longer
  duplicates the gate list.
- **`technical-approach.md` header fixed** (it called itself accepted and still-proposed at once) and
  the local Node claim corrected to the observed `v24.19.0`.
- **`overview.md` decision table fixed**: sixteen rows moved from `Proposed` to their real status,
  and ADR-0024/0025/0026 added.
- **This file rewritten**: branch, phase, one next action, ADR table, and history collapsed.

### Earlier this phase (2026-11-16)

- G0 passed: owner accepted ADR-0007, 0008, 0011–0018, 0021–0025 and the default answers to Q-028 and
  Q-032–Q-048. Quality spike removed by the owner; quality is measured after v1 by replay.
- ADR-0024 (conversation safety, finding identity, evidence-gated resolution), ADR-0025 (v1 review
  pipeline), ADR-0026 (v1 stack) written and accepted.
- `product/specs/standout-features.md` (S1–S13) and the competitive scan added the v1 differentiators
  and table stakes.
- Phase 1a delivered [`technical-approach.md`](../architecture/technical-approach.md): 12 stack
  decisions T-01–T-12, repository layout, runtime flows, footprint budgets, threat→control map, and
  the M1.0–M1.8 plan with five time-boxed spikes.
- [`implementation-plan.md`](implementation-plan.md): 127 work packages across Phases 1b–5 plus
  v1.1/v1.2, with a critical path and per-milestone exit evidence.

## Verified this session (2026-11-16)

- **Link check:** every relative link in every `*.md` resolved; 0 broken.
- **Contradiction sweep:** `grep` for "strict T0" / "no repository file reads" leaves only
  tier-scoped statements (MVP, G1), the rejected ADR-0019 record, and historical entries below.
- **npm evidence spot-check (live):** `web-tree-sitter 0.27.2`, `graphile-worker 0.18.0`,
  `zod 4.6.7`, `fastify 5.12.8`, `@octokit/app 16.1.4`, `vitest 5.1.0` all match
  `technical-approach.md` §13.
- **Secret scan:** no key, token, or private-key pattern in the tree.
- **Tree contents:** `git ls-files` is documentation, licence, and config only — no product code.
- **Environment:** `node -v` → `v24.19.0`; `pnpm -v` → `12.4.2`.
- **Not verified:** any model output, any install on a host, and the packages §13 lists as "not yet
  verified live" (Caddy, minisign, cosign, syft, testcontainers, fast-check, Biome, Playwright,
  Radix, Tailwind, kysely-codegen, license-checker, the grammar packages). Nothing here is a "works"
  claim.

## Blocked by

- **Phase 1b:** only the owner's go. No technical blocker is open.
- **Installability is still unproven.** There is no compose file, CLI, Dockerfile, or signed release.
  The three documentation defects from the install dry run (B1–B3) are fixed in the docs, but no
  build exists to test. See [`../analysis/install-readiness-2026-11-15.md`](../analysis/install-readiness-2026-11-15.md).

## Open owner questions

The open list is now Q-001, Q-010, Q-011, Q-017, Q-018, Q-020, Q-030, and Q-031; each has a recorded
default and a close condition in [`../analysis/open-questions.md`](../analysis/open-questions.md).
Everything else is closed by an accepted ADR (see the two closed tables there). None of the open
items blocks Phase 1b.

## G0 — passed 2026-11-16

The checklist and its evidence live in [`quality-gates.md`](quality-gates.md#g0--documentation-and-product-definition--passed-2026-11-16).

## Recent decisions

| ADR | Status | Summary |
| --- | ------ | ------- |
| ADR-0001 | accepted (owner directive) | Self-hosted, MIT, vendor-neutral. |
| ADR-0002 | accepted | The Cloudflare PoC is reference only. |
| ADR-0003 | accepted (Phase 1a) | Docker Compose is the reference deployment. |
| ADR-0004 | accepted (Phase 1a) | PostgreSQL is the source of truth. |
| ADR-0005 | accepted (Phase 1a) | TypeScript-first runtime for v1. |
| ADR-0006 | accepted (Phase 1a) | Queue + stateless workers, not per-run actors. |
| ADR-0007 | accepted (G0) | Token-aware context; PR review context is T0+ per ADR-0025. |
| ADR-0008 | accepted (G0) | Roles and trust boundaries. |
| ADR-0009 | accepted (owner directive) | MIT licence, no CLA. |
| ADR-0010 | accepted as amended (Phase 1a) | Thin turn runner; no agent harness in v1. |
| ADR-0011 | accepted (G0) | Provider/model discovery; no free-text model; encrypted keys. |
| ADR-0012 | accepted (G0) | PR sessions; `suggest` default resolution, `auto`/`off` opt-in. |
| ADR-0013 | accepted (G0) | Manual-first triggering and dynamic agent routing. |
| ADR-0014 | accepted (G0) | Diff-only PR review; branch review + graph in v1.1. |
| ADR-0015 | accepted (G0) | Session capacity, interface, roles, and visibility. |
| ADR-0016 | accepted (G0) | Reviewer catalog, repo bindings, capabilities, fallback. |
| ADR-0017 | accepted (G0) | Knowledge sources, snapshots, grants, retrieval. |
| ADR-0018 | accepted (G0) | Release tiering; eval harness + hard caps in Phase 1. |
| ADR-0019 | rejected | T1 bounded reads for PR review; T0+ (ADR-0025) is the narrower accepted path. |
| ADR-0020 | accepted (Phase 1a) | Signed release bundle, verify before extract, no pipe-to-shell. |
| ADR-0021 | accepted (G0) | Runtime-configured public origin; domain is a setup step. |
| ADR-0022 | accepted as amended (G0) | Helm chart, moved to v1.2 by ADR-0023. |
| ADR-0023 | accepted (G0) | Product direction: the auditable review layer; v1 is the trust loop. |
| ADR-0024 | accepted (G0) | Conversation safety, finding identity, evidence-gated resolution. |
| ADR-0025 | accepted (G0) | v1 pipeline: T0+ context, verifier, code-first chair, model roles. |
| ADR-0026 | accepted (Phase 1a) | v1 stack: HTTP/UI, GitHub client, parsing, crypto, observability, tests, layout. |

## History

### 2026-11-15 — product direction and capability intake

The owner moved the product to an **agentic reviewer**: per-PR sessions, manual-first triggering,
dynamic agent routing, provider/model discovery, encrypted keys, diff-only PR review, graph-backed
branch review (v1.1), `suggest` resolution. ADR-0010–ADR-0017 and the matching specs were written.
ADR-0023 narrowed v1 to the **trust loop** (install → provider → jury → diff review → verdict/dissent
→ receipt → session → feedback); ADR-0019 was rejected (no arbitrary file reads for PR review).
Owner decisions: no slash commands; labels, Check Run actions, and the UI picker only; capabilities
are first-class tenant objects; trigger and resolve authorization per ADR-0024.

Workstreams at the time: **A (quality spike) removed** by the owner on 2026-11-16; **B (install
readiness)** documented three blockers and no build — see
[`../analysis/install-readiness-2026-11-15.md`](../analysis/install-readiness-2026-11-15.md).

### 2026-11-14/15 — PoC study and knowledge base

Studied `PrakashSewani/jury-forge-poc` at `1cc22b7` (docs, source, migrations, CI) and captured the
live instance read-only through D1. Findings: 77-entry flaw register (F-001–F-077) in
[`../analysis/flaws.md`](../analysis/flaws.md), the keep/reject/rethink ledger, and the PoC section of
the knowledge base. Live evidence recorded in [`../poc/live-instance.md`](../poc/live-instance.md):
the only posted review's 8 findings all check out against the PR code, and the same reviewer that
failed with a provider 401 in the automatic run succeeded in a manual try run with 9 valid findings.
The instance was read-only throughout; no configuration was changed. The knowledge base
(`poc/`, `analysis/`, `product/`, `architecture/`, `delivery/`, `reference/`, `decisions/`),
`README.md`, `AGENTS.md`, the MIT `LICENSE`, the project skills, and the agent chain were created.

**Backlog (not committed to any tier):** B-01–B-08 (shadow mode, per-repo provider allowlist,
local/CLI diff review, large-PR handling, reviewers-as-code, history-seeded conventions, MCP surface,
PR walkthrough) in [`../product/capabilities.md`](../product/capabilities.md) §13, one spec each under
`../product/specs/`.

## How to update this file

- Change the phase table only when a phase actually starts or ends.
- Keep "Landed this session" to what landed in the current session; move older entries to `## History`
  as a short paragraph, not a transcript.
- "Verified" states what was run and observed, never "works".
- "Blocked by" names the exact question or dependency, not a vague concern.
- Exactly one "Next action".
