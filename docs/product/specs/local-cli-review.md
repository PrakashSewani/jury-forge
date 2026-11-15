# Spec: Local / CLI diff review (B-03)

- Status: draft — backlog, not committed (see `capabilities.md` §13)
- Owner: product + architecture
- Date: 2026-11-15
- Principles: 1, 4, 7 (extensible at the boundaries), 10 (no traps), 11 (start with the wedge)
- Related ADRs: ADR-0001, ADR-0008, ADR-0011, ADR-0016, ADR-0018; non-negotiable 8 (forge-agnostic)
- Source: proposed by the architect; owner asked for it to be recorded and specified (2026-11-15).

## Problem

Today the product can only be tried through a GitHub App, a public webhook URL, and a real PR. That
is a heavy first experience, it blocks CI-only or pre-push use, and it makes the evaluation harness
awkward to drive. A review of "this diff" should not require a forge.

## Users and jobs

- **P4 Solo developer:** "Review my branch before I open the PR."
- **P1 Platform engineer:** "Evaluate the jury without exposing a webhook."
- **P5 AI platform team:** "Run a review in CI and fail on severity."
- **Maintainers of the evaluation harness:** "Run labelled diffs through the real pipeline."

## Behaviour

1. A command-line client (`jury-forge review`, name provisional) sends a **change set** to the
   operator's own instance. Inputs: a local git range, a patch file, or stdin. The client never holds
   provider keys; keys stay write-only on the instance.
2. The client authenticates to the instance with a short-lived, scoped **personal token** tied to a
   user and role. Roles apply: a user may only review against repos/policies they are allowed to use.
3. The change set is mapped to a **repo identity** (explicit `--repo`, or from the git remote) so the
   router can use that repo's reviewer bindings, data policy (B-02), and caps. An unmapped diff uses
   an admin-defined **local profile** (a named reviewer set); with neither, the CLI fails with a clear
   message rather than guessing.
4. The instance runs the normal pipeline on the change set: T0 diff only (T1 bounded reads are
   rejected for PR review and not part of the CLI in v1), grounding, dedupe, chair, hard caps.
5. Output goes to the terminal as text, and optionally as JSON, Markdown, or SARIF. A
   **severity threshold** option sets the exit code for CI.
6. The run is stored as a **local review record** (`source: cli`), not a PR session: no threads, no
   replies, no resolve. It appears in the UI under a separate view with cost and audit.

Edge cases:

- Oversized change set: same behaviour as B-04 (coverage manifest, partial-review statement).
- Dirty tree/untracked files: only the declared diff is sent; the CLI shows exactly what will be
  uploaded and requires a flag to include untracked files.
- Secrets in the diff: redaction runs server-side before any provider call; the CLI also warns on
  obvious secret patterns before upload.
- Instance unreachable or token expired: non-zero exit with a distinct code; nothing is cached
  with credentials.
- Offline use is out of scope (the instance is required).

## Non-goals

- No standalone mode that holds provider keys on a laptop.
- No interactive conversation in the first cut.
- No posting to any forge from the CLI.
- No hosted service; the instance is always the operator's.

## Acceptance criteria

- [ ] Given a local git range, when reviewed, then findings cite files/lines that exist in the
      uploaded diff and the same grounding rules as PR review apply.
- [ ] Given a CI severity threshold, when a finding meets it, then the exit code is non-zero and the
      output lists the findings.
- [ ] Given an unmapped diff and no local profile, then the command fails with an actionable message
      and nothing is sent to a provider.
- [ ] Given a user without access to the mapped repo, then the request is denied and audited.
- [ ] Given a repo with a provider allowlist, then the CLI review obeys it (B-02).
- [ ] The CLI never prints or stores provider keys; the token is revocable and audited.

## Metrics

Time from install to first successful review, % of evaluators who used CLI before the forge, CI
adoption, evaluation-harness runs through the CLI path.

## Security and privacy

- The diff is untrusted input. Uploads are size-limited, authenticated, and rate-limited per user.
- The token is scoped (review only), short-lived, and listed/revocable in the UI; all actions are
  audited with the user.
- Data retention for local review records defaults shorter than sessions (open question below).
- The same egress policy, redaction, and provider allowlist apply as for PR review.

## Failure modes

Network failures fail visibly with retry guidance; a partially processed run is marked failed with
cost incurred, never silently dropped; duplicate submission with the same idempotency key returns the
existing run.

## Rollout

Backlog; v1.x if promoted. Requires instance API authentication and the change-set abstraction
(the review pipeline must not depend on forge types). Documented as the "try it without GitHub" path.

## Open questions

- CLI-01: how is a local user mapped to repo access without a forge identity? Default: instance role
  plus an admin-defined repo list per user until forge identity linking exists; close with roles ADR.
- CLI-02: retention for local review records. Default: 30 days; close with the retention ADR.
