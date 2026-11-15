# Spec: Review progress and completion

- Status: draft for owner review
- Date: 2026-11-15
- Owner: product + platform
- Principles: 4 (secure by default), 8 (fail visibly), 9 (one vocabulary), 13 (conversation)
- Related: [`agentic-review-sessions.md`](agentic-review-sessions.md),
  [`jury-output.md`](jury-output.md), [`reviewer-assignment-and-roles.md`](reviewer-assignment-and-roles.md)
- Deciding direction: [ADR-0023](../../decisions/ADR-0023-product-direction.md)

## Problem

A review is not instant. The user triggers it, waits, and needs to know three things:

1. **Did it start?**
2. **Is it still working, or stuck?**
3. **Is it done — and where is the result?**

Silence is a trust failure: the user retriggers, the bot posts twice, or the user assumes the bot is
broken. Comment spam is also a trust failure: a bot that posts “starting”, “still working”, “almost
done” trains people to mute it. The product needs a progress surface that is native, quiet, and
reliable.

## Decision

**The Check Run is the progress bar. The review is the completion. The session UI is the live
detail. There is no progress-comment stream.**

- GitHub’s Check Run API is the native, expected place for “queued / in progress / completed”. It is
  visible in the PR checks tab and the conversation timeline, it can carry a summary and a details
  link, and it does not add a comment.
- The **published review is the completion event**. It appears in the conversation once.
- The **session UI** is the live, detailed view (timeline, agent runs, tool calls, cost). The Check
  Run details link points to it.
- **At most one placeholder comment**, only for an explicit conversational trigger (label, UI
  picker, mention), and it is **edited in place**, never posted as a series. It is off by default for
  automatic reviews and the Check Run action.
- **No per-reviewer comments**, no “still working” comments, no duplicate “done” comments.

## 1. The Check Run contract

One Check Run per `(repository, PR, head SHA)`, named `Jury Forge`.

| Phase | Status | Title | Summary | Actions |
| ----- | ------ | ----- | ------- | ------- |
| Trigger accepted | `queued` | `Jury Forge: queued` | “Review requested by <actor> · mode: pr-review” | `PR review`, `Branch review` (v1.x) |
| Turn started | `in_progress` | `Jury Forge: reviewing` | “Routing the jury…” | — |
| Routed | `in_progress` | `Jury Forge: reviewing` | “3 reviewers: Security, Correctness, Tests · 6 files” | — |
| Reviewers running | `in_progress` | `Jury Forge: reviewing` | “2 of 3 reviewers done · 3 findings so far” | — |
| Publishing | `in_progress` | `Jury Forge: publishing` | “Grounding and posting the review…” | — |
| Done | `completed` | `Jury Forge: review posted` | “1 blocking, 2 advisory · 3 findings · 45 s” | Details link |
| Config fallback | `completed` / `action_required` | `Jury Forge: configuration needed` | “No reviewers bound to this repo” + the remedy | Details link |
| Failed | `completed` / `failure` | `Jury Forge: review failed` | The typed reason and the next action | Details link |
| Cancelled | `completed` / `cancelled` | `Jury Forge: cancelled` | “Cancelled by <actor> / label removed / PR merged” | — |

Rules:

- The Check Run is created on PR open/synchronize with the `PR review` action (and `Branch review`
  in v1.x), so the trigger is discoverable without a comment.
- A trigger updates the **existing** Check Run for the head SHA; it does not create a second one.
- The conclusion follows the verdict policy: `neutral` by default, `failure` only when the repo
  policy makes a finding blocking, `action_required` for a configuration fallback.
- The details link goes to the session view (or to the install/setup page if the instance has no
  session for the SHA).
- The summary never prints a machine code; it uses the shared error taxonomy and names the remedy.
- A Check Run is not a substitute for the review; it is the status surface. The review always carries
  the composition, findings, and verdict.

## 2. Timing expectations

| Event | Target |
| ----- | ------ |
| Trigger accepted → `queued` visible | ≤ 5 s p95 |
| Turn started → `in_progress` | ≤ 10 s p95 |
| First meaningful status (routed/context) | ≤ 30 s p95 |
| Completion (review posted) | ≤ 3 min p50, ≤ 10 min p95 |
| Failure surfaced | ≤ 30 s after the failure is known |

If a phase exceeds its budget, the Check Run summary says what is slow (“provider is slow; retrying”)
rather than spinning silently. A stuck turn is a failure state with a reason, not an infinite
`in_progress`.

## 3. The placeholder comment (manual triggers)

For an **explicit manual trigger** (label, UI picker, or `@jury-forge` mention), the user took an
action and expects a conversational acknowledgement. The product posts **one** issue comment by
default, then edits it:

```
<!-- jury-forge-progress: <session-id>:<generation> -->
## Jury Forge is reviewing this PR
Mode: PR review · Reviewers: Security, Correctness, Tests
Started: 14:02 UTC · Detail: SESSION_URL
```

On completion, the same comment becomes:

```
## Jury Forge review posted
1 blocking, 2 advisory · 3 findings · 45 s
Read the review: REVIEW_URL · Session detail: SESSION_URL
```

Rules:

- **One comment per session/generation**, found by the hidden marker and edited, never re-posted.
- **On by default for explicit conversational triggers** (label, UI picker, mention); **off** for
  automatic reviews and the Check Run action (the Check Run is its own feedback). A repo can disable
  it for label/mention triggers, and a user can opt out.
- No “still working” edits; only start and completion. If the turn fails, the comment is edited to
  the failure and the remedy.
- If the PR is from a fork and policy says no comments on forks, the placeholder is skipped; the
  Check Run still reports.
- The review itself is never replaced by the placeholder; the placeholder links to the review.

## 4. The session UI

- Live state via the existing session timeline (SSE or short polling; the transport is an
  implementation detail).
- Shows: trigger and actor, routing decision, context manifest, each reviewer’s status, tool calls,
  findings so far, cost, and the final verdict.
- The Check Run details link and the placeholder comment both point here.
- `waiting_for_user` is a first-class state; the inbox surfaces it. A turn that is `in_progress`
  shows a live indicator; a turn that failed shows the reason and the retry action.

## 5. Failure and cancellation

| Situation | Check Run | Conversation | Session |
| --------- | --------- | ------------ | ------- |
| No reviewers bound | `action_required` | Fallback comment (existing) | No turn |
| Required reviewer unavailable | `action_required` | Required-unavailable fallback | No review |
| Provider 401/429/5xx | `failure` | One failure comment with the remedy, or edit the placeholder | Turn failed, retryable |
| Cap exceeded | `neutral`/`failure` per policy | The review/status says the cap was hit; no silent truncation | Turn completed with a cap reason |
| Label removed | `cancelled` | Placeholder edited to “cancelled” (if it exists) | Turn cancelled |
| PR merged mid-turn | `cancelled` or `completed` with the partial result | No new comment after archive | Session archived |
| Duplicate trigger | One Check Run, one review | No duplicate comment | One turn (dedupe) |

- A failure is never silent. The Check Run says `failure`, and the user gets one actionable message
  (fallback or placeholder), not a stack trace.
- A retry is explicit (Check Run action, label, UI) unless the queue retries a transient provider
  error within the same turn.
- A cancelled turn does not post a review and does not resolve a thread.

## 6. What the user sees, by trigger

| Trigger | Immediate signal | Progress | Completion |
| ------- | ---------------- | -------- | ---------- |
| Check Run action | Check Run → `in_progress` (no placeholder) | Check Run summary updates | Review + `completed` |
| `jury:pr-review` label | Check Run → `in_progress`; placeholder (default on) | Check Run summary | Review + `completed` |
| UI picker | Session detail opens; placeholder (default on); Check Run updates | Session timeline | Review + session state |
| `@jury-forge` mention | Placeholder (default on); Check Run updates | Check Run / session | Review + reply in thread |
| Automatic (policy) | Check Run updates | Check Run | Review + `completed` |

## 7. Anti-spam and correctness rules

- Never post more than one placeholder per session/generation.
- Never post a comment that says only “working” or “done”; the review or the Check Run carries the
  content.
- Never create a second review for the same turn; publishing is idempotent.
- Never leave a Check Run `in_progress` after the turn ends; every turn ends in `completed`,
  `failure`, or `cancelled`.
- Never let a stale turn overwrite a newer turn’s status or review.
- The Check Run summary can be updated frequently; the comment is updated at most twice (start,
  completion).
- All status transitions are audited with timestamp, actor, and reason.

## 8. Acceptance criteria

- [ ] Triggering a review updates one Check Run from `queued` to `in_progress` to `completed`.
- [ ] The completed Check Run names the verdict, the finding count, the duration, and a details link.
- [ ] The review is posted once, and the Check Run does not post a duplicate comment.
- [ ] A manual trigger can show one placeholder comment, edited in place, never a series.
- [ ] The placeholder defaults off for automatic and Check Run triggers.
- [ ] A failure produces a `failure` Check Run and one actionable message; no silent failure.
- [ ] A no-reviewers or required-unavailable state produces `action_required` plus the existing
      fallback comment.
- [ ] A cancelled turn produces `cancelled` and no review.
- [ ] The session UI shows live status, routing, reviewer progress, findings so far, and cost.
- [ ] The Check Run details link and the placeholder link resolve to the same session.
- [ ] A duplicate trigger does not create a second Check Run, comment, or review.
- [ ] No screen or comment prints a machine code.

## 9. Metrics

- Time to first status (trigger → `in_progress`).
- Time to completion (trigger → review posted).
- Status visibility: sessions where the user can see a status without asking / total sessions.
- Placeholder comment count per session (target ≤ 1).
- Duplicate review/comment rate (target 0).
- Stuck `in_progress` rate (target 0; a janitor fails it visibly).
- Failure-to-remedy rate: failures with a named next action / all failures (target 100%).

## 10. Open questions

| ID | Question | Default |
| -- | -------- | ------- |
| RP-01 | Is the placeholder comment on by default for manual triggers? | **Yes** for explicit manual triggers (label/UI/mention); off for automatic and Check Run triggers. A repo can disable it. |
| RP-02 | Does the Check Run carry the full finding list, or only a summary? | Summary + details link; the review carries the findings. |
| RP-03 | What is the stuck-turn threshold before the janitor fails it? | 2× the p95 completion target (20 min), configurable. |
| RP-04 | Do we notify Slack/email on completion? | No in v1; GitHub notifications are enough. v1.x. |
| RP-05 | Does a branch review show a different progress shape (estimate, cancel)? | Yes: estimate before start, cancel action; same completion contract. |
