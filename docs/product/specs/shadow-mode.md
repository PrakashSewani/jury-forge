# Spec: Shadow mode (B-01)

- Status: draft — backlog, not committed (see `capabilities.md` §13)
- Owner: product + AI pipeline
- Date: 2026-11-15
- Principles: 2 (trustworthy review), 6 (measure quality), 8 (fail visibly), 14 (manual-first)
- Related ADRs: ADR-0012 (sessions), ADR-0016 (reviewer catalog), ADR-0018 (tiering)
- Source: proposed by the architect during the capability review; owner asked for it to be recorded
  as backlog and specified (2026-11-15). Not an owner requirement yet.

## Problem

A team will not enable a bot that posts on every PR until it has seen the bot's output on real
work. A new or changed reviewer is risky for the same reason. Today the only options are "post
publicly" or "preview/approve one run at a time", which cannot answer "would this reviewer have
helped us last month?". Without that evidence, adoption stalls and prompt changes ship on faith
(principle 6).

## Users and jobs

- **P1 Platform engineer:** "Try the jury on live traffic without bothering the authors."
- **P3 Staff engineer / SME:** "Compare a new reviewer version with what humans actually flagged."
- **P2 Security lead:** "Prove a security reviewer catches what we catch before it can comment."

## Behaviour

1. An admin/SME sets a **reviewer binding** (or a whole repo) to `mode: shadow`. Default is `live`.
2. When a review is triggered (manual or by automatic policy), the router selects shadow reviewers
   exactly as for live ones; the turn pipeline runs unchanged up to the **write** step.
3. The write step is suppressed: **nothing** is posted to the forge — no review, comment, label,
   check run, or thread. Findings are stored with state `shadow` and are marked unpublished.
4. A shadow session does not converse: it handles the trigger and, if policy says so, a re-run on
   push. It never replies to threads and never resolves anything.
5. After the PR is merged or closed (or on demand), the system builds a **shadow report** by
   comparing shadow findings with (a) human review comments, (b) later commits touching the cited
   lines, and (c) human labels ("would have been useful", "noise") given by SMEs/maintainers.
   Each shadow finding is classified `matched_human`, `addressed_by_commit`, `unmatched`, or
   `labelled_useful/noise`; human-only issues are counted as `missed`.
6. The report per reviewer version shows counts, a precision proxy, a recall proxy, cost, and latency.
   Every proxy is labelled an **estimate** with the matching method named.
7. An admin/SME **promotes** a reviewer or repo to `live` from the report. Promotion is audited and
   never automatic.

Edge cases:

- Mixed repo: some bindings `shadow`, others `live` — only live ones publish; the fallback comment
  for "no reviewer" must not fire solely because the only bound reviewer is in shadow (a distinct
  status: "shadow reviewers ran; nothing published").
- Force-push/rebase: findings tie to the head SHA they were produced at; the comparison uses the
  merge-base-relative diff and reports "inconclusive" when lines cannot be mapped.
- Budget exhausted mid-shadow: stop, record `budget_stopped`, never take budget from live reviewers.
- Fork PRs follow the existing fork policy; shadow does not widen it.

## Non-goals

- Not a preview/approve feature (that gates one publish; this publishes nothing).
- Not an A/B router sending different live traffic to different versions.
- Not a way to score individual humans; reports aggregate by reviewer version, never by person.
- No automatic promotion or demotion.

## Acceptance criteria

- [ ] Given a `shadow` binding, when a PR is reviewed, then zero forge writes occur (verified with a
      recording forge stub) and findings are stored as `shadow`.
- [ ] Given only shadow reviewers are bound, when a review is triggered, then no "no reviewers"
      comment is posted and the UI shows "shadow ran, nothing published".
- [ ] Given a merged PR with shadow findings, when the report is built, then each finding has one
      classification and the matching method and confidence are visible.
- [ ] Given a human labels a finding "noise", when the report is rebuilt, then the precision proxy
      changes and the label is audited with the actor.
- [ ] Given a promotion, when it is confirmed, then an audit event records actor, reviewer version,
      and the report it was based on.
- [ ] Shadow turns count toward budgets and are shown as shadow cost, separate from live cost.

## Metrics

Adoption (repos that ran shadow before going live), report coverage (% of shadow PRs with a final
classification), agreement between proxy and later SME labels, cost of shadow runs per accepted
live finding.

## Security and privacy

- Shadow still sends code to the configured provider; the egress policy, redaction, and
  provider allowlist (B-02) apply identically. The UI states this plainly.
- Unpublished findings hold code excerpts; they follow the session retention class (default 90
  days, ADR-0012) and are deleted with the session.
- Visibility: shadow findings and reports are visible to maintainers, SMEs, admins, and auditors —
  **not** to PR authors or plain members, to avoid leaking a bot that is "not live".
- Human comments used for comparison are untrusted data; matching never executes or follows them.

## Failure modes

- Matching is wrong → report is an estimate and labels override it; no automated decision depends
  on it.
- Comparison job fails → report shows `pending/failed` with a retry; findings are kept.
- Shadow accidentally publishes → treated as an S1 defect; the write step must fail closed in shadow
  (a test, not a convention).

## Rollout

Backlog item; target v1 if promoted. Requires the session/finding store and the benchmark metric
definitions. Documented in the operator guide as "run shadow for two weeks before enabling live".

## Open questions

- SH-01: how are shadow findings matched to human comments (location proximity only, or semantic
  matching with a model)? Default: location + file proximity first; model-assisted matching is
  optional and its cost is shown. Close with the benchmark.
- SH-02: do shadow reports persist beyond the retention window as aggregate statistics? Default:
  yes, aggregates only (no code excerpts); close with the retention ADR.
