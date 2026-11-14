# ADR-0007: Token-aware context and repository retrieval

- Status: proposed
- Date: 2026-11-14
- Owners: AI pipeline + architecture
- Supersedes: the PoC's D-010 byte budgets (as the primary strategy)
- Revisit trigger: the Phase 3 benchmark shows retrieval does not improve precision/recall enough to
  justify the index cost.

## Context

The PoC bounded context in bytes: 200 KB total, 32 KB per file, plus byte-budgeted knowledge packs.
That is model-agnostic and cheap, but it cannot guarantee a prompt fits a model's window, cannot
estimate cost, and cannot select the code that makes a finding correct. Review quality is the
product's main differentiator.

## Options

1. **Keep byte budgets.** Simple; no tokenizer/model registry; poor fit and cost control.
2. **Token budgets only.** Model-aware; still diff-only; misses callers/tests/context.
3. **Token budgets + deterministic repository index.** Symbols, imports, tests, configs; explainable
   retrieval; no embeddings required.
4. **Token budgets + embeddings/RAG.** Best semantic recall; more infrastructure, cost, and
   evaluation risk.
5. **Whole-repository context.** Not feasible at scale; expensive; poor signal.

## Decision

Option 3 for v1, with option 4 deferred behind a benchmark. The context planner uses a model
registry (window, tokenizer, price) and a repository index (symbols, imports, tests, configs) to
select context within a token and cost budget. It produces a manifest of what was included/omitted
and why. Byte counts remain as a secondary safety bound, not the primary strategy.

## Consequences

**Easier:** prompts fit; cost is predictable; context is explainable; findings can be grounded
against related code; a benchmark can compare strategies.

**Harder:** a tokenizer per model family; an indexer; more pipeline complexity; more tests; index
staleness and cache invalidation.

**Not decided here:** the exact tokenizer library, embedding model, or vector store. Those are
implementation details behind the context-provider interface.

## Security and operations

- Indexed code is stored in the operator's infrastructure; retention follows the data policy.
- The index is derived data and can be rebuilt; it never becomes the source of truth.
- Retrieval results are untrusted data with a trust label, like the diff.
- Token/cost estimates are logged; budgets are enforced before calls.

## Evidence

- `docs/architecture/ai-pipeline.md`, `docs/architecture/components.md`.
- `docs/analysis/flaws.md` F-010, F-044, F-045, F-052.
- PoC D-010, D-021, D-031, D-034.

## Follow-ups

- Spike: index a mid-size TypeScript repo; measure index time, size, and retrieval quality.
- Benchmark: diff-only vs index retrieval on the golden PR set.
- Decide the fallback when the index is unavailable: degrade visibly, never silently.
- Decide whether embeddings are worth it after the first benchmark.
