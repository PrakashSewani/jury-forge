# ADR-0018: Release tiering and quality-first sequencing

- Status: accepted (G0, 2026-11-16; tiers consolidated to MVP / v1 / v1.1 depth / v1.2 platform in `product/capabilities.md`; v1 application re-scoped by ADR-0023; tiers amended by ADR-0025)
- Date: 2026-11-15
- Owners: product + architecture
- Supersedes: the flat "v1 in scope" list in `docs/product/scope.md` (it is restructured, not
  deleted)
- Revisit trigger: the first benchmark baseline, or a spike that shows the graph is cheap.

## Context

The 2026-11-15 capability set (sessions, router, reviewer catalog, knowledge system, repo graph,
branch review, resolution modes, full control-plane UI, roles, audit, budgets) is all marked v1.
Seen as one list it is a platform, not the wedge ("excellent self-hosted PR review for GitHub
teams"). Three problems follow:

1. **Nothing proves the quality thesis before the heaviest parts are built.** The graph, knowledge
   system, and branch review are the most expensive items; the benchmark that would justify them is
   scheduled after them (roadmap Phase 3).
2. **Docs disagree on what v1 contains.** `scope.md` puts branch review and the graph in v1;
   `roadmap.md`, `tech-depth/branch-review.md`, and `v1-ui.md` put them in v1.1; the MVP excludes
   them.
3. **Cost control is late.** Budgets are v1 scope but absent from the Phase 1 deliverables, while
   every turn is a multi-call agent loop paid for by the operator.

## Options

1. **Keep the flat v1 list.** Honest to the owner's list; high delivery risk; the contradictions stay.
2. **Tier the list: MVP → v1 → v1.1 → later**, and move a minimal evaluation harness and hard budgets
   to the front. Chosen.
3. **Cut features.** No: nothing is removed from the owner's capability set, only sequenced.

## Decision

Release tiers (full mapping in `docs/product/capabilities.md`, "Release tiers"):

| Tier | Contents |
| ---- | -------- |
| **MVP / Phase 1** | Compose install; provider add + `/models` discovery; encrypted keys; reviewer catalog + one repo binding with selection modes (`required`/`default`/`capability`; built-in capability IDs only in MVP); manual trigger via labels/Check Run/UI (no slash commands); **PR review diff-only at strict T0** (T0+ expansion arrives in v1, ADR-0025); one posted review per turn; reply → second turn; `suggest` resolution (agent proposes; human resolves) with guarded `auto` opt-in (ADR-0012 rev.); session/turn/tool records; **hard per-turn token/tool/wall-clock caps** (currency best-effort when priced); **evaluation harness v0** (≈20 labelled PRs, stub-model CI). |
| **v1** | Security phase (roles, redaction, injection defences, audit, retention); router with explanations; reviewer catalog approval/bindings; **capability registry + labels (built-in/custom, one-level groups, every installed repo)**; grounding + dedupe + chair; evaluation benchmark and baseline; budgets with estimates; ops (backup/restore/upgrade/observability); packs (grants, provenance, retrieval). |
| **v1.1** | Repository knowledge graph, branch review (ADR-0014), and repo docs at SHA (T2); allowlisted live doc links; Knowledge UI; GHES; signed packs. |
| **Later** | See `scope.md` out-of-scope and post-v1 list. |

Rules:

- The graph and branch review enter only after the benchmark shows diff-only (T0/T0+) PR review leaves
  measurable recall on the table (the PoC live evidence in `docs/poc/live-instance.md` is a hint, not
  proof). If the benchmark says the graph is not worth it, it stays deferred.
- A capability moves to a later tier only by owner decision; nothing is removed from the owner's
  list.
- The hard per-turn token/tool/wall-clock cap is a Phase 1 exit criterion; currency estimates and
  per-repo budgets follow in v1, and only when pricing is known.
- Evaluation harness v0 is a Phase 1 exit criterion; the full benchmark and scorecards stay v1.

## Consequences

**Easier:** one coherent definition of v1; the heaviest unknown (graph) is gated by evidence;
spending is bounded from the first real review; quality regressions are caught from day one.

**Harder:** the owner's "branch review with graph" moves later than the original list implied; the
harness v0 costs time before the first user-visible feature is polished; docs must stay in sync
across tiers.

## Security and operations

- Hard token/tool/wall-clock caps reduce the blast radius of a runaway loop or an injected "keep
  calling tools" prompt; currency limits are best-effort when pricing is known.
- Moving the graph out of the first release shrinks the initial attack surface (parsers, index
  storage, cross-repo retrieval) and defers its retention/deletion design until it is built.

## Evidence

- Original contradictions (resolved in this pass): `scope.md` (v1 in-scope list) vs `roadmap.md` Phase 3 note vs
  `architecture/tech-depth/branch-review.md` ("first v1.1 quality feature") vs
  `product/specs/v1-ui.md` (Knowledge v1.1).
- PoC retrospective: the PoC delivered an interface without the pipeline; the flaw register F-010
  (no cost guard) shows spend control cannot wait.

## Follow-ups

- Owner approves or amends the tier table.
- Write the benchmark v0 spec (Q-010) and a competitor teardown (Q-029).
- Re-baseline `roadmap.md` and `quality-gates.md` (done in the same change set as this ADR).
