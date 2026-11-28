# Spike: queue serialization, debounce, and the pg-boss swap (S-A, WP 1-06)

- Date: 2026-11-28
- Status: done (time-boxed, throwaway code, not part of the product). Its questions were closed by
  the owner the same day: Q-051 by a named licence exception (`technical-approach.md` §13), Q-052 by
  [ADR-0037](../../decisions/ADR-0037-dead-worker-lock-release.md).
- Libraries: `graphile-worker` 0.18.0 (the pinned version in `technical-approach.md` §13),
  `pg-boss` 12.38.2 (the pinned fallback; 12.40.0 is the latest, published 2026-11-25), `pg` 8.23.1
- Database: `postgres:17.12-alpine` (the testkit image), PostgreSQL 17.12, in Docker Engine 29.9.3,
  bound to loopback
- Runtime: Node v24.19.0, Windows 11
- Code: throwaway scripts in the session scratch folder, outside the repository. One `JobQueue` port
  with a graphile-worker adapter and a pg-boss adapter; every experiment runs the same handlers
  through the port, in separate worker processes. Synthetic payloads only; no keys were used.

## Questions

1. Does graphile-worker's `queue_name` keep **one job at a time per session** when several worker
   processes compete, and in what order?
2. Does `job_key` with `job_key_mode: replace` **debounce** concurrent triggers into one turn, and
   what happens when a trigger arrives while the session's job is already running?
3. Is enqueue really **transactional** (the outbox rule in `job-pipeline.md`)?
4. What happens on **cancel**, **permanent failure**, a **worker crash**, and a **graceful stop**?
5. Does **cron** fire each tick once with two workers (a preview of audit Q-E; the WP 1-10 test is
   still required)?
6. Can a **pg-boss adapter** implement the same five-function port, and where does it behave
   differently?

## The port used

```text
enqueue(task, payload, opts)            -> { id }
enqueueTx(client, task, payload, opts)  same, inside the caller's open transaction
cancel(task, serialKey)                 drop the session's not-yet-started job -> boolean
schedule(task, cron)                    register a cron task before start
onJob(task, handler(payload, ctx))      ctx = { attempt, jobId, signal }
opts = { serialKey, coalesce, runAt, maxAttempts }
```

| Port option | graphile-worker | pg-boss |
| ----------- | --------------- | ------- |
| `serialKey` (one at a time) | `queue_name = session:<id>` | queue policy `key_strict_fifo`, `singletonKey = session:<id>` |
| `coalesce` (debounce) | `job_key = session:<id>:pending`, mode `replace` | `upsert()` by `singletonKey`, `match: newest` |
| `runAt` | `run_at` | `startAfter` |
| `enqueueTx` | `graphile_worker.add_job(...)` on the caller's client | `send()`/`upsert()` with `db: { executeSql }` on the caller's client |
| `cancel` | `graphile_worker.remove_job(job_key)` | `findJobs(key, queued)` then `cancel(ids)` |
| `schedule` | `crontab` passed to `run()` | `schedule(name, cron)` |
| Queue setup | none | `createQueue()` per task before use (the policy is per queue) |

pg-boss has one key where graphile-worker has two (`queue_name` and `job_key`). That is enough for
the MVP jobs: `session.turn` serializes and debounces on the same session key, `publish.github`
serializes on the installation key, and `webhook.ingest` is deduplicated by the unique
`webhook_deliveries.delivery_id` row in the same transaction, not by the queue.

## Results

Two worker processes with 8 slots each unless stated. "Overlap" means two jobs of the same session
running at the same time, measured from the database clock. "FIFO inversion" means a session's job
started before one that was enqueued earlier.

### E1. Serialization: 50 sessions × 10 jobs (500 jobs), handler 5–24 ms

| Run | Overlaps | FIFO inversions | Duplicate runs | Peak concurrent | Drain |
| --- | -------: | --------------: | -------------: | --------------: | ----: |
| graphile-worker, one statement per job | **0** | 0 | 0 | 16 | 2.4 s |
| graphile-worker, a session's 10 jobs in one transaction | **0** | **6** | 0 | 16 | 10.6 s |
| pg-boss (poll 2 s, notify backstop 5 s), one statement per job | **0** | 0 | 0 | 14 | 30.7 s |
| pg-boss, one transaction per session | **0** | **217** | 0 | 16 | 170.6 s |
| pg-boss tuned (both intervals 0.5 s), one statement per job | **0** | 0 | 0 | 16 | 3.8 s |
| pg-boss tuned, one transaction per session | **0** | **229** | 0 | 16 | 16.0 s |

- **Serialization held everywhere:** no overlap in 3,000 job runs across the six runs, plus 1,000
  runs of a graphile-worker rerun with the batch delays of R3 set to 0: 0 overlaps, 0 and 2
  inversions, drains of 2.1 s and 10.6 s.
- **Order is not insertion order.** graphile-worker fetches by `priority, run_at`
  (`dist/sql/getJobs.js:179`); jobs added in one transaction share `now()`, so ties are arbitrary.
  pg-boss picks a key's head by `created_on, id` (`dist/plans.js:2441`), and `id` is a random UUID,
  so same-transaction jobs come out in effectively random order.
- **The next job of a session waits for a poll.** Neither library wakes a worker when a session's
  queue frees. With all jobs ready (the one-transaction runs), the gap from one job's end to the
  next job's start was: graphile-worker p50 25 ms, p95 740 ms, max 7.7 s; pg-boss p50 4,981 ms
  (its 5 s backstop), and 472 ms tuned. A pg-boss slot waits out its polling interval after every
  fetch (`dist/worker.js:96–99`), and its burst mode is off at `batchSize` 1
  (`dist/types.d.ts:1049`).

### E2. Debounce: 10 sessions × 20 concurrent coalescing enqueues, 3 s window

| | graphile-worker | pg-boss |
| - | -------------- | ------- |
| Runs per session | **1** (all 10) | **1** (all 10) |
| Enqueue errors | 0 | 0 |
| Surviving payload | arbitrary (seq 2–18) | the last call (seq 19) in this run |
| Trailing: triggers at 0, 1.5, 3.0 s; run started after the last | 3,024 ms | 3,813 ms |

The debounce is **trailing**: each trigger moves `run_at` to now + window, so a steady stream of
replies faster than the window would keep postponing the turn. The surviving payload is whichever
write committed last, so a debounced job's payload cannot carry the replies themselves.

### E3. A trigger while the session's job is running

| Case | graphile-worker | pg-boss |
| ---- | --------------- | ------- |
| Job A (3 s) running; B coalesced in | B started 1,013 ms after A ended; no overlap | B started 11 ms after A ended |
| Same, but A then fails (3 attempts allowed) | **A is not retried**; B runs | A is retried (attempt 2), then B runs |

graphile-worker's `add_jobs` does not replace a running job. It clears that job's key and sets its
`attempts` to `max_attempts`, which removes its remaining retries, and inserts a new job
(`sql/000020.sql:120–133`, replace only `where jobs.locked_at is null` at line 189).

### E4. Transactional enqueue

| | graphile-worker | pg-boss |
| - | -------------- | ------- |
| Ran while the transaction was open (2.5 s) | 0 | 0 |
| Rolled back: runs / `webhook_deliveries` rows | 0 / 0 | 0 / 0 |
| Committed: pickup after commit | 5 ms | 9 ms |

### E5. Cancel and permanent failure

| Case | graphile-worker | pg-boss |
| ---- | --------------- | ------- |
| Cancel a pending coalesced job | returned true; never ran | returned true; never ran |
| Cancel a running job that then fails | returned true; not retried | the adapter cancels queued jobs only: returned false; retried |
| A job fails on every attempt (2 allowed); the session's next job | ran between the two attempts | **blocked** for the whole 20 s; ran once the failed job was deleted |

In pg-boss's `key_strict_fifo`, a job in `active`, `retry`, or **`failed`** state holds its key
(`dist/types.d.ts:870–877`; the unique index `job_i8` at `dist/plans.js:1281`). One permanently
failed turn would block its PR session until the job is removed.

### E6. Worker killed (SIGKILL) during a job

One worker (2 slots) runs session k1's first job, which hangs; k1's second job waits behind it.
The worker is killed and a second worker starts.

| | graphile-worker | pg-boss (`heartbeatSeconds: 10`) |
| - | -------------- | -------------------------------- |
| Another session's job after the kill | ran | ran |
| The killed job retried within 120 s | **no**: the job and the k1 queue stayed locked | yes, after **60.4 s** |
| After `forceUnlockWorkers([locked_by])` | retried, then k1's second job, within 635 ms | — |
| k1 order after recovery | seq 1 (attempt 2), then seq 2 | seq 1 (attempt 2), then seq 2 |

graphile-worker clears stale locks only after **4 hours**, hard-coded
(`dist/sql/resetLockedAt.js:9` and `:13`), and the named queue stays locked with the job. pg-boss's
supervision interval defaults to 60 s (`dist/attorney.js:663`), which matches the observed 60.4 s
better than the 10 s heartbeat does.

### E6b. Graceful stop (what SIGTERM and `docker stop` trigger) during a long job

The running job honours its abort signal. Graceful shutdown aborts running jobs after
`gracefulShutdownAbortTimeout`, 5 s by default (`dist/config.js:53`).

| Run | Worker exited | The aborted job |
| --- | ------------: | --------------- |
| graphile-worker, defaults | 5,018 ms | **still locked, `last_error` empty, not retried in 120 s** |
| graphile-worker, defaults, process waits 3 s after `stop()` | 8,027 ms | same: still locked |
| graphile-worker, `completeJobBatchDelay: 0`, `failJobBatchDelay: 0` (run twice) | 5,026 / 5,037 ms | released; retried by the other worker; both jobs done 8.1 s after stop |
| pg-boss, `stop({ graceful: true, timeout: 5000 })` | 5,055 ms | released; retried by the other worker; both jobs done 15.0 s after stop |

The cause is in graphile-worker: the worker calls `failJob(...)` without awaiting it
(`dist/worker.js:262`). With the default batch delay of -1 the batchers have `release: null`
(`dist/main.js:897–899`, `:918–921`), so shutdown has nothing to wait for (`dist/main.js:433–437`),
and the pool ends before the write lands. With a batch delay of 0 the batcher's `release()` is
awaited, and the write lands. In both batching runs, the session's second job ran **before** the
retry of the first: a failed job is re-queued at `now + exp(min(attempts, 10))` seconds
(`dist/sql/failJobs.js:20`), behind jobs that are already due.

### E7. Cron with two workers (preview of audit Q-E)

`* * * * *` registered in both workers for 200 s.

| | Ticks seen | Runs per tick | Workers |
| - | ---------: | ------------: | ------- |
| graphile-worker | 3 | 1, 1, 1 | w1, w1, w2 |
| pg-boss | 3 | 1, 1, 1 | w2, w1, w2 |

Three ticks is a small sample. WP 1-10's test stays the gate for documenting a second worker replica.

### E8. Pickup latency: one idle worker, 100 jobs 30 ms apart, a new session each

| Run | p50 | p95 | Max |
| --- | --: | --: | --: |
| graphile-worker, 0 stale queue rows | 6 ms | 7 ms | 27 ms |
| graphile-worker, 20,000 stale queue rows | 19 ms | 22 ms | 39 ms |
| graphile-worker, 100,000 stale queue rows | 236 ms | 284 ms | 294 ms |
| pg-boss | 7 ms | 8 ms | 19 ms |

Every graphile-worker fetch takes `for update skip locked` over all available rows of
`_private_job_queues` (strategy 2, `dist/sql/getJobs.js:85`). With one queue per session, a row is
left for every session whose jobs have finished. Nothing removes them automatically: `cleanup` is
called only from the CLI and `WorkerUtils` (`dist/cleanup.js`). `cleanup({ tasks: ['GC_JOB_QUEUES'] })`
removed 100,300 rows in 69 ms.

### Licences of the two dependency trees

| Library | Packages | Licences |
| ------- | -------: | -------- |
| graphile-worker 0.18.0 | 65 | MIT 55, ISC 8, 0BSD 1, **Python-2.0 1** |
| pg-boss 12.38.2 | 22 | MIT 18, ISC 2, Apache-2.0 1, `(MIT OR CC0-1.0)` 1 |

The Python-2.0 package is `argparse` 2.0.1 (graphile-worker → `cosmiconfig` 8.3.6 → `js-yaml` 4.3.2
→ `argparse`). js-yaml uses it only in its command-line tool, but it is a production dependency, and
Python-2.0 is **not** in [`licence-policy.json`](../../../licence-policy.json)'s allowlist. Adding
graphile-worker in WP 1-10 fails `pnpm check` as the policy stands (Q-051).

## Findings

1. **Serialization and debounce work in both libraries.** 0 overlaps in 4,000 job runs; 200
   concurrent triggers became exactly one turn per session with no errors. graphile-worker stays the
   choice; no ADR amendment is needed (the S-A criterion did not fail).
2. **The pg-boss swap works behind the same port, with differences:** queues declared up front, one
   key for serialization and debounce, polling that needs tuning to meet the p95 < 2 s pickup budget,
   and a permanently failed job that blocks its session. Its crash recovery (60 s) is far better
   than graphile-worker's.
3. **A crashed worker strands its session for 4 hours** under graphile-worker. The text in
   `job-pipeline.md` ("picked up again after graphile-worker's lock timeout") is true, but the
   timeout is 4 h, and the session's queue is blocked with it. The stuck-turn sweep's "its job is
   released" needs a release mechanism that the library does not provide on its own (Q-052).
4. **A graceful stop loses the abort write with graphile-worker's defaults**, which also strands the
   session for 4 hours. A batch delay of 0 for complete and fail writes fixed it in both runs. Every
   deploy and `docker stop` takes this path.
5. **Queue order is not insertion order**, and a retried job goes behind jobs that are already due.
   Turn correctness cannot rely on queue order; the generation check (ADR-0024) already decides which
   turn may publish.
6. **A trigger during a running turn removes that turn's retries** (graphile-worker). If the running
   turn then fails, only the new job runs, so it must pick up the failed turn's work.
7. **The debounced payload is last-writer-wins and arbitrary under concurrency.**
8. **Named-queue rows accumulate** and slow every fetch (p95 7 ms → 284 ms at 100,000 rows) until
   `GC_JOB_QUEUES` runs.
9. **`argparse` (Python-2.0) blocks graphile-worker under the current licence policy.**

## Recommendations (not decided)

For WP 1-10 (`JobQueue` port) and WP 1-11 (step runner), unless the owner decides otherwise:

- **R1. Write the turn job's payload as IDs only** (`org_id`, `session_id`, the trigger kind). The
  `resolve` step reads the pending inputs (unanswered replies, the head SHA, the generation) from the
  database, so a lost retry, a coalesced payload, or a reordered retry changes nothing.
- **R2. Close orphaned turns at `resolve`.** When a turn starts, an older turn of the same session
  that is still `queued` or `running` and holds no job is closed (`superseded` when the generation
  moved, otherwise `failed`), so the stuck-turn sweep is the backstop, not the normal path.
- **R3. Set `completeJobBatchDelay: 0` and `failJobBatchDelay: 0`**, and give the WP 1-10 suite a
  test that a graceful stop releases an aborted job.
- **R4. Honour the job's abort signal** at every step boundary and in provider calls, within the 5 s
  `gracefulShutdownAbortTimeout`. Give the `worker` container a stop grace period above that (the
  Compose default is 10 s), recorded in WP 1-13.
- **R5. Release a dead worker's locks (Q-052).** Default: each worker process records its
  graphile-worker pool ID with a heartbeat in a small table; the 5-minute stuck-turn sweep calls
  `forceUnlockWorkers` for pool IDs whose heartbeat is older than a threshold (for example 2 min).
  This adds an instance-level table (no `org_id`, like the migration table under ADR-0035).
- **R6. Run `cleanup` daily from the retention cron** with `GC_JOB_QUEUES` and `GC_TASK_IDENTIFIERS`.
  Leave out `DELETE_PERMAFAILED_JOBS`: permanently failed jobs stay inspectable (ADR-0006).
- **R7. Set `max_attempts` explicitly per job** (graphile-worker's default is 25, with a backoff
  reaching about 6 hours per retry).
- **R8. Keep the trailing debounce** and record the starvation bound in WP 1-10: a reply stream faster
  than 30 s postpones the turn. A cap such as "run at most 2 min after the first pending trigger"
  would need `preserve_run_at` logic in the port; not needed for the MVP unless replay or dogfood
  shows it.
- **R9. If pg-boss ever replaces graphile-worker:** pin the latest 12.x after a fresh check; set
  `notifyPollingIntervalSeconds` low or use batches; delete or archive a job on its final failure so
  its session is not blocked; set `heartbeatSeconds` on the turn queue.

## Not covered

- Linux, arm64, and the real `worker` image (Docker ran on Windows; numbers are indicative).
- A real SIGTERM to a process: Windows cannot deliver one to a child process, so E6b called the
  runner's `stop()`, which is what graphile-worker's signal handler does, but the handler itself was
  not exercised.
- Load beyond 500 jobs and 16 slots, and Postgres resource use, including pg-boss's polling cost at
  0.5 s.
- The two-worker cron test as a repeatable integration test (WP 1-10 owns it), and cron across a
  worker restart (backfill).
- pg-boss's `groupConcurrency`, dead-letter queues, and `fromKysely` adapter.
- `publish.github` serialization per installation; the same `serialKey` mechanism, not run
  separately.
