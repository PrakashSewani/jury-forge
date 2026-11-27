# Architecture: agentic review

> **Scope note (ADR-0023):** the v1 build is the **trust loop** (sessions, three built-in reviewers,
> diff + repository instructions, verdict/dissent, receipt, progress, feedback). The graph and
> branch review described here are **v1.1**; the catalog, capability registry, and knowledge system
> are **v1.2**. The runtime follows [`technical-approach.md`](technical-approach.md) (ADR-0026).

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
│ Turn Queue  (graphile-worker: per-session queue, debounce, retries) │
└───────────────┬─────────────────────────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Turn Runner  (thin step pipeline; chair and guards are code)        │
│   resolve → fetch → plan → review* → ground → verify → chair → …    │
└──────┬──────────────────┬──────────────────┬────────────────────────┘
       ▼                  ▼                  ▼
 Context Service     Provider Gateway    Resolution Guard
 (diff, T0+,         (catalog, keys,     (evidence, user reply,
  instructions,       models, retries)    bot-owned thread)
  history)
       │                  │                  │
       └──────────────────┴──────────────────┘
                          ▼
                 GitHub Writer  (reply, resolve, label, check)
                          ▼
                 Postgres (state, queue, audit, artefacts)
```

## 0. Interface, capacity, and visibility

- **GitHub is the conversation surface:** ask, reply, resolve. **The website is the control plane
  and deep session view.** The turn runner is internal and never user-facing.
- **Sessions are cheap rows; turns are the scarce resource.** No per-session process. An open
  session can wait for days with zero compute; a webhook reply wakes it.
- **Personal defaults, org tuning:** 1 turn/session, 2 concurrent turns/org, 2/user, 2–4/worker;
  org admin can raise within limits; repo override. No hard open-session cap; soft warning at 500.
- **Roles follow GitHub repo access.** v1: the owner configures; maintainers (repo write) trigger
  and reply; readers (repo read) view (ADR-0023, ADR-0028). Admins, members, viewers, and auditors
  are v1.2. A session is visible to repo readers, not just the trigger user. Mentions of humans are
  requests for human input, not bot instructions.
- **Branch review target (v1.1):** the branch delta vs the **repository default branch**. The graph is
  repository context; a branch review does not audit untouched files. Full details:
  [`../product/specs/session-capacity-and-visibility.md`](../product/specs/session-capacity-and-visibility.md).

## 1. Components

| Component | Responsibility | Non-responsibility |
| --------- | -------------- | ------------------ |
| **Event Gateway** | Verify GitHub webhook, normalize, deduplicate, persist, enqueue. No agent work. | No model calls, no long work. |
| **Session Service** | Own `PrSession`, `Thread`, `Message`, `Finding`, `Turn`; serialize turns; debounce; generation. | No provider calls. |
| **Turn Queue** | graphile-worker jobs: per-session order, debounce, retries, cancellation, fairness. | No session logic. |
| **Turn Runner** | Run the step pipeline; call jurors and the verifier; run the code chair and guards. | No GitHub credentials beyond the writer; no decision left to a model. |
| **Agent Router** | Select reviewers by explicit request, config, path/language, availability, budget; capability labels are v1.2. | Not a prompt. |
| **Context Service** | Diff (strict T0 in the MVP, T0+ from v1); base-SHA instructions, prior findings, linked issue and SARIF (v1); branch delta + repo graph (T2, v1.1); token budget; coverage manifest. | Not the source of truth for code. |
| **Provider Gateway** | Provider/model catalog, key encryption, origin binding, calls, retries, usage/cost. | No prompt policy. |
| **Resolution Guard** | Check evidence, user response, bot ownership, confidence before resolve. | No free-form model decision without checks. |
| **GitHub Writer** | Reply in thread, post PR comment, resolve/reopen, label, check. | No agent planning. |
| **Audit/Telemetry** | Every trigger, turn, tool, model, reply, resolve. | Not a best-effort activity feed. |

## 2. Session and turn model

A single PR session is the unit of serialization. A session can have many threads, but only one
turn runs at a time.

```
PrSession
  id, installation_id, repo_id, pr_number, state, generation, last_turn_at
Thread
  id, session_id, github_thread_id, file, line, state, created_by
Message
  id, thread_id, role, agent_id, github_comment_id, body, created_at
Finding
  id, session_id, thread_id, file, line, severity, status, fingerprint, evidence
Turn
  id, session_id, trigger, input, status, plan, output, cost, started_at, finished_at
TurnStep
  turn_id, step, input_hash, output, tokens, ms
Resolution
  id, thread_id, actor, evidence, confidence, at
```

- `state`: `created`, `active`, `waiting_for_user`, `resolved`, `archived`.
- A push advances `generation`; the session and thread state stay. Code re-anchors open findings:
  changed anchored code makes a finding `fix_candidate` and queues a recheck turn, a lost anchor
  makes it `outdated` (ADR-0024, technical-approach §5.4).
- Each turn carries `(session_id, generation)`; a step aborts as `superseded` when the generation
  has moved.
- A human reply while a turn runs is queued and coalesced within the 30 s debounce window; no
  parallel turns. Tables: [`data-model.md`](data-model.md).

## 3. GitHub event mapping

> Trigger authorization, bot-loop limits, comment versioning, re-anchoring after push, finding
> fingerprints, and the `auto` resolution guard are defined in
> [ADR-0024](../decisions/ADR-0024-conversation-safety-and-finding-identity.md).

| GitHub event | Session effect | Tier |
| ------------ | -------------- | ---- |
| `pull_request.opened` | In a repo with an enabled binding (never on a fork PR), create a neutral `Jury Forge` check run with the `PR review` action; create a session only on a trigger or policy. The `Branch review` action is v1.1. | MVP |
| `pull_request.ready_for_review` | Same as opened if policy. | MVP |
| `pull_request.labeled` | If the `jury:pr-review` label is added, enqueue one turn; coalesce multiple labels. `jury:cap:*` capability labels are v1.2. | MVP |
| `pull_request.unlabeled` | If a mode label was removed, cancel a queued turn (and before publish where possible). | MVP |
| `check_run.requested_action` | If the action is `review`, enqueue the turn (primary manual trigger). | MVP |
| `pull_request.synchronize` | Advance generation; re-anchor findings (code); queue recheck turns for `fix_candidate` findings (v1); no auto-post unless policy. Index refresh is v1.1. | MVP |
| `pull_request.closed` | Archive session. | MVP |
| `issue_comment.created` on PR | An `@jury-forge` mention from a repo-write user is a **reply turn in an existing session**; it never starts a review and gets no placeholder (ADR-0013, ADR-0024 §1). No slash commands; ignore bots. | MVP |
| `pull_request_review_comment.created` | If it replies to a Jury Forge thread, enqueue a thread turn; ignore bots. | MVP |
| `pull_request_review_comment.edited/deleted` | Store a new message version; no automatic turn unless it changes the question (ADR-0024 §3). | MVP |
| `pull_request_review.submitted` | Add context; respond only if mentioned/policy. | v1.1 |
| `push` to default branch | Enqueue the graph incremental update; no PR session turn. | v1.1 |
| `check_run` / `workflow_run` (other actions) | SARIF from completed check runs is evidence in v1 (ADR-0025 §3); no turn by default. | v1 |

> **Reviewer picker:** tested 2026-11-15; requesting `jury-forge[bot]` via the review-request API did
> not add the app as a reviewer. Arbitrary GitHub Apps cannot be requested there (Copilot is
> special). Use the Check Run action and `jury:pr-review` label; revisit if GitHub adds a first-class
> AI reviewer request.

Exact event names and GraphQL mutations must be verified in the GitHub spike. The App permissions
are expected to include `contents: read`, `pull_requests: write`, `issues: write` (PR conversation
comments), `checks: write`, and `metadata: read`; confirm before shipping.

## 4. The turn pipeline

The step names are those of technical-approach §3.4 and §5.2; [`job-pipeline.md`](job-pipeline.md)
gives each step's tier.

1. **Ingest** (`webhook.ingest`) — verify, normalize the event, check authorization, bot/self, and
   fork (ADR-0024 §1), dedupe, enqueue.
2. **`resolve`** — snapshot config and versions; generation check; for a reply, a `fast`-model
   intent classification (question, dispute, other).
3. **Route** — select reviewers (explicit > config > scope > default). Record why.
4. **`fetch` + `plan`** — diff, head-SHA content for T0+ (v1), base-SHA instructions, prior findings,
   linked issue and SARIF (v1); fitting, coverage manifest, budget estimate. Graph slices are v1.1.
5. **`review*`** — jurors in parallel, bounded by the provider token bucket. No model tool loop in
   PR review.
6. **`ground`** (code) — file, line, and evidence exist at the generation SHA; drop ungrounded
   claims.
7. **`verify`** (v1) — one non-voting verifier call; `wrong` is dropped, `unconfirmed` collapsed.
8. **`chair`** (code) — fingerprint merge, severity, agreement, ranking, noise budget, suppressions;
   dissent kept.
9. **`summarise`** (v1, fast model) and **`publish`** — one reply per thread/turn (or one PR
   summary) through the write queue; inline suggestions where valid.
10. **`evaluate`** and receipt (v1) — scorecard counters; signed, chained receipt.
11. **Update and wait** — finding/thread state; resolution guard; audit; `waiting_for_user` or
    `resolved`.

Every step is stored in `turn_steps` with `{input_hash, output, tokens, ms}`.

## 5. Runtime decision: a thin turn runner, no harness

[ADR-0010](../decisions/ADR-0010-agent-runtime-harness.md), as amended in Phase 1a
(technical-approach §3.4), rejected a harness for v1:

- Every hard decision is **code**: routing, fingerprints, grounding, the chair, budgets, and
  resolution guards. The remaining model calls are bounded and typed: juror review, verifier,
  appeal, recheck, reply intent, summary.
- **Durability comes from the queue and our tables.** A turn is a short job; "waiting for a human"
  is a session state, not a parked graph. LangGraph's `interrupt`/`resume` and checkpointer would
  duplicate state we already own.
- **Replay and receipts** need every model input and output stored canonically, which is simpler
  when each step is our own function with a persisted result.

**Decision:** a thin, explicit turn runner (the step pipeline in §4). Model access goes through the
provider gateway, built on the **Vercel AI SDK `ai` (Apache-2.0)** behind our own `complete()`
interface. Rejected for v1: LangGraph.js with a Postgres checkpointer (revisit if v1.1 branch review
needs multi-step tool exploration), the OpenAI Agents SDK, Mastra (open-core risk), Restate (BSL),
Inngest (SSPL), Cloudflare Agents (runtime), and Temporal (operational weight).

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

- **v1.1.** Postgres adjacency tables (technical-approach §3.2); no object store and no vector store
  in v1, and embeddings only if a benchmark justifies them.
- Index version per `(repo, commit)`; incremental update on every branch/T2 review run and default-branch push.
- In T2, Context Service uses summaries first, expands via tools, and records a manifest; T0/T0+ uses the diff only, with expansion confined to the diffed files.
- Context tiers: **T0** diff only (MVP PR review, strict), **T0+** enclosing-function expansion inside diffed files (v1 PR review, ADR-0025), **T1** bounded reads of arbitrary files (rejected for PR review, ADR-0019), **T2** graph (branch review, explicit, estimated, cancellable, v1.1 per ADR-0018).

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
- PR review runs no model tool loop in v1. Branch-review tools (v1.1) are read-only and bounded; no
  shell, no arbitrary network, no code execution. A sandboxed, opt-in test/build mode is later and
  needs its own ADR.
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
| Worker crash mid-turn | The job runs again after the queue's lock timeout; finished steps are skipped; the reply is idempotent. |
| Provider 429/5xx | Retry/backoff; fail the agent, not the session; note it. |
| Model removed | Agent becomes `configuration_error`; new turns fail visibly; existing snapshot kept. |
| Graph stale | Mark stale; review proceeds with warning or waits per policy. |
| GitHub resolve fails | Do not claim resolved; leave thread open; retry/audit. |
| User replies after resolve | Reopen thread; new turn. |
| PR merged while a turn runs | Finish or cancel; no new replies after archive. |
| Budget exhausted | Stop before next call; post status; wait for human. |
| Prompt injection detected | Do not follow; optionally flag and ask. |

## 11. Deployment

Docker Compose reference (technical-approach §2, §3.13):

- `caddy` (TLS, on-demand certificates)
- `migrate` (one-shot SQL migrations)
- `app` (API + UI + webhook ingest)
- `worker` (jobs, turns, and the cron jobs of technical-approach §3.3)
- `postgres` (state, queue, audit, artefacts)

None in v1: no Redis, no object store, no separate scheduler. The v1.1 index worker is a queue in
the same image. No Cloudflare. No external control plane. See [`operations.md`](operations.md) and
[`deployment.md`](deployment.md).

## 12. What changes from the previous target

- The one-shot review pipeline becomes an **event-driven session** with many turns.
- A **provider/model catalog** replaces free-text model configuration.
- A **repo graph** (v1.1) becomes a first-class service, not an optional reference fetch.
- **Manual trigger** is the primary path; automatic review is config-as-code.
- The **agent router** is a product surface, not only a prompt.
- **Resolution** stays human by default (`suggest`); a guarded bot resolve is opt-in (`auto`).
- The UI becomes a **session inbox + timeline**, not only a runs list.
