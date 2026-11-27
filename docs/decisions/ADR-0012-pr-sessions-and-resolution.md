# ADR-0012: PR sessions and resolution modes

- Status: accepted (G0, 2026-11-16; amended by ADR-0024; v1 override rights amended by ADR-0028)
- Date: 2026-11-15
- Owners: product + architecture
- Supersedes: the PoC's one-shot run model
- Revisit trigger: GitHub changes review-thread APIs/permissions, or session volume exceeds the
  per-PR store.

## Context

The PoC posts one review per run and stops. The owner wants every PR to have a session: Jury Forge
comments, the user replies, and Jury Forge responds with context alive. The session must survive
restarts and multi-day waits. Resolution defaults to `suggest` (the agent proposes; a human
resolves natively), with `auto`/`off` opt-in; only `auto` uses the guarded bot resolve.

## Options

1. **One-shot review** — current PoC; rejected.
2. **PR-level chat session** — one session per PR, threads as sub-conversations; chosen.
3. **Thread-only sessions** — one session per review comment; fragments context; rejected.
4. **External chat platform** — Slack/Discord; wrong surface; rejected.
5. **Human-only resolution** — simple; does not meet the owner directive.

## Decision

- One **PR session** per `(installation, repository, PR)`, with **threads** for individual review
  conversations and findings. The session survives pushes via generation.
- Turns are **event-driven and serialized per session**. A user reply enqueues a turn; multiple
  replies are debounced/coalesced; no parallel turns.
- The session of record is Postgres: `sessions`, `threads`, `messages`, `findings`, `turns`,
  `agent_runs`, `tool_calls`, `resolutions`, `session_participants`.
- The session belongs to the **PR**, not the trigger user. It is visible to repo readers; the
  trigger user is audit. Mentions of humans are requests for human input, not bot instructions.
  Roles/visibility are in [`../product/specs/session-capacity-and-visibility.md`](../product/specs/session-capacity-and-visibility.md).
- **Resolution modes:** `resolve: suggest | auto | off` (default **`suggest`**), configurable per
  instance/repo.
- **`suggest` (default):** the agent posts a proposed resolution summary (“this looks resolved
  because …”) and waits. The thread is resolved by a **human** using GitHub’s native **Resolve
  conversation** or the Jury Forge UI. A normal “thanks/fixed” reply does not resolve. There is no
  slash command.
- **`auto` (opt-in):** the agent may resolve its own bot-owned thread when the evidence guard passes
  (human response after the last question/finding, evidence, verifier/confidence, summary, audit). A
  new human reply reopens.
- **`off`:** the agent never resolves; humans resolve natively or in the UI.
- **Humans can always resolve manually.** The session records that as a human action and does not
  fight it.
- **Human override:** owner/admin can resolve/reopen/dismiss any thread; SME can do so in their
  domain/assigned repos; maintainer can reopen to challenge; author/member reply only; auditor
  read-only. An override requires a reason, is audited, and the agent does not auto-re-resolve
  without new evidence.
- **Safeguard:** the wrong-resolution rate (resolved threads later reopened or overridden) is a
  benchmark and scorecard metric. In `suggest`, the human is the resolver, so the metric measures the
  proposal quality; in `auto`, it measures the guard.
- A PR merge/close archives the session; retention is configurable (default 90 days).

## Consequences

**Easier:** real conversation; context reuse; resolution audit; a session inbox and timeline; the
agent can ask a question and wait.

**Harder:** idempotency, ordering, debounce, stale generation, thread mapping, GitHub permissions
for replies/resolve, session retention, and a much richer UI.

**Invariants:** one turn per session; every message has a role and actor; every resolution has
evidence; no resolution without a human response; every external effect has an idempotency key.

## Security and operations

- User replies are untrusted; prompt-injection defenses apply.
- Resolution guard is server-side; the model cannot bypass it.
- GitHub comment replies/resolve use the installation token; least privilege.
- A failed resolve leaves the thread open and records an error; never claim success.
- Session/message retention and deletion; audit export.

## Evidence

- GitHub review threads support replies and resolution (GraphQL `resolveReviewThread`); verify App
  permissions in the spike.
- Spec: [`../product/specs/agentic-review-sessions.md`](../product/specs/agentic-review-sessions.md).
- Live PoC evidence: reviewers deleted, run history keeps only UUIDs; sessions must snapshot identity.

## Follow-ups

- Verify GitHub event names, reply mutation, resolve mutation, and permissions.
- Define the satisfaction/guard criteria with examples (fixed, won't fix, duplicate, question).
- Track the wrong-resolution rate (resolved then reopened/overridden) in the benchmark and scorecards;
  tune the guard's evidence threshold, not the ownership model.
