# Spec: PR walkthrough (B-08)

- Status: draft — backlog, not committed (see `capabilities.md` §13)
- Owner: product
- Date: 2026-11-15
- Principles: 2, 11 (start with the wedge), 13, 14 (manual-first)
- Related ADRs: ADR-0013 (manual-first), ADR-0016 (reviewers and capabilities), ADR-0018 (caps)
- Depends on: large-PR handling (B-04) for the coverage manifest
- Source: proposed by the architect; owner asked for it to be recorded and specified (2026-11-15).
  Lowest priority; promote only if adoption feedback asks for it.

## Problem

Reviewers and authors often want orientation before findings: what this PR does, which areas it
touches, where to look first. Other tools treat this as table stakes. It is not review, so it must
not dilute the wedge or be mistaken for a verdict.

## Users and jobs

- **P3 Reviewer:** "Tell me what changed and in what order to read it."
- **P4 Author:** "Give me a draft summary I can edit."
- **P1 Platform engineer:** "Keep it opt-in and cheap."

## Behaviour

1. A walkthrough is **requested** like any manual trigger (Check Run action, label, UI);
   it never runs automatically unless a repo policy opts in.
2. It is performed by an **approved reviewer bound to the repo with the capability `walkthrough`**
   (ADR-0016). No such binding → the standard no-reviewer fallback comment.
3. The agent uses strict T0 diff-only context and produces one **walkthrough comment**:
   - purpose (a short grounded summary),
   - changes grouped by area, each listing the files involved,
   - a suggested review order,
   - risk hotspots (areas where the change touches shared code, config, auth, or data),
   - tests touched and areas changed without tests,
   - the coverage manifest (B-04) so the reader knows what was and was not examined.
4. It contains **no findings, severities, verdict, or check conclusion**, and is labelled
   "generated overview, not a review".
5. A later request updates the same comment in place (one comment per PR). It does not auto-update
   on push unless policy opts in.
6. **Writing to the PR description is a separate, explicit action** (never default): the text is
   inserted inside a clearly delimited, replaceable block and never overwrites author text.

Edge cases:

- Empty/trivial diffs: a one-line statement, no padding.
- Over-budget PRs: prioritised summary with coverage statement (B-04).
- Edited by a human: a human-edited walkthrough comment is not overwritten; a new request posts a
  fresh comment and says why.
- Draft PRs: follow existing draft handling.

## Non-goals

- Not a review, not a gate, not a replacement for findings.
- No automatic PR description rewriting.
- No diagrams or release-note generation in the first cut.

## Acceptance criteria

- [ ] Given a request and a bound `walkthrough` reviewer, then one comment is posted with the sections
      above and the label "generated overview, not a review".
- [ ] Given no bound reviewer, then the no-reviewer fallback is posted instead.
- [ ] Every file named in the walkthrough exists in the PR diff (grounding check).
- [ ] The walkthrough never sets a check conclusion or severity.
- [ ] A second request edits the same comment; a human-edited comment is not overwritten.
- [ ] Description write-back inserts only inside its block and leaves the rest of the body untouched.

## Metrics

Request rate, edit rate of the comment, author/reviewer thumbs, cost per walkthrough, share of
walkthroughs with ungrounded file references (target zero).

## Security and privacy

- Same egress, redaction, and provider allowlist as any turn.
- The PR body and comments are untrusted input; write-back never executes or interprets them.
- Description write-back needs the forge permission and an explicit user action; it is audited.

## Failure modes

Provider failure → no partial comment is posted; the request shows an error with retry. Forge write
failure leaves nothing half-edited (the update is a single idempotent call).

## Rollout

Backlog; later tier, only on adoption demand. Reuses the review pipeline and the capability tag.

## Open questions

- PW-01: should the walkthrough share the review's session or be a separate lightweight record?
  Default: same PR session, separate turn type; close at design.
- PW-02: should description write-back exist at all in the first cut? Default: no; comment only.
