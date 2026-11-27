# ADR-0027: Repository instruction files — the S11 set, read from the base SHA

- Status: accepted (owner decision, 2026-11-27)
- Date: 2026-11-27
- Owners: product + AI pipeline + security
- Amends: ADR-0023 (its answer to Q-032: "those two files only"), ADR-0017 (v1 knowledge sources)
- Supersedes: —
- Revisit trigger: a new instruction-file convention gains wide use, an injection-corpus case gets
  through an instruction file, or instruction files regularly exceed the cap.

## Context

The documents disagreed on which repository files PR review may read as instructions:

- Q-032 (closed at G0, recorded in ADR-0023, v1 scope item 5) allows **two files only**, `AGENTS.md` and
  `CONTRIBUTING.md`, at the base SHA, about 8 KB each. `scope.md` §3, `capabilities.md`, and
  `knowledge-system.md` §1 followed that.
- S11 in [`../product/specs/standout-features.md`](../product/specs/standout-features.md), accepted
  with the deep dive (row 5.1) at G0, reads **six file types** from the base SHA. The MVP tier in
  `capabilities.md`, `roadmap.md`, `security.md` §9, and MVP work package 1-29 in
  `implementation-plan.md` were built on S11.

No ADR reconciled them. The owner chose the S11 set on 2026-11-27.

## Options

1. **The S11 set at the base SHA** (chosen). Works with the instruction files teams already keep for
   Copilot and coding agents, with no extra setup. Work package 1-29 stays as planned. The attack
   surface is wider than two files, but it is the same trust class: base-SHA content, capped and
   labelled.
2. **Two files in the MVP, the S11 set in v1.** Smallest MVP surface; changes WP 1-29 and the MVP
   tier, and delays the compatibility story to v1.
3. **Keep Q-032 (two files).** Strictest; gives up compatibility with Copilot's instruction files,
   which is the point of S11.

## Decision

PR review reads these **instruction files**, and only these, from the PR's **base SHA**:

1. `AGENTS.md`
2. `CONTRIBUTING.md`
3. `REVIEW.md`
4. `CLAUDE.md`
5. `.github/copilot-instructions.md`
6. `.github/instructions/**/*.instructions.md` — path-specific; a file applies to a hunk only when
   its `applyTo` globs match that hunk's path (deep dive 5.1).

Rules:

- **Base SHA only.** Edits to these files in the head branch never affect the current review. A PR
  that changes any of them gets the note "review rules changed in this PR; they take effect after
  merge."
- **Capped.** Each file is capped at about 8 KB (the Q-032 default). The total instruction budget is
  part of the per-turn caps (Q-031). Truncation is recorded; it is never silent.
- **Instructions context only.** The files are trust-labelled instructions context. They are never
  evidence, never code context, and cannot widen a reviewer's tool grant or the egress policy.
- **No other repository file** is read for instructions. The diff-only rule for code context is
  unchanged: strict T0 in the MVP, T0+ from v1 (ADR-0025), no file outside the diff.
- **Default on.** S11 promises relevant reviews with no extra setup, so the files are read by
  default. From v1, a repository can opt out of single files or of all of them in its base-SHA
  `.jury-forge.yml`. This answers KN-01 in `knowledge-system.md`, which had assumed opt-in.
- **Recorded.** The receipt lists every instruction file used, with its path, the base SHA, and its
  token count; in the MVP, the turn record holds the same list.

**Tier:** MVP (work package 1-29).

## Consequences

- Teams that already use Copilot or agent instruction files get repo-aware reviews on day one.
- Six file types plus path-specific files is more parsing and more injection surface than two files.
- The cap and the receipt keep the cost and the provenance visible.

## Security and operations

- Instruction files are attacker-influenced once merged: anyone who can merge to the default branch
  can steer reviews. That is the same trust as `AGENTS.md` under Q-032, and is documented as such.
- Reading from the base SHA prevents a PR from rewriting the rules it is reviewed by — the property
  Copilot lacks because it reads the head branch (deep dive 11.1).
- The injection corpus (deep dive 11.2) must include a case for each file type, including a
  path-specific file whose `applyTo` matches every path.
- No new egress class: the files come from the forge API at a pinned SHA, like the diff.

## Evidence

- [`../analysis/open-questions.md`](../analysis/open-questions.md) Q-032 (closed at G0).
- [`../analysis/capability-deep-dive-2026-11-16.md`](../analysis/capability-deep-dive-2026-11-16.md)
  rows 5.1 and 11.1.
- [`../product/specs/standout-features.md`](../product/specs/standout-features.md) S11.
- [`../delivery/implementation-plan.md`](../delivery/implementation-plan.md) WP 1-29.

## Follow-ups

- Update `scope.md` §3, `capabilities.md`, `knowledge-system.md` §1 and KN-01, the Q-032 row, and the
  ADR indexes (done with this ADR).
- Add the per-file-type cases to the injection corpus (WP 2-31).
- Define the `.jury-forge.yml` opt-out keys in the config schema before v1.
