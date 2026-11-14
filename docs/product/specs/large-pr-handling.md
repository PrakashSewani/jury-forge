# Spec: Large-PR handling and the coverage manifest (B-04)

- Status: draft — backlog, not committed (see `capabilities.md` §13)
- Owner: product + AI pipeline
- Date: 2026-11-15
- Principles: 2 (trustworthy review), 8 (fail visibly and recoverably), 13 (conversation first-class)
- Related ADRs: ADR-0007 (token-aware context), ADR-0016 (no misleading clean review), ADR-0018
  (hard caps)
- Source: proposed by the architect; owner asked for it to be recorded and specified (2026-11-15).

## Problem

Hard caps (turn tokens, tool calls, time) are necessary, but a review that silently covers only part
of a large PR and then says "no issues" is worse than no review: authors read silence as safety.
The PoC's byte budget and overflow handling (flaw F-006, F-010) show truncation without telling the
reader is a recurring failure.

## Users and jobs

- **PR author / reviewer (P3, P4):** "Tell me what was and was not looked at, and how to cover the rest."
- **P1 Platform engineer:** "Make partial reviews visible and cheap to continue."
- **P2 Security lead:** "Never report a clean result for code that was not reviewed."

## Behaviour

1. Every review turn produces a **coverage manifest** listing each changed file as `reviewed`,
   `partially reviewed`, or `not reviewed`, with a reason: `over_budget`, `generated/lockfile`,
   `binary`, `excluded_by_policy`, `never_quote`, `tool_error`, `cap_reached`, or `scope_filtered`.
2. The posted summary always states coverage in plain words ("Reviewed 23 of 41 changed files;
   18 not reviewed — see list"). The manifest is also stored on the turn and visible in the UI.
3. When the change exceeds budget, the system follows an ordered strategy, never silent truncation:
   1. **Prioritise** files by risk/priority ordering and review the highest-priority set within budget.
   2. **Propose a split:** group the remaining files into named chunks with a suggested review order
      and an estimate per chunk.
   3. **Offer continuation:** the author or maintainer asks for the next chunk through the same
      surfaces as any manual trigger (Check Run action, label, UI); each continuation is
      a normal budgeted turn in the same session.
4. A **no-findings result is only stated as "no issues found" when coverage meets the repo's minimum
   coverage threshold** (default 100% of reviewable files). Below it, the wording is "no issues
   found in the reviewed files" plus the coverage statement; the check conclusion is never a
   plain pass.
5. If a turn stops at a hard cap (tokens/tool calls/wall-clock), the manifest records `cap_reached`
   for the affected findings and files; findings relying on unread context are marked lower confidence.
6. For manual triggers on a PR above a configurable size, a short pre-run comment shows the estimate
   and the planned coverage; it does not block unless the repo policy says so.

Edge cases:

- Lockfile- or generated-only huge diffs: reviewed as `generated/lockfile` skipped with an explicit note.
- Renames/moves with no content change: listed once, not counted as unreviewed risk.
- PR changes while running: the manifest is tied to the head SHA; a stale turn is dropped (ADR-0012).
- One giant file: reviewed in ranges; unread ranges appear as `partially reviewed` with line spans.
- Binary/vendored/never_quote files: listed, with the policy reason, never read.

## Non-goals

- No automatic splitting of the PR or any change to the author's branch.
- No promise to review everything regardless of cost; caps are real.
- No new reviewer logic; this is about honesty and continuation, not review depth.

## Acceptance criteria

- [ ] Given a PR over budget, when reviewed, then the summary states reviewed vs not-reviewed counts
      and the manifest lists every changed file with a reason.
- [ ] Given coverage below the repo threshold, then the result is never worded or concluded as a
      clean pass.
- [ ] Given a split proposal, when the user requests chunk 2, then a budgeted turn reviews exactly
      those files and updates the manifest and coverage figure.
- [ ] Given a hard cap is hit, then affected files/findings are marked in the manifest and confidence
      is lowered.
- [ ] Given a stale SHA, then the old manifest is superseded and not presented as current.
- [ ] A test proves no code path posts "no issues" while any reviewable file is `not reviewed`
      under the default threshold.

## Metrics

% reviews with partial coverage, continuation rate for proposed chunks, authors' "wrongly assumed
clean" reports (target zero), cost per covered file.

## Security and privacy

The manifest lists file paths and reasons, not content. Paths can be sensitive; visibility follows
session visibility (repo readers). `never_quote`/excluded files stay unread and are reported only as
excluded.

## Failure modes

Estimate wrong → the post-run manifest shows actual coverage; the estimate error is a metric.
Provider outage mid-run → remaining files are `not reviewed: provider_error` and a retry is offered.

## Rollout

Backlog; target v1 if promoted. Builds on the context manifest in ADR-0007/ADR-0018. Docs include a
"reviewing large PRs" guide.

## Open questions

- LP-01: default PR size above which a pre-run estimate comment is shown. Default: tied to 70% of the
  turn token cap; close with benchmark v0.
- LP-02: should the default minimum coverage ever be below 100%? Default: no; per-repo override by
  admin only, audited.
