# ADR-0004: PostgreSQL is the source of truth

- Status: proposed
- Date: 2026-11-14
- Owners: architecture
- Supersedes: —
- Revisit trigger: a proven single-user mode that needs an embedded store, or a scale ceiling that
  requires a different primary store.

## Context

The product needs durable jobs, leases, runs, steps, findings, audit, budgets, tenancy, and
idempotency. The PoC used D1/SQLite because Durable Objects required it. The target product needs
transactions, `SELECT ... FOR UPDATE SKIP LOCKED`, JSONB for policy snapshots, full-text search,
indexes, and a mature backup/restore story.

## Options

1. **PostgreSQL.** Mature, transactional, queue-capable, JSONB, full-text, extensions (pgvector
   later), excellent operations.
2. **SQLite.** Simple single-file; fine for a demo; weak concurrency, no network access, no
   row-level security, limited backup/HA.
3. **MySQL/MariaDB.** Viable; weaker JSON/queue ergonomics for this use case.
4. **A document store.** Poor fit for relational runs/findings/audit and transactions.
5. **D1/Cloudflare.** Rejected by ADR-0001/0002.

## Decision

Option 1. PostgreSQL 16+ is the source of truth for the reference deployment. The schema uses
tenant-scoped tables, row-level security as defense in depth, and a Postgres-backed job queue
(`SKIP LOCKED`) for v1. Object storage holds large artefacts.

## Consequences

**Easier:** one durable store; transactional outbox; queue without Redis; audit queries; rollups;
migrations; backup/restore; read replicas later.

**Harder:** another service to operate (bundled in Compose); connection pooling; schema discipline;
a single point of failure unless the operator uses managed Postgres or HA.

**Not decided here:** whether a SQLite-backed single-user mode ships later. If it does, it must pass
the same contract tests and be clearly limited.

## Security and operations

- Postgres is not exposed publicly; least-privilege role; TLS for external connections.
- Row-level security keyed by `org_id` as defense in depth.
- Backups: daily full + WAL where available; restore drill.
- Migrations: expand/contract, versioned, one-shot job, pre-upgrade backup.
- PII/code-bearing rows follow the retention policy; encryption at rest is the operator's disk/KMS.

## Evidence

- `docs/architecture/data-model.md`, `docs/architecture/job-pipeline.md`.
- PoC schema limits in `docs/poc/data-model.md`.
- `docs/analysis/flaws.md` F-001, F-008, F-036, F-039.

## Follow-ups

- Spike: `SKIP LOCKED` queue under load; compare with Redis.
- Decide the connection pooler (PgBouncer or app-level).
- Decide whether pgvector is acceptable for the optional semantic retrieval.
