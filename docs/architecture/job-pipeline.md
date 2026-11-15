# Job pipeline

The review pipeline is the heart of the product. This document defines the job model, the state
machine, and the reliability rules. It replaces the PoC's per-run Durable Object with a durable
queue and stateless workers.

## Why a queue

The PoC used one Durable Object per run and alarms as the scheduler. That gave durability but no
queue semantics: no backpressure, no fair scheduling, no cancellation, no dead-letter queue, no
concurrency control, and a permanent named actor per run. A queue gives all of those, and a
Postgres-backed queue is enough for the first release.

## Job model

A **review request** is created by a webhook, a manual try, or a replay. It is persisted and
enqueued in the same transaction (transactional outbox). The queue delivers a **run job** to a
worker.

```
webhook ──▶ webhook_events ──▶ outbox ──▶ queue ──▶ worker
                                                     │
                                                     ▼
                                          lease + run + steps
                                                     │
                          ┌──────────────────────────┼──────────────────────────┐
                          ▼                          ▼                          ▼
                     provider calls             forge calls               publish
```

Job kinds:

| Kind | Trigger | Idempotency key |
| ---- | ------- | --------------- |
| `review.requested` | webhook / manual try | `request_id` |
| `index.refresh` | repository enable / push / schedule | `(repo_id, sha)` |
| `run.resume` | janitor recovery | `(run_id, step, attempt)` |
| `retention.sweep` | schedule | period |
| `budget.reconcile` | schedule | period |
| `notification.send` | event | `(event_id, channel)` |

## State machine

```
                 ┌─────────┐
   enqueue ─────▶│ queued  │
                 └────┬────┘
                      │ claim (lease)
                      ▼
                 ┌─────────┐   cancel   ┌───────────┐
                 │ running │───────────▶│ canceled  │
                 └────┬────┘            └───────────┘
                      │
     ┌────────────────┼────────────────┬──────────────┐
     ▼                ▼                ▼              ▼
 completed         failed           skipped        (lease expiry)
                                        │              │
                                        │              ▼
                                        │        back to queued
                                        │        (attempt + 1)
                                        ▼
                                   dead letter
```

Terminal statuses: `completed`, `failed`, `canceled`, `skipped`. A run is never silently `running`
forever.

## Steps

| Step | Input | Output | Idempotent by |
| ---- | ----- | ------ | ------------- |
| `resolve` | request | repository, PR, head/base SHA, installation, config snapshot | `request_id` |
| `fetch` | SHA | diff, changed files, metadata, instructions | `(run_id, sha)` |
| `index` | SHA | symbol/test/dependency index or a cache hit; **T2 branch review only** | `(repo_id, sha)` |
| `plan` | context + budget | token-budgeted context manifest | `(run_id, plan_hash)` |
| `review` | plan + reviewer versions | per-reviewer raw output + usage | `(run_id, reviewer_version_id)` |
| `ground` | raw findings + SHA | verified findings + evidence | `(run_id, finding_id)` |
| `jury` | verified findings | deduped findings, disagreements, verdict | `(run_id, jury_hash)` |
| `publish` | verdict + policy | one forge review | `run_id` |
| `record` | all | final rows, audit, notifications | `run_id` |

Each step writes a `run_steps` row with status, attempt, timings, metrics, and error. The worker
executes steps in order, checkpointing after each. A crash resumes at the first non-completed step.

## Leases and heartbeats

- Claiming a job sets `lease_owner` and `lease_expires_at` (e.g. 60 s) and increments `attempt`.
- The worker heartbeats every 15 s; the janitor reclaims a job whose lease expired.
- A step has its own timeout (e.g. provider call 120 s, index 5 min) and a maximum attempt count.
- The janitor is idempotent: reclaiming a job that is actually still running must be safe because
  steps are idempotent.

## Idempotency rules

1. **Webhook:** unique `(forge, delivery_id)`. A duplicate is recorded and ignored.
2. **Request:** `request_id` is unique. A duplicate enqueue returns the existing run.
3. **Step:** `(run_id, step, attempt)` is unique; the step checks its own prior output.
4. **Provider call:** `request_hash` (prompt + model + params + reviewer version) allows a cache
   hit or a safe retry. Raw responses are stored by hash.
5. **Publish:** `run_id` is the idempotency key. Before calling the forge, write a
   `review_publications` row with `status = publishing`; after success, store the external id and
   set `published`. A retry checks the row and the forge for an existing review before creating a
   new one.
6. **Notification:** `(event_id, channel)` unique.

## Supersession and generation

- Each run has a monotonically increasing `generation` per `(repository, pr_number)`.
- A new push increments the generation. Older queued runs are marked `skipped` (superseded). Older
  running runs are **cancelled** (cooperative cancel + timeout), not left to burn spend.
- Before publishing, the worker re-reads the PR head and the latest generation. If the run is stale,
  it does not publish; it marks itself `skipped` with reason `superseded`.
- Review minimization only minimizes reviews with a lower generation than the one being published.
- A stale run can never minimize a newer review.

This closes the PoC's F-007.

## Retries, backoff, and dead letters

| Failure class | Behavior |
| ------------- | -------- |
| Transient network / 5xx / 429 | Retry with exponential backoff + jitter, honour `Retry-After`, up to N attempts. |
| Provider 4xx (bad key, bad model) | Fail the reviewer, not the whole run; mark a config error. |
| Forge 4xx (permission, validation) | Fail the step; do not retry blindly; surface a fixable error. |
| Database serialization / deadlock | Retry the transaction. |
| Step timeout | Retry if attempts remain; otherwise fail the step. |
| Lease expiry | Janitor requeues; idempotent step resumes. |
| Exhausted attempts | Move the job to `dead_letters`; alert; expose replay. |

The operator can replay a dead letter, retry a run, or cancel a queued/running run. Every action is
audited.

## Budgets and cancellation

- Before the run, the planner estimates tokens and cost from the model registry and the context
  size.
- A budget check runs before each provider call. With `action = block`, the run stops before
  exceeding the budget; with `warn`, it proceeds and alerts.
- Cancellation is cooperative: the worker checks a cancel flag between steps and aborts in-flight
  provider calls where the HTTP client supports it.
- A cancelled run records what it spent and why it stopped.

## Concurrency and fairness

- Per-worker concurrency is bounded (e.g. 4 runs).
- Per-provider concurrency and rate limits are enforced by the gateway (token bucket).
- Per-tenant fairness: round-robin or weighted queues so one noisy repo cannot starve others.
- Interactive actions (manual try, replay) get priority over bulk/index jobs.
- Index jobs yield to review jobs.

## Observability hooks

Every job and step emits:

- a trace span with `org_id`, `run_id`, `step`, `attempt`, `reviewer_version_id`;
- metrics: queue depth, wait time, run duration, step duration, provider latency, tokens, cost,
  retries, dead letters, lease expiries;
- structured logs with request id, run id, and no secrets;
- audit events for publish, cancel, replay, config changes, and data egress decisions.

## Failure matrix (must be tested)

| Scenario | Expected behavior |
| -------- | ----------------- |
| Duplicate webhook delivery | One run; second is ignored. |
| Worker crashes after provider call, before recording | Step retries; provider call is cached by `request_hash` or safely repeated. |
| Publish succeeds, then DB write fails | Retry reads `review_publications` and finds the external review; no duplicate. |
| Publish fails with 422 | Step fails with a fixable error; summary-only fallback per policy. |
| Lease expires while the worker is alive | Janitor requeues; the old worker's next heartbeat fails; steps are idempotent. |
| New push while a run is in flight | Old run cancelled; only the new generation publishes. |
| Old run finishes after new run | Publish check sees a lower generation; marks skipped; does not minimize the newer review. |
| Provider 429 storm | Gateway backs off; reviewers fail gracefully; run completes with notes. |
| Budget exhausted | Run stops before the next call; summary says why. |
| Cancelled run | Stops between steps; status `canceled`; no publish. |
| Database unavailable | Jobs stay queued; web/API returns a clear degraded state; no data loss. |
| Object storage unavailable | Runs fail with a clear error; no partial publish. |
| Janitor crashes | Another instance takes over; leases expire. |

## What the PoC did instead

| PoC | Target |
| --- | ------ |
| Durable Object per run | Job queue + stateless workers |
| Alarm segment per step | Step functions with lease/heartbeat |
| `finished` flag before D1 write | Durable record first; idempotent steps |
| No cancellation | Cooperative cancel + generation check |
| No DLQ | Dead letters + replay |
| No concurrency limits | Per-worker and per-provider limits |
| Webhook kicks directly | Transactional outbox + queue |
| No heartbeat | Lease + heartbeat + janitor |

## Migration note

The first implementation can use PostgreSQL as the queue (`SELECT … FOR UPDATE SKIP LOCKED`) to
avoid an extra dependency. The job interface must not leak Postgres specifics, so Redis/BullMQ or
another queue can replace it later. The contract is: enqueue, claim with lease, heartbeat, complete,
fail, retry, dead-letter, cancel.

## Session turns (2026-11-15)

Agentic review adds session-scoped jobs on top of the queue:

| Job | Trigger | Idempotency |
| --- | ------- | ----------- |
| `session.turn` | mode/capability label, Check Run action, UI, user reply, push, policy | `(session_id, generation, event_id)` |
| `index.incremental` | branch/T2 review run, default-branch push | `(repo_id, sha)` |
| `index.full` | manual rebuild / parser upgrade | `(repo_id, sha, parser_version)` |
| `model.refresh` | schedule / manual | `(provider_id, day)` |
| `session.archive` | merge/close / retention | `session_id` |

- Turns are serialized per session; the queue must not deliver two active turns for one session.
- A human reply during a running turn is queued and coalesced; it does not start a parallel turn.
- A push advances the generation; stale turns are canceled or skipped before the next agent call.
- The same lease/heartbeat/DLQ/cancellation rules apply; a turn is a job, not a process that lives
  for days. The session row is the durable state.

See [`agentic-review.md`](agentic-review.md).
