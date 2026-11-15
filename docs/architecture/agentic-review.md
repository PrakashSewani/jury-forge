# Architecture: agentic review

This is the target architecture for agentic PR sessions. It extends
[`overview.md`](overview.md); the product contract is in
[`../product/specs/agentic-review-sessions.md`](../product/specs/agentic-review-sessions.md).

## One-page picture

```
GitHub (PR, review comments, issue comments, pushes)
   │ webhooks
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Event Gateway  (verify, normalize, idempotent, enqueue)             │
└───────────────┬─────────────────────────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Session Service  (PR session, threads, messages, findings, turns)   │
│  · per-session serialization / debounce / generation                │
└───────────────┬─────────────────────────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Turn Queue  (durable jobs, leases, retries, DLQ, cancellation)      │
└───────────────┬─────────────────────────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Agent Runtime  (graph/loop, tools, subagents, chair, guardrails)    │
│   uses LangGraph.js (recommended) or a thin turn runner             │
└──────┬──────────────────┬──────────────────┬────────────────────────┘
       ▼                  ▼                  ▼
 Context Service     Provider Gateway    Resolution Guard
 (diff + graph +     (catalog, keys,     (evidence, user reply,
  packs + history)    models, retries)    bot-owned thread)
       │                  │                  │
       └──────────────────┴──────────────────┘
                          ▼
                 GitHub Writer  (reply, resolve, label, check)
                          ▼
                 Postgres + object storage + audit
```

## 0. Interface, capacity, and visibility

- **GitHub is the conversation surface:** ask, reply, resolve. **The website is the control plane
  and deep session view.** The harness is internal and never user-facing.
- **Sessions are cheap rows; turns are the scarce resource.** No per-session process. An open
  session can wait for days with zero compute; a webhook reply wakes it.
- **Personal defaults, org tuning:** 1 turn/session, 2 concurrent turns/org, 2/user, 2–4/worker;
  org admin can raise within limits; repo override. No hard open-session cap; soft warning at 500.
- **Roles follow GitHub repo access:** owners/admins configure, maintainers trigger/reply, members
  with repo read view, viewers read-only, auditors see audit. A session is visible to repo readers,
  not just the trigger user. Mentions of humans are requests for human input, not bot instructions.
- **Branch review target:** the branch delta vs the **repository default branch**. The graph is
  repository context; a branch review does not audit untouched files. Full details:
  [`../product/specs/session-capacity-and-visibility.md`](../product/specs/session-capacity-and-visibility.md).

## 1. Components

| Component | Responsibility | Non-responsibility |
| --------- | -------------- | ------------------ |
| **Event Gateway** | Verify GitHub webhook, normalize, deduplicate, persist, enqueue. No agent work. | No model calls, no long work. |
| **Session Service** | Own `PrSession`, `Thread`, `Message`, `Finding`, `Turn`; serialize turns; debounce; generation. | No provider calls. |
| **Turn Queue** | Durable jobs, leases, retries, DLQ, cancellation, fairness. | No session logic. |
| **Agent Runtime** | Plan, select agents, run loop/subgraphs, tools, chair, guardrails. | No GitHub credentials beyond the writer. |
| **Agent Router** | Select agents by explicit request, config, path/language/label, availability, budget. | Not a prompt. |
| **Context Service** | Diff (T0); branch delta + repo graph (T2); instructions, packs, prior findings; token budget; manifest. | Not the source of truth for code. |
| **Provider Gateway** | Provider/model catalog, key encryption, origin binding, calls, retries, usage/cost. | No prompt policy. |
| **Resolution Guard** | Check evidence, user response, bot ownership, confidence before resolve. | No free-form model decision without checks. |
| **GitHub Writer** | Reply in thread, post PR comment, resolve/reopen, label, check. | No agent planning. |
| **Audit/Telemetry** | Every trigger, turn, tool, model, reply, resolve. | Not a best-effort activity feed. |

## 2. Session and turn model

A single PR session is the unit of serialization. A session can have many threads, but only one
turn runs at a time.

```
PrSession
  id, installation_id, repo_id, pr_number, state, generation, lease, last_turn_at
Thread
  id, session_id, github_thread_id, file, line, state, created_by
Message
  id, thread_id, role, agent_id, github_comment_id, body, created_at
Finding
  id, session_id, thread_id, file, line, severity, status, fingerprint, evidence
Turn
  id, session_id, trigger, input, status, plan, output, cost, started_at, finished_at
AgentRun / ToolCall
  id, turn_id, agent_version_id, tool, input, output, tokens, latency, status
Resolution
  id, thread_id, actor, evidence, confidence, at
```

- `state`: `created`, `active`, `waiting_for_user`, `resolved`, `archived`.
- A push advances `generation`; the session stays, the thread state stays, findings are marked
  `needs_recheck`.
- The turn queue uses `(session_id, generation)` as part of the idempotency key; a stale turn is
  canceled or skipped.
- A human reply while a turn runs is queued and coalesced; no parallel turns.

## 3. GitHub event mapping

| GitHub event | Session effect |
| ------------ | -------------- |
| `pull_request.opened` | Create a neutral `Jury Forge` check run with `PR review` / `Branch review` actions; create a session only if policy/trigger. |
| `pull_request.ready_for_review` | Same as opened if policy. |
| `pull_request.labeled` | If a `jury:*` mode/capability label is added, enqueue one turn; coalesce multiple labels. |
| `pull_request.unlabeled` | If a mode label was removed, cancel a queued turn (and before publish where possible). |
| `check_run.requested_action` | If action `review` or `context`, enqueue the turn (primary manual trigger). |
| `pull_request.synchronize` | Advance generation; mark findings `needs_recheck`; enqueue a background index refresh only for branch review/graph; no auto-post unless policy. |
| `pull_request.closed` | Archive session. |
| `issue_comment.created` on PR | If Jury Forge is mentioned, enqueue a PR-level turn; no slash commands; ignore bot. |
| `pull_request_review_comment.created` | If reply to a Jury Forge thread, enqueue thread turn; ignore bot. |
| `pull_request_review_comment.edited/deleted` | Update stored message; no automatic turn unless it changes the question. |
| `pull_request_review.submitted` | Add context; respond only if mentioned/policy. |
| `push` to default branch | Enqueue graph incremental update; no PR session turn. |
| `check_run` / `workflow_run` (other actions) | Optional context for the agent; no turn by default. |

> **Reviewer picker:** tested 2026-11-15; requesting `jury-forge[bot]` via the review-request API did
> not add the app as a reviewer. Arbitrary GitHub Apps cannot be requested there (Copilot is
> special). Use the Check Run action and `jury:pr-review` label; revisit if GitHub adds a first-class
> AI reviewer request.

Exact event names and GraphQL mutations must be verified in the GitHub spike. The App permissions
are expected to include `contents: read`, `pull_requests: write`, `issues: write` (PR conversation
comments), `checks: write`, and `metadata: read`; confirm before shipping.

## 4. The turn pipeline

1. **Ingest** — normalize the event, load session/thread, check bot/self, dedupe.
2. **Plan** — classify intent: `review`, `answer`, `verify`, `resolve`, `clarify`, `full_review`.
3. **Route** — select agents (explicit > config > scope > default). Record why.
4. **Context** — diff, changed files, graph slices, instructions, packs, prior findings; token
   budget and manifest.
5. **Execute** — run agents in parallel with bounded tools; each agent has a loop cap.
6. **Ground** — verify file/line/evidence at the generation SHA; drop or downgrade ungrounded claims.
7. **Chair** — dedupe across agents, surface disagreement, assign severity/confidence, decide verdict.
8. **Write** — one reply per thread/turn (or one PR summary); inline suggestions where valid.
9. **Update** — finding/thread state; resolution guard; audit.
10. **Wait/archive** — `waiting_for_user` or `resolved`; retention.

Every step is recorded as a turn step with attempt, timing, error, and metrics.

## 5. Harness decision

The product needs a harness for **state, loops, tools, and human-in-the-loop**. The options are
compared in [`../decisions/ADR-0010-agent-runtime-harness.md`](../decisions/ADR-0010-agent-runtime-harness.md).

Recommendation for the spike:

- **LangGraph.js (MIT) + Postgres checkpointer** as the primary candidate. `thread_id` = PR session;
  `interrupt` waits for a human reply; `Command(resume=event)` continues; subgraphs per agent;
  supervisor/chair; checkpointed state. This maps directly to the product.
- **Fallback:** a thin turn runner on **Vercel AI SDK (Apache-2.0)** + our Postgres session tables.
  Less framework, more control; more code to own.
- **Rejected for v1:** Mastra (Apache-2.0 core with `ee/` portions; open-core risk), Restate (BSL),
  Inngest (SSPL), Cloudflare Agents (runtime), Temporal (operational weight; revisit if needed).

The session of record stays in our Postgres schema regardless of the harness. The harness may keep
its own checkpoint tables in a separate schema; that is acceptable, but the product must be able to
replay a session from our tables if the harness is replaced.

## 6. Provider gateway

See [`../product/specs/provider-model-discovery.md`](../product/specs/provider-model-discovery.md)
and ADR-0011.

- Provider onboarding validates the key by calling `/models`; no model free text.
- Catalog cache + versioned model registry for capabilities/prices.
- Keys envelope-encrypted, write-only, origin-bound, rotatable.
- Adapter capability schema validates params (no `stream` until implemented).
- Usage/cost normalized per call; budget checked before each call.
- The gateway is the only component that knows provider wire formats.

## 7. Repo knowledge graph

See [`../product/specs/repo-knowledge-graph.md`](../product/specs/repo-knowledge-graph.md) and
ADR-0014.

- Postgres adjacency tables + content-addressed object storage; optional vector store later.
- Index version per `(repo, commit)`; incremental update on every branch/T2 review run and default-branch push.
- In T2, Context Service uses summaries first, expands via tools, and records a manifest; T0 uses the diff only.
- Context tiers: **T0** diff (PR review, strict), **T1** bounded reads (rejected for PR review, ADR-0019), **T2** graph (branch review, explicit, estimated, cancellable, v1.1 per ADR-0018).

## 8. Resolution guard

`resolve_thread` is used only in `auto` mode, with a server-side guard. `suggest` (default) posts a proposal and waits for a human to resolve natively/UI; `off` never resolves.

1. The thread was created by Jury Forge.
2. A human message follows the last agent finding/question.
3. The finding state is `addressed`/`verified`, or the human gave an accepted rationale.
4. Evidence is attached (code slice, commit, or explicit dismissal reason).
5. A verifier/guard agrees; confidence ≥ threshold.
6. The response summary is posted before the resolve mutation.
7. The resolution is audited; a new human reply reopens.

If any check fails, the tool returns a structured refusal and the agent asks a question instead. The
model cannot bypass the guard with a prompt. Humans can resolve in GitHub UI; that is recorded as a
human resolution and does not auto-reopen.

## 9. Security

- User replies and code are untrusted data; trust labels and nonce delimiters as in
  [`security.md`](security.md).
- Prompt injection can at most produce a bad draft; it cannot resolve a thread, publish to another
  repo, or read a key.
- Tools are read-only and bounded; no shell, no arbitrary network, no code execution in v1. A
  sandboxed, opt-in test/build mode is later.
- Provider keys: envelope encryption, write-only, origin-bound.
- GitHub App tokens: installation-scoped, least privilege, short-lived.
- Rate limits: per session/turn/agent; bot-loop protection; mention/reply requirement.
- Audit: every trigger, selection, tool call, model call, reply, resolve.
- Data retention: sessions, messages, graph, raw responses; export/delete.

## 10. Failure modes

| Failure | Behavior |
| ------- | -------- |
| Duplicate webhook | One turn; dedupe by delivery id. |
| Two user replies while a turn runs | Coalesce; one follow-up turn. |
| Agent crash mid-turn | Lease expires; turn retries from the last step; reply is idempotent. |
| Provider 429/5xx | Retry/backoff; fail the agent, not the session; note it. |
| Model removed | Agent becomes `configuration_error`; new turns fail visibly; existing snapshot kept. |
| Graph stale | Mark stale; review proceeds with warning or waits per policy. |
| GitHub resolve fails | Do not claim resolved; leave thread open; retry/audit. |
| User replies after resolve | Reopen thread; new turn. |
| PR merged while a turn runs | Finish or cancel; no new replies after archive. |
| Budget exhausted | Stop before next call; post status; wait for human. |
| Prompt injection detected | Do not follow; optionally flag and ask. |

## 11. Deployment

Docker Compose reference:

- `app` (API + UI)
- `worker` (turns, agents, tools)
- `indexer` (repo graph; can share the worker image)
- `scheduler` (janitor, retention, model refresh)
- `postgres`
- optional `redis` (queue/cache), `minio` (object storage), `caddy` (TLS)

No Cloudflare. No external control plane. See [`operations.md`](operations.md) and
[`deployment.md`](deployment.md).

## 12. What changes from the previous target

- The one-shot review pipeline becomes an **event-driven session** with many turns.
- A **provider/model catalog** replaces free-text model configuration.
- A **repo graph** becomes a first-class service, not an optional reference fetch.
- **Manual trigger** is the primary path; automatic review is config-as-code.
- The **agent router** is a product surface, not only a prompt.
- **Resolution** is a guarded agent action, not a human-only GitHub button.
- The UI becomes a **session inbox + timeline**, not only a runs list.
