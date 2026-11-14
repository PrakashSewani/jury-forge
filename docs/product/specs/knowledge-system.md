# Spec: Knowledge system for reviewers

- Status: draft for owner review
- Date: 2026-11-15
- Owner: product + AI pipeline + security
- Related: ADR-0017 (knowledge sources), ADR-0014 (repo graph)
- Parent: [`agentic-review-sessions.md`](agentic-review-sessions.md)

## Owner directive

Reviewers need a **knowledge basis**: skills, docs, doc links, Markdown files, conventions, and
repository knowledge. It must be versioned, scoped, attributable, and injected under a budget — not
pasted into one giant prompt.

## 1. Knowledge sources

| Source | What it is | Lifecycle |
| ------ | ---------- | --------- |
| **Reviewer instructions/rules** | The reviewer’s own identity and constraints | Versioned with the reviewer |
| **Repository docs** | `AGENTS.md`, `CONTRIBUTING.md`, `README`, ADRs, `docs/**`, architecture notes | Read at the reviewed SHA; indexed incrementally |
| **Knowledge packs** | Uploaded folder/zip: `SKILL.md` manifest + `docs/` files | Immutable content-hashed versions; grants |
| **Doc links** | Allowlisted external URLs (vendor docs, standards, internal handbook) | Live fetch at turn time with guards + per-run snapshot; last snapshot on failure |
| **Repository graph** | Symbols, imports, references, tests, configs, ownership | Derived per commit; see repo graph spec |
| **Prior findings/session memory** | The PR’s previous findings, decisions, user replies | Session-scoped; summarized |
| **Org conventions** | Org-wide engineering standards, security policy, review rules | Org-level pack/grant |

All sources carry a **trust label**. External docs, repo docs, and packs are untrusted data; they
never become instructions.

## 2. Knowledge pack format

Keep the PoC’s portable shape, extended for capabilities and discovery:

```
my-pack/
├── SKILL.md            # manifest + primary knowledge
└── docs/
    ├── security.md
    ├── api-guidelines.md
    └── ...
```

`SKILL.md` frontmatter:

```yaml
name: Payments Security
description: PCI, tokenization, and payment-flow rules
kind: skill              # skill | reference | convention | agent
capabilities: [security, payments, pci]
apply: paths             # always | paths
paths: ["src/payments/**", "src/billing/**"]
never_quote: ["docs/secrets/**"]
owner: payments-sme
version: 1               # informational; content hash is authoritative
source: internal
```

- Unknown frontmatter keys are accepted, so existing `.claude/skills/` files work.
- `capabilities` lets a pack be granted to a **capability** as well as a reviewer/repo/org.
- `never_quote` files are stored but never sent to the model; only the manifest field is rendered.
- Max sizes/caps from the PoC remain (manifest ≤ 32 KB, doc ≤ 64 KB, version ≤ 512 KB/100 docs).
- Only `SKILL.md` + `docs/` are stored/injected; other upload files are ignored with a warning.
- A pack version is SHA-256 over the normalized manifest + docs; `(pack, hash)` is unique.

## 3. Doc links (URLs)

There are two different things, and they need different rules:

### Repo-hosted docs

If the document lives in the repository, **read it at the PR head SHA**, not from a live URL. That is
the only way it reflects the PR. This includes `AGENTS.md`, `CONTRIBUTING.md`, ADRs, `docs/**`,
README, and any Markdown the PR changed. The repo graph/doc index handles this deterministically.

### External doc links

External docs can change independently of the PR, so **live-fetch them at turn time with strict
controls and keep a per-run snapshot for audit.**

- Admin adds a URL (or a set) to the allowlist; no PR comment, user, or model can add one.
- Fetch rules:
  - HTTPS only;
  - allowlisted domains;
  - resolve and block private/loopback/link-local/metadata IPs, and re-check redirects;
  - per-domain rate limit; short timeout (for example 10 s); size cap (for example 2 MB);
  - allowed content types; no JS/browser execution.
- Cache with a short TTL (for example 5 minutes) and conditional requests (`ETag` /
  `If-Modified-Since`) to avoid hammering the source.
- **Always store the fetched copy for the run**: URL, final URL, fetchedAt, content hash, title,
  text, status. The review is auditable even though the source may change later.
- If the live fetch fails, use the last successful snapshot and mark it stale; if there is no
  snapshot, omit it and name it in the context manifest.
- A changed hash is a new knowledge version; a review records which hash it saw.
- If a page is JS-rendered, the fetch may be useless; the operator can upload Markdown instead. Do
  not run a browser at review time.
- A live fetch is **not** a grant: the URL must already be an admin-curated knowledge source.

## 4. Scopes, grants, and precedence

A knowledge grant attaches a source to a scope:

| Scope | Example |
| ----- | ------- |
| `org` | Company security standards |
| `repo` | This repo’s ADRs and runbooks |
| `reviewer` | The Security reviewer’s PCI pack |
| `capability` | Every reviewer with `security` gets the security pack |

- Grants have `enabled`, `precedence`, `pin` (version) or `latest`, and an optional path filter.
- Reviewer instructions/rules always win over knowledge.
- Precedence: reviewer instructions > repo conventions > org policy > packs > external docs, unless
  a grant’s precedence says otherwise; record the effective order.
- A pack with no grant is never injected.
- A capability grant is resolved after the reviewer is selected; it does not change which reviewers
  run.
- A repo can pin a pack version for reproducibility; “latest” is a channel, not a silent update.

## 5. Retrieval, not wholesale injection

- **Repo docs/graph:** index at the reviewed SHA; retrieve relevant sections/symbols by the diff,
  changed paths, and graph neighbors.
- **Packs:** chunk by headings; embed/lexical index; retrieve the most relevant chunks within a
  token budget; fall back to the manifest + body if no retrieval.
- **Doc links:** chunk the snapshot; retrieve by relevance to the diff and reviewer capability.
- **Citations:** every injected knowledge block names its source, version/hash, path/section; the
  run records what was used.
- **Budget:** token budget per reviewer, not bytes; a source that does not fit is dropped whole with
  a reason; manifests are not truncated.
- **Preview:** reviewer creation/test shows what knowledge would be retrieved for a sample PR.

## 6. Reviewer creation and knowledge

In the reviewer creation studio, the **Knowledge** section lets the owner:

- attach packs/doc links/org conventions;
- see inherited capability/repo/org grants (read-only);
- preview the effective knowledge and token estimate;
- set a knowledge budget for this reviewer;
- choose “retrieve relevant sections” vs “include manifest + body” (default retrieve);
- mark sources as read-only reference or conventions.

A reviewer with capability `security` can automatically inherit org/repo/capability grants; an
explicit reviewer grant adds or overrides.

## 7. Security

- All knowledge is untrusted data; prompt-injection defenses apply.
- `never_quote` and secret-like patterns are withheld/redacted.
- URL ingestion is SSRF-safe and admin-only; no PR/user/model-supplied URLs.
- Knowledge access is tenant/repo/reviewer-scoped; a user cannot query a repo’s knowledge without
  repo access.
- Signed packs (optional) verify origin; unsigned packs are allowed but labelled.
- Retention/delete applies to packs, snapshots, and chunks.
- The posted review never exposes pack names/hashes or `never_quote` content; run detail does.

## 8. Data model

- `knowledge_sources` (org, kind: pack/url/repo-doc/convention, name, owner, status).
- `knowledge_packs` / `knowledge_versions` / `knowledge_documents` / `knowledge_chunks`.
- `knowledge_snapshots` (URL, hash, fetchedAt, text, status).
- `knowledge_grants` (source, scope, target, precedence, pin, enabled).
- `knowledge_citations` (turn, source, version/hash, path/section, tokens).
- `reviewer_knowledge_bindings` (reviewer version, source, mode).

## 9. Acceptance criteria

- [ ] Upload a pack with `SKILL.md` + docs; version it; grant it to a reviewer/repo/org.
- [ ] Grant a pack to a capability; only reviewers with that capability receive it.
- [ ] Add an allowlisted doc link; live-fetch it at review time; store the fetched copy/hash; use the last snapshot on failure.
- [ ] Repo docs are read at the reviewed SHA and indexed incrementally.
- [ ] Retrieval selects relevant chunks under a token budget; dropped sources are named with reasons.
- [ ] Every injected knowledge block is cited with source + hash/path.
- [ ] `never_quote` files are stored but never sent; the posted review does not reveal them.
- [ ] A pack with no grant is never injected.
- [ ] A stale URL snapshot is marked; a failed refresh does not break the review.
- [ ] Reviewer instructions win over knowledge; precedence is recorded.
- [ ] Deleting a source removes it from future runs and its snapshots per retention.

## 10. Open questions

| ID | Question | Default |
| -- | -------- | ------- |
| Q-046 | Do we auto-include `AGENTS.md`/`CONTRIBUTING.md` or require a repo setting? | Opt-in per repo, as the PoC. |
| Q-047 | Are doc links live-fetched or snapshotted? | Live fetch with allowlist/SSRF/cache guards; always snapshot the fetched copy for audit. |
| Q-048 | Can packs be granted by capability automatically? | Yes, capability grant; explicit reviewer grant overrides. |
| Q-049 | Do we support `.claude/skills/` manifests unchanged? | Yes, unknown fields accepted. |
| Q-050 | How is retrieval ranked? | Hybrid lexical + graph relevance; embeddings later. |
| Q-051 | Do we sign packs in v1? | Optional signing; unsigned labelled. |
| Q-052 | What is the default knowledge budget? | 64K tokens per reviewer, configurable. |
| Q-053 | Can an SME approve a pack? | SME drafts in domain; admin approves org-wide. |
