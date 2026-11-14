# ADR-0012: PR sessions and agent-only resolution

- Status: proposed
- Date: 2026-11-15
- Owners: product + architecture
- Supersedes: the PoC's one-shot run model
- Revisit trigger: GitHub changes review-thread APIs/permissions, or session volume exceeds the
  per-PR store.

## Context

The PoC posts one review per run and stops. The owner wants every PR to have a session: Jury Forge
comments, the user replies, and Jury Forge responds with context alive. The session must survive
restarts and multi-day waits. Only Jury Forge should resolve its conversations after a satisfactory
user response.

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
  `agent_runs`, `tool_calls`, `resolutions`.
- **Only Jury Forge resolves its own threads programmatically.** `resolve_thread` is a guarded tool:
  bot-owned thread, human response after the last question/finding, evidence that the finding is
  addressed, verifier/confidence threshold, summary posted, audit event. A new human reply reopens.
- Humans can resolve in GitHub UI; the session records that as a human action and does not fight it.
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
- Decide whether a user must explicitly confirm before resolve (default: agent judges with evidence;
  explicit confirmation for ambiguous cases).
