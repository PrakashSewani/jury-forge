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
- **Per-session serialization:** `queue_name = session:<id>` runs a session's jobs one at a time, so
  there is at most one running turn per PR session. The order inside the queue is `priority, run_at`,
  not insertion: jobs added in one transaction tie, and a retried job goes behind jobs that are
  already due ([spike S-A](../analysis/spikes/2026-11-28-queue-serialization-debounce.md) E1, E6b).
  Queue order never decides which turn publishes; the generation check does.
- **Debounce:** `job_key = session:<id>:pending` with `run_at = now + 30 s` and `job_key_mode:
  replace`. Several replies inside the window collapse into one turn (S-A E2: 20 concurrent triggers,
  one run). The debounce is trailing (each trigger moves `run_at`), and the surviving payload is
  whichever write committed last. Replace mode only replaces a job that has not started: when the
  session's job is running, graphile-worker clears that job's key, **removes its remaining retries**,
  and adds a new job (S-A E3). So a job payload carries IDs only, and `resolve` reads the pending
  inputs from the database (S-A R1). The port requires `org_id` in every payload (WP 1-10). **Bound
  (S-A R8):** a stream of replies less than 30 s apart keeps postponing the turn; the MVP accepts it,
  and a cap would need `preserve_run_at` logic in the adapter.
- **Transactional enqueue:** `add_job` runs in the same transaction as the state change that causes
  it (for example the `webhook_deliveries` insert). That is the outbox; there is no separate outbox
  table.
- **Low latency:** `LISTEN/NOTIFY`; the queue-pickup budget is p95 < 2 s (technical-approach §6).
- **Port:** the code sees a five-function `JobQueue` interface (`enqueue`, `enqueueTx`, `cancel`,
  `schedule`, `onJob`). graphile-worker is pre-1.0, so spike S-A wrote a pg-boss adapter behind the
  same port; it passed the same serialization, debounce, and transaction tests. Its differences
  (queues declared up front, one key, polling to tune, a failed job that blocks its session) are in
  the spike note. No other backend (Redis, a managed queue) is planned. The interface lives in
  `contracts` (`job-queue.ts`), the leaf package that `pipeline` and `store` both import, and the
  graphile-worker adapter is `GraphileJobQueue` in `store` (WP 1-10).
- **Adapter settings (WP 1-10):**
  - concurrency 2 per worker (`session-capacity-and-visibility`: 2–4);
  - an idle poll every 1000 ms besides LISTEN/NOTIFY, because nothing notifies when a session's queue
    frees (S-A E1); an idle worker then finds a ready job within about 1 s, inside the p95 < 2 s pickup budget
    (technical-approach §6 checks it with an integration timer, not yet written);
  - `maxAttempts` explicit on every job (S-A R7);
  - job task names may use dots (`session.turn`), but cron task names follow graphile-worker's
    crontab grammar, `[_a-zA-Z][_a-zA-Z0-9:/_-]*`, so they use a colon (`cron:retention`);
  - a cron handler receives `{ scheduledAt, backfilled }`, and missed ticks are not backfilled;
  - `migrate` installs graphile-worker's schema too; a worker's own schema check at start then has
    nothing to do.
- **Housekeeping:** each session leaves a row in graphile-worker's queue table, every fetch locks the
  available rows, and nothing removes them on its own. Pickup p95 was 7 ms with none and 284 ms with
  100,000 (S-A E8). graphile-worker's `cleanup` (`GC_JOB_QUEUES`, `GC_TASK_IDENTIFIERS`) removes them
  and should run from the daily retention cron (S-A R6). `GraphileJobQueue.cleanup()` does it (WP
  1-10); the retention cron calls it (WP 1-28a).

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
| `cron: stuck-turn sweep` | Every 5 min | graphile-worker cron; fails turns `running` > 20 min (RP-03, configurable) | MVP |
| `cron: catalog refresh` | Daily, staggered per provider | graphile-worker cron (plus the on-demand refresh) | MVP |
| `index.incremental`, `index.full` | Branch review, default-branch push, parser upgrade | The index worker queue | v1.1 |

Cron runs inside `worker`; there is no separate scheduler process. graphile-worker is designed to
fire each cron tick once across workers. The WP 1-10 integration test proves it with two worker
processes: two consecutive ticks, one run each (audit Q-E). Before it, spike S-A saw 3 of 3 ticks fire
once (E7). The list is technical-approach §3.3 (amended 2026-11-28, audit Q-D). Abandoned setup is
not a cron job: `/metrics` and `doctor` report it.

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
  `attempt + 1`. Finished steps are read back from `turn_steps` and are not redone. That timeout is
  **4 hours**, hard-coded, and the session's queue stays locked with the job (S-A E6). So a dead
  worker's lock is released explicitly ([ADR-0037](../decisions/ADR-0037-dead-worker-lock-release.md)):
  each worker process records a heartbeat every 30 s in `worker_heartbeats`, and the 5-minute
  stuck-turn sweep fences any pool silent for 2 minutes, then calls `forceUnlockWorkers` (635 ms in
  the spike). A fenced worker that was only slow stops its jobs and exits. A crashed worker's sessions
  resume within about 7 minutes.
  - **As built (WP 1-10), in `releaseDeadWorkers`:** the sweep marks the pool, waits one heartbeat
    interval plus 5 s (35 s), and only then unlocks what the pool still holds. A slow but live worker
    sees the mark at its next heartbeat and stops cleanly before its job can run elsewhere, so no
    session runs two turns at once (a test shows it). This keeps ADR-0037's order and its "about
    7 minutes".
  - graphile-worker completes a job by deleting it by id, whoever holds it now
    (`dist/sql/completeJobs.js`), while failing a job is scoped to the pool. So a handler that
    finishes after its worker was fenced throws `FencedError` instead of completing the job, and the
    job stays with its new holder.
- On a graceful stop (SIGTERM, `docker stop`), graphile-worker fires the running jobs' abort signal
  after 5 s. With its default settings, a job that then fails has its failure lost, and stays locked
  like a crash;
  `completeJobBatchDelay: 0` and `failJobBatchDelay: 0` fixed it in the spike (S-A E6b, R3); the
  adapter sets them, and a WP 1-10 test confirms that another worker retries the aborted job. Steps
  should honour the job's abort signal within those 5 s (S-A R4; WP 1-11). The signal also fires when
  the worker is fenced.
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
| `chair` | Code: fingerprint merge, severity, agreement, ranking, comment ceiling (ADR-0033), suppressions | MVP (single juror), v1 (jury) |
| `summarise` | Fast model: the 3-line summary and dissent text | v1 |
| `publish` | Enqueue `publish.github` | MVP |
| `evaluate` | Scorecard counters | v1 |
| receipt | Sign and chain the receipt | v1 |

Each step stores `{input_hash, output, tokens, ms}` in `turn_steps`, unique by `(turn_id, step)`.
Replay of a stored turn from its recorded inputs is v1.1.

**The runner as built (WP 1-11):** `runTurn` in `pipeline`, over the `TurnStore` port in
`contracts`, implemented by `createTurnStore` in `store`.

1. **Start.** A turn that is missing or already finished does nothing: a duplicate or late job. An
   open turn is marked `running`; its first start time is kept across retries.
2. **Close older turns (spike S-A R2).** Older turns of the session that never finished are closed:
   - a `queued` one was coalesced into this turn: `superseded`, reason `coalesced`;
   - a `running` one with a lower generation: `superseded`, reason `generation_moved`;
   - any other `running` one lost its job: `failed`, reason `orphaned`.

   Newer turns are left alone.
3. **Before each step:**
   - the abort signal is checked;
   - the session generation is re-read, and a moved one ends the turn as `superseded`
     (`generation_moved`);
   - the step's input is built from the turn and the earlier outputs, and hashed: SHA-256 of its
     canonical JSON (`domain/canonical-json.ts`, RFC 8785 style).
4. **A finished step is read back, never run again.** If its stored input hash differs, the turn
   fails (`step_input_changed:<step>`), because inputs come from the turn snapshot and earlier
   outputs, so a difference is a bug.
5. **A new result is recorded with first write wins.** If a stale copy recorded the step first, its
   result is the one used.
6. **On a failure, `decideFailure` in `domain` decides:**

   | Failure | Outcome |
   | ------- | ------- |
   | `transient`, or any error that is not a `StepFailure` | The job is retried while attempts remain. On the last attempt the turn is `failed` and the job stays permanently failed. |
   | `terminal` | The turn is `failed` now, with the reason; no retry. |
   | `budget` | The turn is `budget_stopped`. |
   | An abort | The error is rethrown and nothing is written, because the job runs again elsewhere. |

7. **End.** A completed turn records the sum of its steps' tokens.

The WP 1-11 fault-injection test kills a worker inside a step. Another worker resumes the turn: the
finished steps are not run again, and no effect is duplicated.

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
| Verifier fails (after retries, or `finish=length`) | Fail the turn as `verifier_unavailable` and publish nothing; the stored juror steps make a retry re-run only `verify` (`jury-output` §5). |
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
| Worker killed mid-turn | Other sessions keep running; within one sweep after the 2-minute heartbeat threshold the lock is released and the turn retried, in the session's order (ADR-0037). |
| Worker alive but silent for 2 min | It is fenced: it stops taking jobs, aborts its running ones, and exits; no turn of a session runs twice at once (ADR-0037). |
| Graceful stop mid-turn | The job is aborted within 5 s, released, and retried by another worker (S-A E6b). |
| New trigger while a turn runs, then that turn fails | The new turn handles the pending inputs; the failed turn is closed, not left `running` (S-A E3, R2). |

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
