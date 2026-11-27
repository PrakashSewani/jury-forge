# Spec: Review progress and completion

- Status: draft for owner review — **MVP gate**: owner approval required before Phase 1b work that implements it (per-milestone approval, 2026-11-27). **Revised 2026-11-27** in the MVP spec review (release tiers, ADR alignment; see `delivery/status.md`); not yet approved
- Date: 2026-11-15
- Owner: product + platform
- Principles: 4 (secure by default), 8 (fail visibly), 9 (one vocabulary), 13 (conversation)
- Related: [`agentic-review-sessions.md`](agentic-review-sessions.md),
  [`jury-output.md`](jury-output.md), [`reviewer-assignment-and-roles.md`](reviewer-assignment-and-roles.md)
- Deciding direction: [ADR-0023](../../decisions/ADR-0023-product-direction.md); triggers: ADR-0013, ADR-0024 §1

## Release tiers

- **MVP (G1):** the Check Run contract (§1) with one reviewer and the `PR review` action, the
  timing targets (§2), the placeholder for label and UI-picker triggers (§3), the session UI live
  status (§4, built in M1.7), failure and cancellation (§5), and the anti-spam rules (§7). The
  conclusion is always `neutral` or `action_required` in the MVP, because the merge gate is v1.
- **v1:** three-reviewer summaries ("2 of 3 reviewers done"), the `gate` policy (`neutral` /
  `critical` / `charges`) that can make the conclusion `failure`, and the receipt link.
- **v1.1:** the `Branch review` action and its estimate/cancel shape (RP-05).

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
- **At most one placeholder comment**, only for an explicit review trigger that has no other visible
  acknowledgement (the label or the UI picker), and it is **edited in place**, never posted as a
  series. It is off for automatic reviews and the Check Run action. An `@jury-forge` mention is a
  reply turn, not a review (ADR-0013, ADR-0024 §1): its answer is the response, and it gets no
  placeholder.
- **No per-reviewer comments**, no “still working” comments, no duplicate “done” comments.

## 1. The Check Run contract

One Check Run per `(repository, PR, head SHA)`, named `Jury Forge`.

| Phase | Status | Title | Summary | Actions |
| ----- | ------ | ----- | ------- | ------- |
| Trigger accepted | `queued` | `Jury Forge: queued` | “Review requested by <actor> · mode: pr-review” | `PR review`, `Branch review` (v1.1) |
| Turn started | `in_progress` | `Jury Forge: reviewing` | “Routing the jury…” | — |
| Routed | `in_progress` | `Jury Forge: reviewing` | “3 reviewers: Security, Correctness, Tests · 6 files” | — |
| Reviewers running | `in_progress` | `Jury Forge: reviewing` | “2 of 3 reviewers done · 3 findings so far” | — |
| Publishing | `in_progress` | `Jury Forge: publishing` | “Grounding and posting the review…” | — |
| Done | `completed` | `Jury Forge: review posted` | “1 blocking, 2 advisory · 3 findings · 45 s” | Details link |
| Config fallback | `completed` / `action_required` | `Jury Forge: configuration needed` | “No reviewers bound to this repo” + the remedy | Details link |
| Failed | `completed` / `neutral` (`failure` under a blocking v1 `gate`) | `Jury Forge: review failed` | The typed reason and the next action | Details link |
| Cancelled | `completed` / `cancelled` | `Jury Forge: cancelled` | “Cancelled by <actor> / label removed / PR merged” | — |

Rules:

- The Check Run is created on PR open/synchronize with the `PR review` action (and `Branch review`
  in v1.1), so the trigger is discoverable without a comment — **but only in repositories with at
  least one enabled reviewer binding, and never on a fork PR** (forks are skipped by default,
  ADR-0024 §1). In an unbound repo the label and the UI picker still answer with the configuration
  fallback, so manual-first holds without a neutral check on every PR in the organisation. On a fork
  PR, a maintainer trigger (label or UI) creates the Check Run when the review starts.
- A trigger updates the **existing** Check Run for the head SHA; it does not create a second one.
- The conclusion follows the verdict policy: `neutral` by default (always, in the MVP), `failure`
  only when the repo opted into a blocking `gate` (v1) and a finding is blocking, and
  `action_required` for a configuration fallback.
- The details link goes to the session view (or to the install/setup page if the instance has no
  session for the SHA). It is built from the stored origin (ADR-0021), never from a request `Host`.
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

For an **explicit review trigger** through the label or the UI picker, the user took an action and
expects a conversational acknowledgement. The product posts **one** issue comment by
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
- **On by default for the label and the UI picker**; **off** for automatic reviews and the Check Run
  action (the Check Run is its own feedback); never for a mention (a reply turn answers in place). A
  repo can disable it for label triggers, and a user can opt out.
- **Large PRs:** the estimate and planned coverage ([`large-pr-handling.md`](large-pr-handling.md))
  go into this placeholder and the Check Run summary — never a second comment.
- The placeholder is found only among comments **authored by the Jury Forge App** (App ID and bot
  user ID, ADR-0024 §2). A comment from anyone else that carries the hidden marker is ignored, so a
  user cannot make the bot edit their comment or hijack the progress message.
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
| Provider 401/429/5xx | `neutral` with the remedy when the repo `gate` is `neutral` (the default, and always in the MVP); `failure` when the repo opted into a blocking `gate` (v1) | One failure comment with the remedy, or edit the placeholder | Turn failed, retryable |
| Cap exceeded | `neutral`/`failure` per policy | The review/status says the cap was hit; no silent truncation | Turn completed with a cap reason |
| Label removed | `cancelled` | Placeholder edited to “cancelled” (if it exists) | Turn cancelled |
| PR merged mid-turn | `cancelled` or `completed` with the partial result | No new comment after archive | Session archived |
| Duplicate trigger | One Check Run, one review | No duplicate comment | One turn (dedupe) |

- A failure is never silent. The Check Run title says "review failed" with the typed reason, and the
  user gets one actionable message (fallback or placeholder), not a stack trace.
- **Why a failure is `neutral` by default:** a provider outage or quota error is not a finding about
  the code, and it must not turn every PR red. **Why it is `failure` under a blocking gate:** GitHub
  counts `neutral` as passing a required check, so a repo that asked for a gate would otherwise merge
  unreviewed code during an outage (fail-open). With a gate, the review fails closed and a retry or
  an owner override clears it.
- A retry is explicit (Check Run action, label, UI) unless the queue retries a transient provider
  error within the same turn.
- A cancelled turn does not post a review and does not resolve a thread.

## 6. What the user sees, by trigger

| Trigger | Immediate signal | Progress | Completion |
| ------- | ---------------- | -------- | ---------- |
| Check Run action | Check Run → `in_progress` (no placeholder) | Check Run summary updates | Review + `completed` |
| `jury:pr-review` label | Check Run → `in_progress`; placeholder (default on) | Check Run summary | Review + `completed` |
| UI picker | Session detail opens; placeholder (default on); Check Run updates | Session timeline | Review + session state |
| `@jury-forge` mention (reply turn, not a review) | None needed: the answer is the response | Session timeline | One reply in the thread or PR conversation; the Check Run is not changed |
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
- [ ] A label or UI-picker trigger shows one placeholder comment, edited in place, never a series;
      a mention gets no placeholder.
- [ ] A comment by another user that carries the hidden marker is never edited or treated as the
      placeholder.
- [ ] The Check Run is not created on PR open in a repo with no enabled binding, nor on a fork PR;
      a manual trigger on either still gets a visible response (fallback or review).
- [ ] The placeholder defaults off for automatic and Check Run triggers.
- [ ] A provider failure produces a `neutral` "review failed" Check Run with the remedy under the
      default gate, and a `failure` Check Run under a blocking gate (v1); always one actionable
      message; no silent failure.
- [ ] A no-reviewers or required-unavailable state produces `action_required` plus the existing
      fallback comment.
- [ ] A cancelled turn produces `cancelled` and no review.
- [ ] The session UI shows live status, routing, reviewer progress, findings so far, and cost.
- [ ] The Check Run details link and the placeholder link resolve to the same session.
- [ ] A duplicate trigger does not create a second Check Run, comment, or review.
- [ ] No screen or comment prints a machine code.

## 8a. Security and privacy

- Check Run summaries and the placeholder are built from structured data (counts, reviewer names,
  file paths, typed reasons) and escaped as Markdown; they never quote code, prompts, model output,
  or provider error bodies.
- Every forge write goes through the forge adapter's write queue, so status updates obey GitHub's
  secondary rate limits and never block the review publish.
- Status transitions are audited with actor and reason; the audit contains no code.
- Self-detection (App ID and bot user ID) applies to every comment the bot reads, including its own
  placeholder (ADR-0024 §2).

## 9. Metrics

- Time to first status (trigger → `in_progress`).
- Time to completion (trigger → review posted).
- Status visibility: sessions where the user can see a status without asking / total sessions.
- Placeholder comment count per session (target ≤ 1).
- Duplicate review/comment rate (target 0).
- Stuck `in_progress` rate (target 0; a cron sweep in `worker` fails it visibly).
- Failure-to-remedy rate: failures with a named next action / all failures (target 100%).

## 10. Open questions

| ID | Question | Default |
| -- | -------- | ------- |
| RP-01 | Is the placeholder comment on by default for manual triggers? | **Yes** for the label and the UI picker; off for automatic and Check Run triggers; never for a mention, which is a reply turn (MVP spec review, 2026-11-27). A repo can disable it. |
| RP-02 | Does the Check Run carry the full finding list, or only a summary? | Summary + details link; the review carries the findings. |
| RP-03 | What is the stuck-turn threshold before the cron sweep fails it? | 2× the p95 completion target (20 min), configurable. |
| RP-04 | Do we notify Slack/email on completion? | No in v1; GitHub notifications are enough. v1.x. |
| RP-05 | Does a branch review show a different progress shape (estimate, cancel)? | Yes: estimate before start, cancel action; same completion contract. |
