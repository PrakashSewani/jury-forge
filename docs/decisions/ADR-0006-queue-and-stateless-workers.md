# ADR-0006: Queue and stateless workers, not per-run actors

- Status: accepted (Phase 1a, 2026-11-16): graphile-worker behind a `JobQueue` port, pg-boss fallback; per-session `queue_name`, `job_key` debounce (`technical-approach.md` §3.3)
- Date: 2026-11-14
- Owners: architecture
- Supersedes: the PoC's D-006 (per-run Durable Object)
- Revisit trigger: the queue becomes an operational burden, or a workflow engine offers a clear
  advantage without lock-in.

## Context

The PoC used one Durable Object per run with alarms as the scheduler. It was durable but had no
queue semantics: no backpressure, fairness, cancellation, dead-letter queue, or concurrency
control, and it left a permanent named actor per run. The target product needs reliable,
observable, cancellable reviews with exactly-once publishing.

## Options

1. **Postgres-backed job queue + stateless workers.** One less dependency; `SKIP LOCKED`; leases;
   idempotent steps; easy to inspect.
2. **Redis/BullMQ.** Mature queue features; another service; at-least-once semantics still require
   idempotency.
3. **A managed queue (SQS, Cloud Tasks).** Vendor dependency; contradicts self-hosted.
4. **Temporal/Workflow engine.** Excellent durability; another complex service; overkill for v1.
5. **Per-run actor (PoC).** Rejected; see F-008, F-009.

## Decision

Option 1 for v1: a durable queue abstraction, implemented with PostgreSQL in the reference
deployment. Workers claim jobs with a lease, heartbeat, and execute idempotent steps. A scheduler/
janitor recovers expired leases, retries, and moves exhausted jobs to a dead-letter queue. The queue
interface allows Redis or another backend later.

## Consequences

**Easier:** backpressure, fair scheduling, cancellation, replay, observability, no permanent actor
per run, one fewer service.

**Harder:** we own the queue semantics (leases, visibility timeout, retries, DLQ); Postgres must
handle queue load; polling vs `LISTEN/NOTIFY`.

**Invariants:** enqueue and state change in one transaction (outbox); every external effect has an
idempotency key; every step is retryable; no immortal `running` rows.

## Security and operations

- Only workers can claim jobs; the queue is internal.
- Leases and heartbeats prevent duplicate work; the janitor is idempotent.
- Dead letters are inspectable and replayable by an admin, with audit.
- Queue depth, wait time, retries, lease expiries, and dead letters are metrics.

## Evidence

- `docs/architecture/job-pipeline.md`.
- `docs/analysis/flaws.md` F-001, F-002, F-007, F-008, F-009, F-036, F-037.
- PoC D-006 and its retry/alarm implementation.

## Follow-ups

- Spike: `SKIP LOCKED` queue at 10× expected throughput; compare with Redis.
- Define the step contract and the idempotency rules in code.
- Define the cancellation and generation check before publish.
- Decide whether the scheduler is a separate process or a leader-elected loop.
