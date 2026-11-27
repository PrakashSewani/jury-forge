# Job pipeline

How work moves from a GitHub event to a published review: the jobs, the turn lifecycle, and the
reliability rules. It follows the accepted queue decision (ADR-0006, technical-approach §3.3) and
replaces the PoC's per-run Durable Object with a Postgres-backed queue and stateless workers.

## Why a queue

The PoC used one Durable Object per run and alarms as the scheduler. That gave durability but no
queue semantics: no backpressure, no fair scheduling, no cancellation, no dead-letter handling, no
concurrency control, and a permanent named actor per run. A Postgres-backed queue gives those
without another service.

## The queue: graphile-worker behind a `JobQueue` port

- **graphile-worker 0.18.0 (MIT)** runs inside `worker`, against the same Postgres. It owns its own
  schema; Jury Forge defines no job, lease, or dead-letter tables.
- **Per-session serialization:** `queue_name = session:<id>` runs a session's jobs strictly in order,
  so there is at most one running turn per PR session.
- **Debounce:** `job_key = session:<id>:pending` with `run_at = now + 30 s` and `job_key_mode:
  replace`. Several replies inside the window collapse into one turn.
- **Transactional enqueue:** `add_job` runs in the same transaction as the state change that causes
  it (for example the `webhook_deliveries` insert). That is the outbox; there is no separate outbox
  table.
- **Low latency:** `LISTEN/NOTIFY`; the queue-pickup budget is p95 < 2 s (technical-approach §6).
- **Port:** the code sees a five-function `JobQueue` interface (`enqueue`, `enqueueTx`, `cancel`,
  `schedule`, `onJob`). graphile-worker is pre-1.0, so a pg-boss adapter is written in spike S-A to
  prove the swap works. No other backend (Redis, a managed queue) is planned.

## Jobs

| Job | Trigger | Queue / key | Tier |
| --- | ------- | ----------- | ---- |
| `webhook.ingest` | Each GitHub delivery | `job_key = delivery_id` (dedup) | MVP |
| `session.turn` | Check Run action, `jury:pr-review` label, reply, push (recheck), policy | `queue_name = session:<id>`; `job_key = session:<id>:pending`, replace mode | MVP |
| `publish.github` | A turn's `publish` step | `queue_name = install:<id>:writes` (the GitHub write queue, ADR-0024 §7) | MVP |
| `cron: reconciler` | Every 10 min | graphile-worker cron | v1 (the webhook reconciler, capabilities.md) |
| `cron: retention` | Daily | graphile-worker cron | MVP |
| `cron: stalled sessions` | Hourly | graphile-worker cron | v1 (the stalled-session policy) |
| `cron: reaction poll` | Every 5 min, open sessions only | graphile-worker cron | v1 (reactions as feedback) |
| `index.incremental`, `index.full` | Branch review, default-branch push, parser upgrade | The index worker queue | v1.1 |

Cron runs inside `worker`; there is no separate scheduler process. graphile-worker is designed to
fire each cron tick once across workers; an M1.1 integration test must prove that with two worker
replicas. The daily provider-catalog refresh in the `provider-model-discovery` spec is not yet on
this list (audit question Q-D).

## Turn lifecycle

A **turn** (`session_turns`) is the durable unit of work. A job is how a turn gets executed; the
turn row and its `turn_steps` are what survive.

```
          enqueue (txn)
   event ───────────────▶ queued ──(job picked up)──▶ running ──▶ completed
                                                         │
                                                         ├──▶ failed          (attempts exhausted)
                                                         ├──▶ superseded      (generation moved)
                                                         └──▶ budget_stopped  (hard budget, fail closed)
```

- A job that crashes mid-turn is picked up again after graphile-worker's lock timeout, with
  `attempt + 1`. Finished steps are read back from `turn_steps` and are not redone.
- A job that exhausts its attempts stays in graphile-worker's tables as permanently failed: it is
  inspectable, and an admin can retry it with audit (ADR-0006). The turn becomes `failed`, and the
  Check Run says why.
- Terminal states: `completed`, `failed`, `superseded`, `budget_stopped`. No turn is left `running`
  without a job that holds it.

## Steps

The turn runner is a thin, explicit step pipeline (ADR-0010 as amended, technical-approach §3.4,
§5.2). Each step is a function plus a persisted result:

| Step | Does | Tier |
| ---- | ---- | ---- |
| `resolve` | Snapshot config and versions; generation check | MVP |
| `fetch` | Diff, files at the head SHA, base-SHA instructions and `.jury-forge.yml`; linked issue and SARIF from v1 | MVP |
| `plan` | Strict T0 in the MVP, T0+ from v1; fitting; coverage manifest; budget estimate; fail closed on budget | MVP |
| `review*` | Jurors in parallel, bounded by the provider token bucket (one juror in the MVP, three in v1) | MVP |
| `ground` | Code: file, line, and quoted evidence exist at the SHA; suggestions apply | MVP |
| `verify` | One non-voting verifier call (`confirmed`/`unconfirmed`/`wrong`) | v1 |
| `chair` | Code: fingerprint merge, severity, agreement, ranking, noise budget, suppressions | MVP (single juror), v1 (jury) |
| `summarise` | Fast model: the 3-line summary and dissent text | v1 |
| `publish` | Enqueue `publish.github` | MVP |
| `evaluate` | Scorecard counters | v1 |
| receipt | Sign and chain the receipt | v1 |

Each step stores `{input_hash, output, tokens, ms}` in `turn_steps`, unique by `(turn_id, step)`.
Replay of a stored turn from its recorded inputs is v1.1.

## Idempotency rules

1. **Webhook:** `webhook_deliveries.delivery_id` is unique, and `webhook.ingest` is keyed by it. A
   duplicate delivery is recorded and ignored.
2. **Turn:** the debounce `job_key` collapses repeated triggers; `(session_id, generation)` rejects
   stale work.
3. **Step:** `(turn_id, step)` is unique; a retried step returns its stored result.
4. **Model call:** requests and responses are stored (redacted) as artefacts referenced from the
   step; a retry after a crash uses the stored response if the step recorded one.
5. **Publish:** before posting, `publish.github` checks the stored `external_id` (the GitHub comment
   or review ID) and, if it is missing, looks for an existing comment from the App before creating
   one. Writes are serialized per installation, at most one mutation per second, one review per
   turn (technical-approach §3.7).

## Supersession and generation

- Each session has a monotonically increasing `generation`. A push (`synchronize`) advances it and
  cancels stale queued jobs.
- Every step checks the generation; when it has moved, the step aborts and the turn ends as
  `superseded` (ADR-0024). A stale turn never publishes and never minimizes a newer review.
- After a push, open findings are re-anchored by code; anchored code that changed makes a finding
  `fix_candidate` and queues a recheck turn; a lost anchor makes it `outdated` (ADR-0024,
  technical-approach §5.4).

This closes the PoC's F-007.

## Retries and failure classes

| Failure class | Behaviour |
| ------------- | --------- |
| Transient network / 5xx / 429 | Retry with backoff and jitter; honour `Retry-After`; per-provider token bucket. |
| Provider 4xx (bad key, bad model) | Fail that juror, not the whole turn; mark the provider or model `configuration_error`. |
| Output hits the token cap (`finish=length`) | Fail that juror with the reason; no repair (ADR-0029). |
| Forge 4xx (permission, validation) | Fail the step with a fixable error; do not retry blindly. |
| Database serialization / deadlock | Retry the transaction. |
| Worker crash | The job runs again after the lock timeout; finished steps are skipped. |
| Attempts exhausted | The job stays permanently failed; the turn is `failed`; an admin can retry it, with audit. |

## Budgets and cancellation

- `plan` estimates tokens and cost from the model catalog and the fitted context, and fails closed
  when the estimate exceeds a hard budget (ADR-0024 §7).
- `domain` checks the budget before every model call; a `block` budget stops the turn as
  `budget_stopped` and the Check Run says so.
- Cancellation is cooperative: a cancelled or superseded job stops at the next step boundary and
  aborts in-flight provider calls where the HTTP client supports it.
- A stopped turn records what it spent and why it stopped.

## Concurrency and fairness

- Per-session: one running turn (`queue_name`).
- Per-provider: a token bucket in the gateway.
- Per-installation: GitHub writes are serialized (`install:<id>:writes`).
- Defaults from `session-capacity-and-visibility`: 2 concurrent turns per org, 2 per user, 2–4 per
  worker; human replies come before manual reviews, which come before automatic reviews.

## Observability hooks

Every job and step emits:

- a trace span (when OpenTelemetry is on) with `org_id`, `session_id`, `turn_id`, `step`, `attempt`,
  `reviewer_version_id`;
- metrics on `/metrics`: queue depth and age, turn latency, provider latency and errors, tokens and
  cost, budget stops, loop stops, verifier drop rate, coverage ratio, cache-hit ratio
  (technical-approach §3.12);
- pino JSON logs with request, turn, and job IDs and no secrets;
- audit events for publish, cancel, retry, config changes, and data-egress decisions.

## Failure matrix (must be tested)

| Scenario | Expected behaviour |
| -------- | ------------------ |
| Duplicate webhook delivery | One job; the second delivery is recorded and ignored. |
| Worker killed after a model call, before the step is recorded | The step re-runs; the stored response is reused if it was recorded, otherwise the call repeats safely. |
| Publish succeeds, then the step write fails | The retry finds the `external_id` or the existing App comment; no duplicate. |
| Publish fails with 422 | Fixable error; summary-only fallback per policy. |
| Two replies inside the debounce window | One turn. |
| New push while a turn runs | The old turn ends `superseded`; only the new generation publishes. |
| Old turn finishes after a new one | The generation check stops it before publish; it does not minimize the newer review. |
| Provider 429 storm | The gateway backs off; jurors fail gracefully; the turn completes with notes. |
| Budget exhausted | The turn stops before the next call; the summary says why. |
| Database unavailable | Webhooks fail fast (GitHub retries); `/readyz` reports it; no data loss. |
| Cron with two workers | Each tick fires once (M1.1 test). |

## What the PoC did instead

| PoC | Target |
| --- | ------ |
| Durable Object per run | graphile-worker jobs + stateless workers |
| Alarm segment per step | Turn steps with persisted results |
| `finished` flag before the D1 write | Durable step record first; idempotent steps |
| No cancellation | Cooperative cancel + generation check |
| No DLQ | Permanently failed jobs, inspectable and retryable |
| No concurrency limits | Per-session, per-provider, per-installation limits |
| Webhook kicks directly | Transactional `add_job` |
| No heartbeat | Queue locks + idempotent retry |

See [`agentic-review.md`](agentic-review.md) for the session model and
[`data-model.md`](data-model.md) for the tables.
