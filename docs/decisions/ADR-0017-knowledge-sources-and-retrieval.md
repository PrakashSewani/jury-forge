# ADR-0017: Knowledge sources, snapshots, grants, and retrieval

- Status: proposed
- Date: 2026-11-15
- Owners: AI pipeline + security
- Supersedes: the PoC’s knowledge-pack-only model
- Revisit trigger: retrieval quality/benchmark, or a demand for live external doc fetching.

## Context

Reviewers need skills, docs, Markdown files, doc links, repo conventions, and the repository graph.
Pasting everything into a prompt is expensive and insecure; fetching user-supplied URLs at review
time is an SSRF risk. Knowledge must be versioned, scoped, citable, and budgeted.

## Options

1. **Prompt-only knowledge** — paste docs into instructions; unbounded, unauditable; rejected.
2. **Packs only** — the PoC model; good, but no repo docs, doc links, or capability grants.
3. **Live URL fetch at review time** — fresh, but SSRF/latency/reliability; rejected.
4. **Unified sources + snapshots + grants + retrieval** — chosen.
5. **Full RAG service with embeddings in v1** — powerful, extra cost/ops; deferred; lexical+graph
   retrieval first.

## Decision

- Knowledge sources: reviewer instructions, repo docs at SHA, knowledge packs, allowlisted doc-link
  snapshots, the repo graph, prior findings/session memory, org conventions.
- Packs keep `SKILL.md` + `docs/`, immutable content hashes, frontmatter with capabilities/apply/
  paths/never_quote/owner; `.claude/skills/` manifests remain compatible.
- Doc links are **snapshotted at ingestion** (HTTPS, allowlist, no private IPs, redirects rechecked,
  size/time caps), content-hashed, refreshed on a schedule; no live fetch at review time and no
  PR/model-supplied URLs.
- Grants target org/repo/reviewer/**capability**, with precedence, pin/latest, path filters, and
  enabled state. A source with no grant is never injected.
- Retrieval is **relevant chunks/graph context under a token budget**, not wholesale injection;
  manifests aren’t truncated; dropped sources are named with a reason.
- Every injected block is cited with source/version/hash/path; the posted review never exposes pack
  names/hashes/`never_quote` content (run detail does).
- Reviewer instructions/rules win over knowledge; precedence is recorded.
- Capability grants resolve after reviewer selection; they do not change which reviewers run.

## Consequences

**Easier:** team knowledge without prompt bloat; repo conventions; external standards; attribution;
capability-based knowledge; reproducible versions; safe URL ingestion.

**Harder:** ingestion/refresh jobs; chunking/ranking; grants/precedence UX; token budgets; signing;
snapshot storage; citation accuracy; stale-source handling.

**Invariants:** untrusted data never becomes instructions; no live URL fetch at run time; no grant =
no injection; every citation resolves; `never_quote` is never sent.

## Security and operations

- URL ingestion is admin-only and SSRF-safe; snapshots are content-addressed and retention-bound.
- Packs/doc links/repo docs are untrusted; prompt-injection defenses apply.
- Secret-like patterns are redacted; `never_quote` is stored but withheld.
- Knowledge is tenant/repo/reviewer-scoped; access follows repo access.
- Signed packs are optional; unsigned packs are labelled.
- Refresh failures mark stale, not break the review.

## Evidence

- Spec: [`../product/specs/knowledge-system.md`](../product/specs/knowledge-system.md).
- PoC D-034 knowledge packs; live review showed external context is useful but must be bounded.
- Security: [`../architecture/security.md`](../architecture/security.md).

## Follow-ups

- Define chunking/ranking and citation format.
- Build the knowledge library/grants UI and retrieval preview.
- Define the capability-grant UX.
- Benchmark knowledge impact; add embeddings only if justified.
