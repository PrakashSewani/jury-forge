---
name: product-spec
description: Turn an owner capability statement, a PoC lesson, or a user need into a testable Jury Forge product spec. Use when defining a feature, scoping a milestone, writing acceptance criteria, or deciding what is explicitly out of scope.
---

# Product spec

A spec is the contract between the owner, the architecture, and the implementation. It describes
**what** and **why**, not **how**. If the how is durable, write an ADR as well.

## Inputs

- The owner's capability statement (quote it, with a date).
- The relevant persona and job-to-be-done from `docs/product/personas.md`.
- The principles that apply from `docs/product/principles.md`.
- Evidence from the PoC or the codebase, cited.
- Any open questions from `docs/analysis/open-questions.md`.

## Output

`docs/product/specs/<slug>.md`, using this template:

```md
# <Capability>

- Status: draft | review | approved | superseded
- Owner: <role>
- Date: YYYY-MM-DD
- Principles: <numbers>
- Related ADRs: <links>

## Problem
What hurts, for whom, why now. One or two paragraphs.

## Users and jobs
Which persona(s), which job-to-be-done, what they do today.

## Behaviour
The happy path, step by step. Then the important edge cases:
empty, error, retry, cancel, permission denied, stale data, large input, untrusted input.

## Non-goals
What this deliberately does not do. Be specific; this is where scope creep dies.

## Acceptance criteria
Testable statements. Each maps to a test or a manual check.
- [ ] Given ..., when ..., then ...
- [ ] ...

## Metrics
How we know it worked: quality, reliability, cost, adoption. Link the benchmark if relevant.

## Security and privacy
Trust boundaries, data touched, egress, retention, authz, secrets.

## Failure modes
What can fail, what the user sees, how it recovers.

## Rollout
Feature flag, migration, docs, support, rollback.

## Open questions
Each with a default assumption and a close condition.
```

## Rules

1. **Quote the owner.** Do not paraphrase a capability into something they did not ask for. Link
   the source.
2. **Separate what from how.** The spec says "the reviewer must cite evidence"; it does not choose
   the prompt or the model.
3. **Make acceptance testable.** "Better reviews" is not acceptance. "Precision ≥ 0.70 on the
   benchmark" is.
4. **Name the edge cases.** Most review bugs live in retries, stale SHAs, missing permissions, and
   untrusted input.
5. **Write the non-goals.** A spec without non-goals is a wish list.
6. **Record the security impact.** Even "none" is a statement.
7. **Keep it short.** 1–3 pages. If it needs more, split it or write an ADR.
8. **No implementation detail.** If a detail matters, it belongs in an ADR or the architecture.

## Acceptance criteria quality

Good:

- Given a duplicate webhook delivery, when the second arrives, then exactly one run is queued and
  the delivery is recorded as duplicate.
- Given a provider 429, when the retry budget is not exhausted, then the reviewer is retried with
  backoff and the run does not fail.
- Given a finding whose file does not exist at the head SHA, when grounding runs, then the finding
  is dropped and the run records why.

Bad:

- "The review is good."
- "Errors are handled."
- "The UI is nice."

## Handoff

- To the architect: the spec, the constraints, and the open questions.
- To security/quality: the data touched and the trust boundaries.
- To the docs editor: the spec and the ADR links.
- To the implementer: only after the human gate.

## Anti-patterns

- A spec that is really a design doc.
- A capability list with no acceptance criteria.
- "TBD" without an owner or a close condition.
- A feature that does not trace to a persona/job.
- A spec that ignores the PoC's known flaws.
