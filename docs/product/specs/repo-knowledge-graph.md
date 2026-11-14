# Spec: Repository knowledge graph

- Status: draft for owner review
- Date: 2026-11-15
- Owner: AI pipeline + architecture
- Related: ADR-0014
- Parent: [`agentic-review-sessions.md`](agentic-review-sessions.md)

## Owner directive

Default to **diff-only** PR review. If the user asks for a **full-repo review**, build a graph /
knowledge base against the repository so context is not repeated. **Update it on every review run.**

## Problem

A diff-only reviewer sees a patch in isolation. It misses callers, types, tests, configuration, and
the conventions that decide whether a change is correct. Sending the whole repo on every turn is
expensive, slow, and repetitive. The product needs a persistent, incrementally updated model of the
repository that both diff and full reviews can query.

## 1. What the graph is

A **repository knowledge graph** is a versioned, derived representation of a repository at a commit:

```
Repository
 └── Commit (index version)
      ├── File ── contains ──> Symbol (function/class/type/export)
      │    ├── imports ──> Module/File
      │    ├── references ──> Symbol
      │    ├── tested_by ──> Test
      │    ├── owned_by ──> Owner/CODEOWNERS
      │    └── documented_by ──> Doc
      ├── Test ── covers ──> Symbol/File
      ├── Config ── affects ──> File/Symbol
      ├── Convention (AGENTS.md, CONTRIBUTING.md, ADRs, lint)
      └── Finding ── relates_to ──> File/Symbol/Thread
```

- **Nodes:** repository, commit, file, symbol, module, test, config, doc, owner, convention, finding.
- **Edges:** contains, imports, calls/references, tests, owns, documents, affects, relates_to,
  supersedes.
- **Summaries:** each file/symbol can have a short generated summary and a content hash. The context
  planner sends summaries first and expands with tools, so the same full file is not re-sent.
- **No secrets:** the index is derived from code; secret-like content is redacted or excluded per
  policy.
- **Versioned:** `(repository, commit_sha)` identifies an index version. A PR uses the head SHA; the
  default branch uses the merge commit.

## 2. When it is built and updated

| Trigger | Work |
| ------- | ---- |
| First review for a repo | Full index at the PR head SHA (or the default branch if the head is unavailable), then incremental for the PR. |
| Every review run | Incremental update at the generation SHA: changed files + reverse dependencies; reuse unchanged summaries/symbols by content hash. |
| Push to default branch | Incremental update of changed files; mark affected symbols/tests; no full rebuild unless the parser version changes. |
| Manual "Rebuild index" | Full rebuild, with progress and cancellation. |
| Parser/schema version bump | Full rebuild in the background; old index remains readable until replaced. |
| Repository deleted/disabled | Delete the index per retention policy. |

- The update is a **durable job** with a per-repo lock; two runs cannot index the same repo
  concurrently.
- A failed incremental update leaves the previous index valid and marks it `stale`; the review can
  proceed with a warning or wait, per policy.
- The index is **not** rebuilt from scratch on every run. That is the point.

## 3. Incremental algorithm

1. Compute changed files between the index commit and the target SHA (git diff or forge API).
2. Re-parse changed files; compute content hashes.
3. For unchanged files, reuse nodes/edges/summaries whose content hash matches.
4. Recompute reverse dependencies for changed files (who imports/calls them) up to a bounded depth.
5. Recompute test coverage links for changed symbols.
6. Update findings/thread links that point at changed files.
7. Write a new index version; keep the previous version for rollback.
8. Record metrics: files parsed, reused, edges updated, duration, token cost (if summaries are
   model-generated).

## 4. Retrieval

Exposed to agents as tools and to the context planner as ranked sources:

| Query | Returns |
| ----- | ------- |
| `get_file_slice(path, range)` | Exact code at the index commit |
| `find_symbol(name)` | Definitions with file/line |
| `find_references(symbol)` | Callers/importers, ranked |
| `find_tests(path/symbol)` | Related tests |
| `get_neighbors(node, depth)` | Graph neighborhood |
| `search(query)` | Lexical/semantic search over files/symbols/summaries |
| `get_conventions(paths)` | AGENTS/CONTRIBUTING/ADRs/lint config |
| `get_prior_findings(paths)` | Open/resolved findings for this repo/PR |
| `get_summary(node)` | Cached summary, with content hash |

- The context planner uses the graph to select the **minimum** context that answers the question.
- A scoped reviewer's path filters are applied before retrieval; a finding outside scope is still
  rejected at consolidation.
- Results are capped by count and tokens; the agent can expand explicitly.

## 5. Full-repo review

- Triggered by `/jury full`, the UI, or `mode: full` in repo config.
- Before starting, show an estimate: files, symbols, tokens, cost, expected time; allow cancel.
- The index is updated first; the planner builds a coverage plan (what areas to read) and the agents
  can query the graph arbitrarily within budget.
- Output is still a review (findings + summary), not a repository report; the difference is context
  depth.
- Full review is expensive; default off; never automatic unless policy explicitly says so.

## 6. Storage

- **Postgres** for nodes, edges, summaries, index versions, and metadata. Adjacency tables with
  indexed `(index_id, from_id)`, `(index_id, to_id)`, `(repo_id, commit_sha)`.
- **Object storage** for raw file blobs/patches and large parse artefacts; content-addressed by hash.
- **Optional vector store** for embeddings; not v1. If added, it is one more ranked source, not the
  source of truth.
- **Redis** optional for hot retrieval caches; Postgres is the source of truth.
- A dedicated graph database (Neo4j) is deferred; Postgres adjacency is enough for a single repo and
  keeps operations simple.

## 7. Languages

- v1: TypeScript/JavaScript (Tree-sitter or `ts-morph`), Python, Go, Rust if feasible; at minimum a
  file/import/test graph for any language plus deep symbols for TS/JS.
- Unknown languages: file-level graph + lexical search; never pretend to have symbol-level support.
- Parser versions are recorded; a parser upgrade triggers a background rebuild.

## 8. Cache and context reuse

- **Content hash** per file and per symbol summary; unchanged content is never re-summarized.
- **Context manifest** per turn: what was included, from which node, why; what was omitted.
- **Prompt cache** where the provider supports it; the graph makes the stable prefix larger.
- **Session cache:** the PR session stores the generation's graph version and the last context
  manifest; a new turn reuses unchanged pieces.
- **Invalidation:** a changed file invalidates its nodes, summaries, and edges; reverse dependents
  are re-ranked, not fully rebuilt.

## 9. Security and privacy

- The graph is derived from the operator's code; it stays in their infrastructure.
- Secret-like content is redacted/excluded per data policy; the graph never becomes a secret store.
- Access is tenant/repo-scoped; a user who cannot read the repo cannot query its graph.
- Retention: delete with the repository/instance; configurable.
- Index jobs are rate-limited; a malicious huge repo cannot starve workers (size caps, timeouts,
  cancellation).
- No code execution: parsing only; tools read slices.

## 10. Acceptance criteria

- [ ] First full review builds an index for a test repo; the second run reuses it.
- [ ] A two-file change re-parses only those files and their reverse dependencies, not the whole repo.
- [ ] A changed file invalidates its summaries/edges; an unchanged file's summary is reused.
- [ ] `find_references` returns the callers of a changed symbol.
- [ ] `find_tests` returns related tests.
- [ ] A full review shows an estimate and can be cancelled.
- [ ] The context manifest shows graph-sourced context and why it was included.
- [ ] A stale index is visible and never silently used as fresh.
- [ ] Deleting a repo deletes its index.
- [ ] A parser upgrade schedules a rebuild without breaking the current review.

## 11. Metrics

- Index build time and size per repo.
- Incremental update time; files parsed vs reused.
- Graph query latency; context tokens per turn.
- Cache hit rate for summaries and prompts.
- Full-review cost vs diff-review cost.
- Retrieval usefulness (finding acceptance when graph context is used).

## 12. Open questions

| ID | Question | Default |
| -- | -------- | ------- |
| Q-029 | Which languages are deep-symbol in v1? | TS/JS first; Python/Go next. |
| Q-030 | Is Postgres adjacency enough, or do we need a graph DB? | Postgres; revisit at 10M edges. |
| Q-031 | Do we generate model summaries for every symbol, or only on demand? | On demand + cache; no full summarization at first. |
| Q-032 | Do we add embeddings in v1? | No; after the graph + benchmark prove value. |
| Q-033 | How long do we keep old index versions? | Last 5 commits + 30 days. |
| Q-034 | Do we index private repos on install, or on first review? | On first review; opt-in full pre-index later. |
