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

**Next action:** the owner approves the six MVP-gate specs (listed under "Blocked by"), merges this
documentation PR, and says go for **Phase 1b / M1.0 (repository and CI)** on branch
`feat/walking-skeleton`, per
[`implementation-plan.md`](implementation-plan.md) and
[`../architecture/technical-approach.md`](../architecture/technical-approach.md) §4.

### Landed this session (2026-11-27, docs and capabilities review)

A review after G0 found that the 2026-11-16 consistency pass had covered only T0/T0+ wording.
Fixed in this pass:

- **`capabilities.md` §0 added:** 33 v1 trust-loop rows (verifier, chair, presets, model roles,
  T0+, instruction files, evidence ingest, conventions pack, ADR-0024, appeal, verified-fixed, noise budget, risk
  score, charges, fix handoff, merge gate, reactions, repo memory, signed receipt, egress preview,
  retention, checkbox trigger, bot-author defaults, reconciler, sizing floor, injection corpus),
  each with its source. Four rows have no spec section yet and are marked *spec gap*.
- **Row tiers aligned with the tier table:** 55 rows in §2–§12 now carry MVP / v1 / v1.1 /
  v1.2 instead of a bare `Planned` or `v1.x`. Fixed rows that contradicted it: resolution policy
  (was MVP with SME/admin override), provider fallback (was Deferred), the benchmark (Phase 3 +
  v1.1 replay UI), the chair (code, not configurable), the competitor teardown (Done). The
  status key gained Rejected, Done, and *(partial)*.
- **Backlog promotions recorded** (§13, the specs README, and five spec headers): B-04 → MVP
  (Q-040), B-03 and the B-07 reviewer client → v1.1, B-02 and B-06 → v1.2; B-01, B-05, B-08 stay
  backlog.
- **Conventions pack:** `scope.md` now has the one v1 org conventions pack that ADR-0017/0023 and
  WP 2-34 already had; the deferred row covers only further packs.
- **`standout-features.md`:** S6 split (egress preview v1, replay Phase 3 internal / v1.1 UI);
  SF-04 closed by Q-045; S1–S6 vs S7–S13 labelled.
- **`security.md` §6:** v1 role note (owner/maintainer/reader; the other columns are v1.2); the
  "Enable repositories" row renamed to reviewer binding (ADR-0013).

**Owner decisions (2026-11-27):**

1. **Instruction files → the S11 set** ([ADR-0027](../decisions/ADR-0027-instruction-files.md)):
   six file types from the base SHA, capped, trust-labelled, on by default (closes KN-01), MVP.
   Amends Q-032. Propagated to `scope.md`, `capabilities.md`, `knowledge-system.md`,
   `standout-features.md`, Q-032, ADR-0017/0023 status lines, and the ADR indexes.
2. **Spec approval → per milestone.** The six MVP specs are marked *MVP gate* and must be approved
   before Phase 1b work that implements them; every other spec is approved before its milestone.
   Recorded in [`../product/specs/README.md`](../product/specs/README.md). No spec is approved yet.
3. **Maintainer rights → override, owner decides critical**
   ([ADR-0028](../decisions/ADR-0028-v1-resolution-rights.md)): in v1 a maintainer accepts,
   dismisses, and reopens; only the owner dismisses or resolves a `critical` finding. Amends
   ADR-0012 and Q-028. Propagated to `scope.md`, `v1-ui.md`, `jury-output.md`, `security.md` §6,
   `agentic-review-sessions.md`,
   `capabilities.md`, and Q-028. New **Q-049** records the default for GitHub-native resolves of
   critical findings and the merge gate.

**Spike: CommandCode discovery + structured output (2026-11-27)** —
[`../analysis/spikes/2026-11-27-commandcode-structured-output.md`](../analysis/spikes/2026-11-27-commandcode-structured-output.md),
run with the owner's key on `deepseek/deepseek-v4.1-flash`; throwaway code outside the repository.

- CommandCode `/models` answers 200 **without a key**, so it cannot validate one; it has no pricing
  and no capability flags. `provider-model-discovery.md` §1 now validates with an authenticated
  minimal call.
- Structured output, 108 trials: the forced-tool mode on `/messages` was 18/18 valid; `json_schema`
  on `/chat/completions` was 16/18, with a whitespace runaway to the token cap on empty results;
  `output_format` on `/messages` appears to be ignored (0/18); prompt-only JSON needed one repair in
  about 20 % of trials.
- WP 1-07 is only partly done: Ollama and Anthropic-native models are not covered.

**Capability review against the spike (2026-11-27):** a row-by-row pass over `capabilities.md`.
Reworked: structured output (probe-chosen mode, MVP), tool use (v1.1; a forced tool is only a
structured-output mode in PR review), hard caps (reasoning tokens, `finish=length`), cost budgets
and presets (registry/admin prices; "cost unknown"), model roles (reasoning share, caching
confirmed), local servers and streaming (untested; probe first), capability registry (claims until
probed), rate limits (classify errors by status), diagnostics (last probe). Also S7 in
`standout-features.md`, Q-031 evidence, and `provider-model-discovery.md` pricing and catalog rows.

**Model capability probes (owner decision, 2026-11-27)** —
[ADR-0029](../decisions/ADR-0029-model-capability-probes.md): before a model is bound, a budgeted
probe on synthetic fixtures checks auth with a real call, picks the structured-output mode that
works, and records reasoning share and caching; `finish=length` is a failure, not a repair. MVP.
Propagated to `capabilities.md`, `scope.md`, `provider-model-discovery.md` (§2.1, binding, API, UI,
acceptance), `technical-approach.md` §3.4, `ai-pipeline.md`, `components.md`, `data-model.md`
(`model_probes`), `implementation-plan.md` (WP 1-19a, 1-07, 1-20), G1 in `quality-gates.md`, the
glossary (also removed a stale duplicate "Coverage manifest" entry), ADR-0011/0026 status lines,
and the ADR indexes. New [`../analysis/spikes/README.md`](../analysis/spikes/README.md): spike
index, S-A…S-E status, Mermaid charts of the results, and how to run a spike. The pre-v1 quality
spike stays dropped (ADR-0023).

Also noted, not changed: ADRs are amended in place (`accepted as amended`, edited status lines),
while `AGENTS.md` and `decisions/README.md` say to supersede; the status list has no `amended`.

### Earlier: 2026-11-16 consistency pass

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

## Verified this session (2026-11-27)

- **Spike README charts:** all 5 Mermaid blocks rendered without errors in Mermaid 11.4.1 in the
  app's browser (a local check page).
- **Spike calls:** 4 discovery probes, 6 auth probes, 90 structured-output trials plus an 18-trial
  re-run, all against the live CommandCode API; raw results kept in the scratch folder, summary in
  the spike note. The key was never printed or written to a file.

- **Link check:** a Node script over all 117 `*.md` files resolved every relative link and heading
  anchor; 0 broken.
- **Edits applied by exact-match replacement**; each pattern had to match exactly once or the file
  was not written.
- **Spec-coverage spot-check:** rows in `capabilities.md` §0 link a spec only where `grep` found the
  topic in it; four rows are marked *spec gap*.
- **Not verified:** the architecture documents other than `security.md` §6 and the PoC docs were
  not re-read in full.

## Verified earlier (2026-11-16)

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

- **Phase 1b:** the owner's go and approval of the six MVP-gate specs:
  [`first-run-setup.md`](../product/specs/first-run-setup.md),
  [`provider-model-discovery.md`](../product/specs/provider-model-discovery.md),
  [`agentic-review-sessions.md`](../product/specs/agentic-review-sessions.md),
  [`review-progress-and-completion.md`](../product/specs/review-progress-and-completion.md),
  [`large-pr-handling.md`](../product/specs/large-pr-handling.md), and
  [`session-capacity-and-visibility.md`](../product/specs/session-capacity-and-visibility.md).
  M1.0 (repository and CI) implements none of them and can start on the go alone. No technical
  blocker is open.
- **Installability is still unproven.** There is no compose file, CLI, Dockerfile, or signed release.
  The three documentation defects from the install dry run (B1–B3) are fixed in the docs, but no
  build exists to test. See [`../analysis/install-readiness-2026-11-15.md`](../analysis/install-readiness-2026-11-15.md).

## Open owner questions

The open list is now Q-001, Q-010, Q-011, Q-017, Q-018, Q-020, Q-030, Q-031, and Q-049; each has a recorded
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
| ADR-0027 | accepted (owner, 2026-11-27) | Instruction files: the S11 set from the base SHA, default on; amends Q-032. |
| ADR-0028 | accepted (owner, 2026-11-27) | v1 resolution rights: maintainers override; only the owner dismisses critical. |
| ADR-0029 | accepted (owner, 2026-11-27) | Model capability probes: test auth and structured-output mode before binding. |

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
