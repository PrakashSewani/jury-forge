# ADR-0005: TypeScript-first runtime for v1

- Status: proposed
- Date: 2026-11-14
- Owners: architecture
- Supersedes: —
- Revisit trigger: the indexer becomes CPU-bound beyond what Node can handle, or the team's
  composition changes.

## Context

The PoC is TypeScript across a React dashboard, a Hono API, shared zod schemas, and Workers. The
team knows it. The target product needs a web/API service, stateless workers, a scheduler, a CLI,
and an indexer. The review pipeline is I/O-bound (forge/provider calls); indexing is CPU/memory
heavy.

## Options

1. **TypeScript/Node everywhere.** Reuse the contracts, React, zod, and team knowledge; one language;
   one toolchain. Node handles I/O well; CPU-heavy indexing can be a separate worker or a native
   addon.
2. **Go for backend + TypeScript for web.** Strong concurrency and binaries; two languages, two
   contract sources, more coordination.
3. **Rust for backend.** Best performance and safety; slower iteration and a smaller contributor
   pool for this product.
4. **Python backend.** Great AI ecosystem; weaker typing/ops story for this team; two languages.
5. **Hybrid: TypeScript core + a Rust/Go indexer later.** Pragmatic; extract only if measured.

## Decision

Option 1 for v1: **TypeScript on a pinned Node LTS**, a modular monolith (web/API + worker +
scheduler), React for the dashboard, shared zod schemas, PostgreSQL, a Postgres-backed queue.
Extract a CPU-heavy indexer (option 5) only if a benchmark proves Node is the bottleneck.

## Consequences

**Easier:** shared contracts; one CI; one container base; fast iteration; contributors can read the
whole stack; reuse the PoC's zod/contract discipline and UI primitives.

**Harder:** CPU-bound parsing/indexing may need worker threads or a separate service; Node memory
limits; the runtime is another supply-chain surface.

**Constraints:** pin Node LTS in the image; no native addons without a prebuilt/verified path; all
contracts are schemas, not interfaces; the worker is stateless and horizontally scalable.

## Security and operations

- Run as non-root; minimal image; no build tools in production.
- Dependency pinning, SBOM, signed images.
- The worker has no inbound HTTP except health/metrics.
- CPU/memory limits per container; queue concurrency sized to the host.
- A future indexer extraction must not change the pipeline contract.

## Evidence

- `docs/architecture/components.md`, `docs/architecture/deployment.md`.
- PoC D-001 (TypeScript stack) and its contract discipline.
- `docs/analysis/flaws.md` F-008, F-009 (runtime shape, not language).

## Follow-ups

- Spike: index a mid-size repository in Node; measure time/memory.
- Decide the framework (e.g. Fastify/Hono) and the worker runtime (same process vs threads).
- Decide whether the CLI is Node or a small Go binary; default to Node for one toolchain.
