# ADR-0037: Releasing a dead worker's queue locks — worker heartbeats and a fenced release

- Status: accepted (owner, 2026-11-28; closes Q-052 with its recorded default)
- Date: 2026-11-28
- Owners: architecture + operations
- Amends: ADR-0035 decision 4 (adds `worker_heartbeats` to the tables without `org_id`);
  [`../architecture/technical-approach.md`](../architecture/technical-approach.md) §3.3 (how the
  stuck-turn sweep releases a job)
- Supersedes: —
- Revisit trigger: graphile-worker gains its own worker liveness or a configurable lock timeout; the
  queue moves to pg-boss (which has its own heartbeat); or a release ever lets two turns of one
  session run at once.

## Context

[Spike S-A](../analysis/spikes/2026-11-28-queue-serialization-debounce.md) (E6) killed a worker
during a job. graphile-worker 0.18.0 left the job **and the PR session's named queue** locked. It
clears stale locks only after 4 hours, hard-coded (`dist/sql/resetLockedAt.js:9`). Every other turn of
that session waits behind the lock. `WorkerUtils.forceUnlockWorkers([poolId])` released it, and the
job and the session's next job ran in order, within 635 ms.

Technical-approach §3.3 already says that the 5-minute stuck-turn sweep fails a stuck turn and "its
job is released", but not how. The library cannot tell a dead worker from a slow one: `locked_by` (the
worker pool's ID) and `locked_at` are all it records. Releasing a live worker's lock would let a second
worker run the same session's turn at the same time, which breaks the one-turn-per-session rule.

## Options

1. **Wait for the 4-hour timeout.** No code. A crashed worker, or a container killed during a deploy,
   blocks its PR sessions for up to 4 hours. Rejected.
2. **Release any lock older than a threshold.** Simple, but a long turn on a live worker (up to the
   10-minute cap, Q-031) would be released and run twice. Rejected.
3. **Use Postgres connection liveness** (`pg_stat_activity`). A dead process's connections close, but
   graphile-worker uses a pool whose connections are not tied to a lock, and a network partition can
   keep a dead process's TCP session open for minutes. Not reliable enough on its own.
4. **Worker heartbeats in a table, a release only for silent pools, and self-fencing.** Each worker
   process records its pool ID and a heartbeat on the database clock. The sweep releases locks only
   for pools that have gone silent, and marks them first, so a worker that was only slow sees the mark
   and stops. **Chosen** (the Q-052 default, with fencing added).

## Decision

Option 4.

1. **Table `worker_heartbeats`** (instance-level, no `org_id`, an addition to ADR-0035's exceptions):
   `pool_id` (graphile-worker's worker pool ID, the value it writes to `locked_by`; primary key),
   `host` (the container's hostname), `started_at`, `last_seen_at`, and `released_at` (null until a
   release). Times come from the database clock (`now()`), never the worker's clock.
2. **Each worker process** inserts its row when its pool starts, updates `last_seen_at` every
   **30 s** on its own timer, and deletes the row on a clean shutdown.
3. **The stuck-turn sweep** (every 5 minutes, technical-approach §3.3) looks for lock holders: the
   distinct `locked_by` values on graphile-worker's locked jobs and named queues whose lock is older
   than **2 minutes**, and whose pool has no row with `last_seen_at` in the last **2 minutes** (four
   missed beats). For each such pool, in this order, it:
   1. sets `released_at` (an absent row is inserted with `released_at` set);
   2. calls `forceUnlockWorkers([pool_id])`;
   3. writes an audit event `queue.lock_released` (system actor, pool ID, number of jobs);
   4. increments a counter on `/metrics`.
4. **Self-fencing:** a worker whose heartbeat finds its row with `released_at` set, or missing,
   stops taking jobs, fires the abort signal of its running jobs, and exits; the container restarts
   with a new pool ID. A live worker that lost its lock therefore stops within one heartbeat (30 s).
   Step idempotency (`(turn_id, step)`), the generation check, and the publish `external_id` check
   (ADR-0024, `job-pipeline.md`) keep that window from producing duplicate effects.
5. **The sweep reads graphile-worker's private tables** (`_private_jobs`, `_private_job_queues`) only
   inside the queue adapter, and the adapter's contract tests cover it, so a graphile-worker upgrade
   that changes them fails CI rather than production.
6. **The existing stuck-turn rule is unchanged:** a turn `running` longer than 20 minutes on a live
   worker is still failed with reason `stuck` (`review-progress-and-completion` RP-03).

With these values a crashed worker's sessions resume within about 7 minutes (2 minutes to be
declared dead, plus up to 5 minutes to the next sweep) instead of 4 hours. A graceful stop does not
need this path: it releases its jobs itself once complete and fail writes are awaited (S-A E6b, R3).

## Consequences

- WP 1-08 adds `worker_heartbeats` to the MVP migrations and to the migration test's list of tables
  exempt from `org_id`.
- WP 1-10 implements the heartbeat, the fencing, and the release inside the graphile-worker adapter,
  with an integration test: kill a worker during a job, and the job runs again within one sweep after
  the 2-minute threshold, with the session's order kept. A second test: a worker whose heartbeat is
  stopped but whose process keeps running is fenced and exits, and no turn of that session runs twice
  at once.
- WP 1-28a's stuck-turn sweep calls the release.
- `doctor` lists the worker pools with their `last_seen_at` and any `released_at`.
- A pg-boss adapter would not need the table's release logic: pg-boss retries a job whose heartbeat
  lapses (S-A E6, about 60 s with its default supervision). The table is graphile-worker-specific and
  goes if the queue changes.
- The 2-minute threshold means a worker blocked for 2 minutes (an event loop stall, a database
  outage) is fenced and restarted. That is the intended trade: a restart is cheap and a doubled turn
  is not.

## Security and operations

- No new secret, no new network path, and no tenant data: the table holds process identifiers only.
- Every release is audited and counted, so a rise in releases (crash loops, OOM kills) shows on
  `/metrics` and in `doctor`.
- The heartbeat write is one `UPDATE` every 30 s per worker, negligible at the sizing floor.
- Clock skew between containers does not matter: every comparison uses the database's `now()`.

## Evidence

- [Spike S-A](../analysis/spikes/2026-11-28-queue-serialization-debounce.md) E6 (4-hour lock;
  `forceUnlockWorkers` releases in 635 ms), E6b (graceful stop), and R5.
- graphile-worker 0.18.0: `dist/sql/resetLockedAt.js:9` and `:13` (the 4-hour constant);
  `dist/workerUtils.js:45` (`forceUnlockWorkers`).
- Technical-approach §3.3 (the stuck-turn sweep, audit Q-D); `job-pipeline.md` (the failure matrix).
- Q-052 in [`../analysis/open-questions.md`](../analysis/open-questions.md).

## Follow-ups

- WP 1-08: the table and the exemption.
- WP 1-10: the adapter work and the two tests above.
- WP 1-28a: the sweep calls the release.
- Deferred: making the 30 s, 2-minute, and 5-minute values configurable; not needed for the MVP.
