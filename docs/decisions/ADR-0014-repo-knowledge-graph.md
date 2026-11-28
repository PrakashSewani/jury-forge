# ADR-0014: Diff-only PR review with an incremental repository graph

- Status: accepted (G0, 2026-11-16; graph and branch review are v1.1, measurement-gated; PR review
  context amended by ADR-0025: T0+ reads only files already in the diff)
- Date: 2026-11-15
- Owners: AI pipeline + architecture
- Supersedes: the PoC's diff-only context + literal reference paths (as the context strategy)
- Revisit trigger: graph cost/quality data, or a repository size that Postgres adjacency cannot serve.

## Context

The owner wants PR reviews to be diff-only by default. For branch reviews, the product must build
a graph/knowledge base of the repository so context is not repeated, and update it on every
branch/T2 review run. The PoC only had the diff plus optional literal reference paths; it could not see callers,
tests, or the rest of the repository unless the operator listed paths.

## Options

1. **Diff-only forever** — cheap, but misses context; rejected for branch review.
2. **Send the whole repo on every run** — expensive, slow, repetitive; rejected.
3. **Vector-only RAG** — fuzzy, no structural guarantees; insufficient alone.
4. **Postgres graph + incremental index + content-hash summaries** — chosen.
5. **Dedicated graph database** — powerful, extra operations; deferred.

## Decision

> **Note (2026-11-15):** [ADR-0018](ADR-0018-release-tiering-and-quality-first-sequencing.md)
> sequences the graph and branch review into v1.1 (benchmark-gated). [ADR-0019](ADR-0019-pr-review-context-tiers.md)
> proposed bounded reads of arbitrary files for PR review and was **rejected**. PR review stays
> diff-only: from v1 the hunks are expanded to the enclosing function within files already in the
> diff (T0+, [ADR-0025](ADR-0025-v1-review-pipeline.md)); no file outside the diff is read. The
> decisions below stand.

- **PR review is diff-only.** It sends the PR diff/hunks (T0+ expansion per ADR-0025) and metadata;
  no graph, and no file outside the diff.
- **Branch review uses the graph.** It compares the branch to the default branch and provides the
  graph as context.
- **The review target is the branch delta vs the repository default branch.** The graph is context,
  not a second review target; a branch review does not audit untouched files.
- **Branch review is explicit** (the `jury:branch-review` label or Branch review action, UI, config) and shows an estimate; it uses the
  graph and can query the repository within budget.
- **The graph is a first-class service:** nodes/edges for files, symbols, imports/references, tests,
  configs, docs, ownership, conventions, prior findings; content-hash summaries and cached slices.
- **Postgres adjacency** is the first store; object storage for blobs; vector store optional later.
- **Incremental updates:** on every branch/T2 review run at the generation SHA and on default-branch pushes,
  re-parse only changed files + reverse dependencies; reuse unchanged summaries by content hash;
  version by `(repo, commit)`; per-repo lock; stale index visible.
- **No repeated full context:** summaries first, expand via tools; context manifest records what was
  used; prompt cache where available.
- **Languages:** TS/JS deep symbols first; Python/Go next; file/import/test graph for unknown
  languages; parser version recorded.

## Consequences

**Easier:** branch review without re-indexing; related code for branch review; lower context cost;
explainable context; a foundation for retrieval and evaluation.

**Harder:** parser/indexer maintenance; incremental correctness; graph schema/migrations; language
support; cache invalidation; storage/retention.

**Invariants:** the index is derived and rebuildable; the commit SHA identifies a version; unchanged
content is not re-summarized; stale is never silently fresh; secrets are not stored.

## Security and operations

- Index jobs are durable, locked per repo, size/time capped, cancellable.
- The graph is tenant/repo-scoped; no cross-tenant retrieval.
- Secret-like content is excluded; retention/deletion follows the repo.
- No code execution; parsing and read-only slices only.
- A parser upgrade triggers a background rebuild; the old index stays readable.

## Evidence

- Spec: [`../product/specs/repo-knowledge-graph.md`](../product/specs/repo-knowledge-graph.md).
- Live PoC evidence: `src/server.ts:78` key leak and SQL injection in `src/exporter.ts` were outside
  the PR diff and never seen; the reviewer's context ceiling is real.
- Parent: [`../product/specs/agentic-review-sessions.md`](../product/specs/agentic-review-sessions.md).

## Follow-ups

- Spike: index a mid-size TS repo; measure incremental update and retrieval quality.
- Decide TS/JS parser (`ts-morph` vs Tree-sitter) and the Python/Go parsers.
- Define graph schema, retention, and the "stale" UX.
- Benchmark diff-only vs graph-assisted context on the golden PR set.
