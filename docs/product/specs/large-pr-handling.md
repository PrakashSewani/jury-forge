# Spec: Large-PR handling and the coverage manifest (B-04)

- Status: **MVP gate — MVP-tier rows approved by the owner on 2026-11-28.** Later tiers stay draft and are approved before their milestone (per-milestone approval, 2026-11-27). Promoted to the MVP (Q-040): deterministic fitting + coverage manifest per ADR-0025 §2; split proposals, the minimum-coverage threshold, and the pre-run estimate are not tiered yet. Revised 2026-11-27 in the MVP spec review (release tiers, ADR alignment; see `delivery/status.md`).
- Owner: product + AI pipeline
- Date: 2026-11-15
- Principles: 2 (trustworthy review), 8 (fail visibly and recoverably), 13 (conversation first-class)
- Related ADRs: ADR-0007 (token-aware context), ADR-0016 (no misleading clean review), ADR-0018
  (hard caps), **ADR-0025 §2 (fitting and the manifest — binding)**
- Source: proposed by the architect; owner asked for it to be recorded and specified (2026-11-15).

## Release tiers

- **MVP (G1):** deterministic fitting and the coverage manifest exactly as ADR-0025 §2 defines them;
  the first-line coverage statement; the **fixed** no-clean-result rule (behaviour 4 with the 100 %
  threshold and no override); `cap_reached` and `provider_error` in the manifest; the estimate in
  the placeholder and Check Run summary for manual triggers on large PRs (behaviour 6).
- **Not tiered yet:** split proposals and chunk continuation (behaviours 3.2 and 3.3), a
  configurable minimum-coverage threshold (LP-02), and reviewing one oversized patch in ranges.

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

1. Every review turn produces a **coverage manifest** listing each changed file in one of the
   ADR-0025 §2 states — `reviewed`, `expanded` (T0+, v1), `summarised` (name + stats only),
   `skipped`, or `excluded` — with a reason: `over_budget`, `generated/lockfile`, `binary`,
   `excluded_by_policy`, `never_quote`, `cap_reached`, `provider_error`, or `scope_filtered`.
   "Not reviewed" below means any state other than `reviewed`/`expanded`. The manifest is part of
   the receipt (v1).
2. The posted summary always states coverage in plain words ("Reviewed 23 of 41 changed files;
   18 not reviewed — see list"). The manifest is also stored on the turn and visible in the UI.
3. When the change exceeds budget, the system follows an ordered strategy, never silent truncation:
   1. **Fit deterministically** (ADR-0025 §2, "code decides"): order files by the repo's main
      languages, put additions before deletion-only hunks, and fit patches to the token budget
      largest-first. What does not fit is `summarised` or `skipped`, with the reason. No model
      chooses what is read.
   2. *(Not tiered.)* **Propose a split:** group the remaining files into named chunks with a suggested review order
      and an estimate per chunk.
   3. *(Not tiered.)* **Offer continuation:** the author or maintainer asks for the next chunk through the same
      surfaces as any manual trigger (Check Run action, label, UI); each continuation is
      a normal budgeted turn in the same session.
4. A **no-findings result is only stated as "no issues found" when every reviewable file is
   `reviewed` or `expanded`** (a 100 % threshold, fixed in the MVP; a configurable threshold is
   LP-02, not tiered). Otherwise the wording is "no issues found in the reviewed files" plus the
   coverage statement, and the Check Run title says "partial coverage", never "no issues". The
   conclusion stays `neutral` (review-progress §1); partial coverage is never presented as a pass.
5. If a turn stops at a hard cap (tokens/tool calls/wall-clock), the manifest records `cap_reached`
   for the affected findings and files; findings relying on unread context are marked lower confidence.
6. For manual triggers on a PR above a configurable size (LP-01), the estimate and the planned
   coverage are shown **in the placeholder comment and the Check Run summary**
   ([`review-progress-and-completion.md`](review-progress-and-completion.md) §3) — never as a second
   comment. It does not block unless the repo policy says so.

Edge cases:

- Lockfile- or generated-only huge diffs: reviewed as `generated/lockfile` skipped with an explicit note.
- Renames/moves with no content change: listed once, not counted as unreviewed risk.
- PR changes while running: the manifest is tied to the head SHA; a stale turn is dropped (ADR-0012).
- One giant file: if its patch alone exceeds the budget, it is `summarised` (`over_budget`) with its
  line stats. Reviewing one oversized patch in ranges is not tiered.
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
- [ ] *(Not tiered.)* Given a split proposal, when the user requests chunk 2, then a budgeted turn reviews exactly
      those files and updates the manifest and coverage figure.
- [ ] Given a hard cap is hit, then affected files/findings are marked in the manifest and confidence
      is lowered.
- [ ] Given a stale SHA, then the old manifest is superseded and not presented as current.
- [ ] A test proves no code path posts "no issues" while any reviewable file is `summarised` or
      `skipped`.
- [ ] Fitting is deterministic: the same diff and budget produce the same manifest (a property test).
- [ ] A provider error mid-run marks the remaining files `skipped: provider_error` and offers a retry.

## Metrics

% reviews with partial coverage, continuation rate for proposed chunks, authors' "wrongly assumed
clean" reports (target zero), cost per covered file.

## Security and privacy

The manifest lists file paths and reasons, not content. Paths can be sensitive; visibility follows
session visibility (repo readers). `never_quote`/excluded files stay unread and are reported only as
excluded.

## Failure modes

Estimate wrong → the post-run manifest shows actual coverage; the estimate error is a metric.
Provider outage mid-run → remaining files are `skipped: provider_error` and a retry is offered.

## Rollout

Promoted to the MVP (Q-040): fitting and the manifest ship with the first review (M1.5). Builds on the
context manifest in ADR-0007/ADR-0018 and the fitting rule in ADR-0025 §2. Docs include a
"reviewing large PRs" guide.

## Open questions

- LP-01: default PR size above which a pre-run estimate comment is shown. Default: tied to 70% of the
  turn token cap; close with benchmark v0.
- LP-02: should the default minimum coverage ever be below 100%? Default: no; a per-repo override, if
  it is ever tiered, is owner-only (v1 roles, ADR-0028) and audited.
