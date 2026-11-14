# Spec: History-seeded conventions (B-06)

- Status: draft — backlog, not committed (see `capabilities.md` §13)
- Owner: product + AI pipeline + security
- Date: 2026-11-15
- Principles: 2, 3, 4, 6, 13
- Related ADRs: ADR-0017 (knowledge sources), ADR-0016 (SME ownership), ADR-0011
- Depends on: knowledge system (`knowledge-system.md`), provider allowlist (B-02)
- Source: proposed by the architect; owner asked for it to be recorded and specified (2026-11-15).

## Problem

"A reviewer that knows our standards" is the thesis, but writing the standards down is slow, and
most teams' real conventions live in years of human review comments. SMEs rarely have time to
write a pack from scratch. Mining history can draft it, but it also moves human comments, which
may contain secrets or personal data, through a model, and the output risks encoding the loudest
reviewer's taste as policy.

## Users and jobs

- **P3 Staff engineer / SME:** "Draft a conventions pack from what we actually say in reviews, and
  let me approve it."
- **P1 Platform engineer:** "Bootstrap a new repo's reviewer quickly."
- **P2 Security lead:** "Ensure nothing sensitive is mined or kept."

## Behaviour

1. An SME/admin starts a **mining run** for a repo with bounds: a time window and/or maximum number
   of merged PRs, and the paths in scope. The UI shows an **estimate** (comments, tokens, cost) and
   the provider that will see the text (B-02 policy applies). The run requires explicit confirmation.
2. The system collects human review comments from merged PRs, excluding bot authors, deleted or
   hidden comments, and PRs from forks outside policy.
3. Comments are **redacted** (secrets, tokens, emails, obvious personal data) before any model call.
4. A model clusters recurring themes and drafts **candidate rules**. Each candidate has: a plain
   statement, rationale, path/language scope, evidence as **permalinks** to the source comments,
   number of distinct reviewers who raised it, frequency, and a confidence label.
5. Candidates below a threshold of **at least two distinct reviewers** (default) are shown as
   "weak" and are not selected by default.
6. The result is a **draft pack version**. An SME reviews each candidate: accept, edit, reject, or
   mark "not a convention". Only accepted candidates enter the pack; publishing creates an immutable
   content-hashed pack version through the normal knowledge-pack lifecycle and grants (ADR-0017).
7. Nothing is ever auto-published or auto-granted. A repeat run produces a **diff against the current
   pack** (new, changed, stale candidates), not a replacement.

Edge cases:

- Contradicting comments over time: shown together with dates; the newer is not assumed correct.
- A rule cites a deleted/edited comment: the permalink is marked stale; the rule stays but flags it.
- Very small or new repos: the run reports "not enough history" instead of inventing rules.
- Comments in other languages: processed as-is; the output records the language.

## Non-goals

- No model fine-tuning or training on comments.
- No per-person statistics, rankings, or reviewer profiling.
- No mining of commit messages, issues, or chat in the first cut.
- Not a replacement for SME-authored standards; it drafts, a human decides.

## Acceptance criteria

- [ ] Given a mining run, when started, then the estimate and receiving provider are shown and an
      explicit confirmation is required and audited.
- [ ] Given comments containing secret-like strings, then they are redacted before any provider call
      (verified by inspecting the pre-send manifest).
- [ ] Given a candidate raised by one reviewer only, then it is marked weak and unselected by default.
- [ ] Given SME acceptance, when published, then an immutable pack version exists with provenance
      (source run, permalinks, accepting SME).
- [ ] Given a disallowed provider for the repo (B-02), then the run is refused before any call.
- [ ] No output or UI view ranks or profiles individual commenters.
- [ ] A comment that contains instructions ("ignore previous rules…") produces no tool call, link
      fetch, or rule text beyond a plain-language convention (injection test).

## Metrics

Accepted-rule rate, share of accepted rules later cited in findings, SME time per accepted rule,
change in acceptance/false-positive metrics on the benchmark after adding the pack.

## Security and privacy

- Review comments are **untrusted data and personal data**. They are redacted, minimised, sent only
  to an allowed provider, and not retained beyond the run except as permalinks and the rule text.
- Evidence uses permalinks; author names are not stored in the pack by default.
- Output is validated as plain-language rules; model output cannot add tools, links to fetch, or
  grants.
- Mining runs are audited (actor, scope, provider, cost) and cancellable.

## Failure modes

Run exceeds budget → stops with a partial draft labelled incomplete; provider failure → resumable;
bad clustering → SME rejection; the draft never affects live reviews until published.

## Rollout

Backlog; later tier if promoted. Needs the knowledge system and B-02. Documented as an opt-in
bootstrap tool with its privacy implications stated first.

## Open questions

- HS-01: minimum distinct-reviewer threshold and history window defaults. Default: two reviewers,
  twelve months; tune on dogfood data.
- HS-02: do we store redacted source comment text for audit, or permalinks only? Default: permalinks
  only; revisit if auditors need more.
