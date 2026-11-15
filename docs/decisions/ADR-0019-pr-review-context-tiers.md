# ADR-0019: PR review context tiers — rejected for PR review

- Status: rejected (owner decision, 2026-11-15)
- Date: 2026-11-15
- Owners: AI pipeline + architecture
- Supersedes: nothing
- Revisit trigger: a future benchmark shows strict diff-only PR review leaves material recall on the
  table; a new ADR would be required.

## Context

The owner directive is “PR review reviews the diffs; branch review reviews the complete branch.”
During the capability review, a proposal was recorded to let PR review pull **bounded read-only
file/search tools (T1)** in addition to the diff (T0). The argument was grounding: a reviewer that
cannot read a callee, test, or config cannot verify a behavioural claim.

The counter-argument won:

- It contradicts the owner’s explicit mental model (“pr-review will just review diffs”).
- It adds a tool loop, more provider calls, more latency, and a larger injection surface to every PR.
- The product already has a place for full context: `jury:branch-review`, which compares the branch
  to the default branch and uses the graph (T2, ADR-0014).
- The benchmark should prove the need before the complexity is added.

## Options considered

1. **Strict T0 diff-only** — PR review receives the diff/hunks + metadata + thread context; no file
   reads, no graph. **Chosen by the owner.**
2. **T0 + T1 bounded reads** — PR review may call read-only file/search tools at pinned SHAs.
   Rejected for PR review.
3. **Graph for every PR** — rejected; too expensive, unproven.

## Decision

- **PR review is strict T0 diff-only.** It receives the PR diff/hunks, PR metadata, reviewer
  instructions, granted knowledge packs, and the existing thread/session context. It does **not**
  read repository files, call search, or consult the graph.
- **Branch review is T2 graph-backed.** It compares the branch to the repository default branch and
  may use read-only repository context (see ADR-0014).
- T1 bounded reads are **not adopted** in v1 for PR review. If a future benchmark shows strict
  diff-only is insufficient, a new ADR may propose T1 for a specific mode (for example an explicit
  “deep PR review”), with caps and evidence.
- The owner decision supersedes the proposal. No `/jury` commands are involved; triggers are labels,
  Check Run actions, and the UI.

## Consequences

**Easier:** PR review stays cheap, fast, predictable, and easy to reason about. The only tool loop in
the review path is the branch-review path, which is explicit and estimated.

**Harder:** PR review cannot verify callers/tests/config. It may miss issues that only appear outside
the diff. The product must be honest about that and point users to branch review when they need full
context.

**Invariants:** PR review sends no repository file reads and no graph; operator-curated packs and
reviewer instructions are configuration, not repository context; branch review is explicit and
graph-backed; a future T1 experiment needs a new ADR and benchmark evidence.

## Security and operations

- Removing T1 from PR review removes a tool-loop attack surface and forge read load from the default
  path.
- Branch review keeps bounded, audited reads and the graph’s retention/deletion rules.
- A prompt injection in a diff cannot cause a PR-review tool call, because there are no file tools.

## Evidence

- Owner decision, 2026-11-15: strict T0.
- `docs/poc/live-instance.md`: outside-diff context matters, but branch review is the product’s answer,
  not silent file reads on every PR.
- ADR-0014 (branch review/graph) remains the full-context path.

## Follow-ups

- Update the docs that referenced T1 (done in the same change set).
- Benchmark strict diff-only against the single-model baseline; if recall is insufficient, propose a
  new explicit mode in a new ADR.
- Do not reintroduce T1 into `jury:pr-review` without an owner decision.
