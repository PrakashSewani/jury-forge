# Architecture overview

> **Scope note (ADR-0023):** this is the target architecture, not the v1 build. V1 is the **trust
> loop** — Compose, GitHub App, provider, three built-in reviewers, diff + repository instructions,
> a verdict with dissent, a receipt, and a durable session. The repository graph and branch review
> are **v1.1**; the reviewer catalog, knowledge packs, OIDC, Helm, and GitLab are **v1.2**.

This is the target architecture for Jury Forge. It is **vendor-neutral and self-hosted first**. It
is deliberately independent of the PoC's Cloudflare runtime. The stack was accepted on 2026-11-16
([`technical-approach.md`](technical-approach.md), ADR-0026); where this overview and
technical-approach differ, technical-approach wins.

## One-page picture

```
                         ┌──────────────────────────────────────────────┐
                         │              Operator's infrastructure      │
                         │                                              │
  GitHub ──webhook──▶    │  ┌─────────────┐      ┌──────────────────┐  │
  GitHub ◀──publish──    │  │  app        │      │  worker          │  │
                         │  │  Web/API +  │      │  (jobs, turns,   │  │
  Browser ──HTTPS──▶     │  │  React SPA  │      │   cron)          │  │
                         │  └──────┬──────┘      └────────┬─────────┘  │
                         │         │ enqueue (same txn)   │            │
                         │         ▼                      ▼            │
                         │  ┌────────────────────────────────────────┐  │
                         │  │ PostgreSQL 17: data, queue             │  │
                         │  │ (graphile-worker), audit, artefacts    │  │
                         │  └────────────────────────────────────────┘  │
                         │                                              │
                         │  caddy (TLS) in front of app                 │
                         │  Optional: OTel collector, Prometheus        │
                         │  v1.1: code index (adjacency tables)         │
                         │  v1.2: S3 adapter, OIDC                      │
                         └──────────────────────────────────────────────┘
                                        │
                                        ▼
                         Model providers (operator-configured)
                         OpenAI-compatible · Anthropic-compatible · local
```

## Design stance

1. **A modular monolith for the control plane.** One web/API service, one worker service, one
   database. Not microservices. The boundaries are module seams (forge, provider, policy,
   pipeline), not network hops.
2. **The queue is the spine.** Every review is a durable job with a state machine, not a long
   request and not a named actor. Workers are stateless and replaceable.
3. **PostgreSQL is the only datastore.** It holds tenancy, configuration, sessions, turns, steps,
   findings, the queue, audit, idempotency records, and artefacts (raw diffs and model responses as
   bounded `bytea` with retention). An optional S3 adapter is v1.2 (ADR-0004, technical-approach §2).
4. **One codebase, one language.** TypeScript on Node.js 24 across web, API, worker, and CLI
   (ADR-0005). A CPU-heavy indexer (v1.1) can be extracted later behind an interface.
5. **Replaceable edges.** Forge, provider, queue, and (from v1.2) artefact store, notifier, and
   identity are interfaces with default implementations. No proprietary required service.
6. **Security is a pipeline property.** Trust labels, redaction, egress policy, grounding, and
   authorization live in code, not in prompts.

## Services (logical)

| Service | Responsibility | First implementation |
| ------- | -------------- | -------------------- |
| **Web/API** (`app`) | Auth, dashboard API, SPA, webhook ingress, admin endpoints | One container: Fastify API + static SPA |
| **Session service** | PR sessions, threads, messages, findings, turns, serialization | Modules shared by `app` and `worker` |
| **Review worker** (`worker`) | Consume jobs, run turns, call providers, publish | One container, 1–N replicas |
| **Turn runner** | The step pipeline: resolve, fetch, plan, review, ground, verify, chair, summarise, publish, evaluate | A thin, explicit runner; no harness (ADR-0010 as amended, technical-approach §3.4) |
| **Provider gateway** | Model catalog, encrypted keys, provider calls, usage/cost | A module on the `ai` SDK adapters |
| **Cron** | Reconciler, retention, stalled sessions, reaction poll, stuck-turn sweep, catalog refresh (technical-approach §3.3) | graphile-worker cron inside `worker`; no separate scheduler |
| **PostgreSQL** | Durable state, the queue, audit, sessions, artefacts | Bundled (Postgres 17) or operator-managed |
| **Reverse proxy** | TLS, host routing, security headers | Bundled Caddy with on-demand TLS, or the operator's proxy/LB |
| **Indexer** (v1.1) | Build and incrementally update the repository graph | Same image, the index worker queue |

A single-container "all-in-one" evaluation mode can bundle the app, the worker, and a local Postgres
after G1 (Q-030), but the reference deployment is Compose with separate services
([`deployment.md`](deployment.md)).

## Data flow

### Review (agentic session)

1. GitHub sends a webhook. The web/API verifies the HMAC on the raw body, inserts a
   `webhook_deliveries` row, and adds the job in one transaction (technical-approach §5.1).
2. The session service loads/creates the PR session and thread; turns are serialized per session
   (`queue_name = session:<id>`), and replies inside 30 s coalesce.
3. The turn runner plans the context within a token budget: the diff hunks (strict T0 in the MVP,
   T0+ enclosing-function expansion from v1), base-SHA instruction files, prior findings, and from
   v1 the linked issue and SARIF evidence. The graph is v1.1 branch review only.
4. Jurors call providers through the gateway; PR review runs no model tool loop. Redacted requests
   and responses are stored as artefacts in Postgres; parsed findings go to `session_findings`.
5. Code grounds every finding at the generation SHA; from v1 a non-voting verifier confirms it;
   the chair (code) merges by fingerprint and sets severity and agreement (ADR-0025).
6. The writer replies in the thread/PR through the per-installation write queue; in `auto`, the
   resolution guard may resolve a bot-owned thread after a satisfactory human response.
7. The turn completes; the session waits, resolves, or archives. Cron applies retention, flags
   stalled sessions, and fails turns stuck past 20 min.

### Setup

1. Operator installs, generates secrets, starts the stack, and enters the public origin in setup;
   the origin is stored, not read from a header (ADR-0021).
2. A bootstrap token authorizes the first owner.
3. The owner creates a GitHub App via the manifest flow; the app credentials are encrypted.
4. The owner installs the app; the installation is discovered or explicitly selected.
5. Repositories are imported for policy display; there is **no repo enable toggle** for agentic
   review. Automatic policy is config-as-code; manual review is available on installed repos.
6. The owner adds a provider key; the server fetches the model catalog; agents bind to catalog
   models only.

### Dashboard

The browser talks to the same origin (`/api/*`). Login is GitHub OAuth (OIDC is v1.2). All responses are
validated against shared schemas. The SPA is static and cacheable; the API is the only dynamic
surface.

## Boundaries and invariants

See [`agentic-review.md`](agentic-review.md) for the session/turn/routing/provider/graph architecture
that extends this document. A turn is the durable unit of work within a session; its steps are the
pipeline in [`job-pipeline.md`](job-pipeline.md).

- **Tenant boundary:** every row is scoped to an organisation/installation. A query without a
  tenant scope is a bug. The single-operator mode is a tenant with one member, not a special case.
- **Trust boundary:** PR content, repository files, packs, and provider output are untrusted. They
  never become instructions. The pipeline enforces this in code.
- **Egress boundary:** only the configured forge and provider endpoints are reachable, subject to
  the egress policy (the `local` provider exception is ADR-0030). No arbitrary URL fetch from user
  input.
- **Publish boundary:** a turn produces at most one review. Publishing is idempotent and
  generation-checked. A stale turn cannot overwrite a newer verdict.
- **Contract boundary:** one schema source; every API response is validated; the dashboard never
  casts.
- **Operational boundary:** every turn runs as a queue job with a timeout, a retry policy, and a
  terminal state; finished steps are stored and never redone. There are no immortal `running` rows.

## What is explicitly not in the architecture

- A per-run actor/object (the PoC's Durable Object model).
- A byte-budgeted prompt builder as the primary context strategy.
- A single "owner" bypass for authorization.
- A model-specific prompt path that cannot use structured output.
- A model call that decides finding identity, dedup, severity, the verdict, or a resolution (the
  chair and the guards are code; ADR-0025).
- A central control plane, telemetry endpoint, or licence server.

## Decision status

| Decision | Status | ADR |
| -------- | ------ | --- |
| Self-hosted, MIT, vendor-neutral | Accepted by owner directive | ADR-0001 |
| PoC is reference only | Accepted | ADR-0002 |
| Compose-first deployment | Accepted (Phase 1a) | ADR-0003 |
| PostgreSQL source of truth | Accepted (Phase 1a) | ADR-0004 |
| TypeScript-first runtime | Accepted (Phase 1a) | ADR-0005 |
| Queue + worker job model | Accepted (Phase 1a) | ADR-0006 |
| Token-aware context + retrieval | Accepted (G0) | ADR-0007 |
| Roles + trust boundaries | Accepted (G0) | ADR-0008 |
| Agent runtime harness | Accepted (Phase 1a, amended by ADR-0026): thin runner, no harness | ADR-0010 |
| Provider/model discovery | Accepted (G0) | ADR-0011 |
| PR sessions + `suggest` resolution (auto/off opt-in) | Accepted (G0) | ADR-0012 |
| Manual-first trigger + dynamic routing | Accepted (G0) | ADR-0013 |
| Diff-only PR review + branch review with incremental graph (v1.1) | Accepted (G0) | ADR-0014 |
| Session capacity, interface, roles, visibility | Accepted (G0) | ADR-0015 |
| Reviewer catalog, repo bindings, SME roles, fallback | Accepted (G0) | ADR-0016 |
| Knowledge sources, snapshots, grants, retrieval | Accepted (G0) | ADR-0017 |
| Release tiering, eval-first sequencing | Accepted (G0) | ADR-0018 |
| PR review T1 bounded reads | Rejected; T0+ accepted instead | ADR-0019, ADR-0025 |
| Conversation safety, finding identity, evidence-gated resolution | Accepted (G0) | ADR-0024 |
| v1 review pipeline: T0+, verifier, code-first chair, model roles | Accepted (G0) | ADR-0025 |
| v1 stack | Accepted (Phase 1a) | ADR-0026 |
| Instruction files: the S11 set from the base SHA | Accepted (2026-11-27) | ADR-0027 |
| v1 resolution rights | Accepted (2026-11-27) | ADR-0028 |
| Model capability probes | Accepted (2026-11-27) | ADR-0029 |
| Egress rule for local model servers | Accepted (2026-11-27) | ADR-0030 |
| Helm chart runtime shape (v1.2): the Compose roles, cron in `worker` | Accepted (2026-11-28) | ADR-0031 |
| Finding severity scale `critical`/`high`/`medium`/`low` | Accepted (2026-11-28) | ADR-0032 |
| Comment volume: no default noise budget, a fixed 50-comment ceiling | Accepted (2026-11-28) | ADR-0033 |
| ADR changes: frozen body, a new ADR amends or supersedes, a status-line pointer | Accepted (2026-11-28) | ADR-0034 |
| `org_id` on every tenant-owned table, composite foreign keys | Accepted (2026-11-28) | ADR-0035 |

Read next: [`agentic-review.md`](agentic-review.md) → [`components.md`](components.md) →
[`job-pipeline.md`](job-pipeline.md) → [`security.md`](security.md) →
[`ai-pipeline.md`](ai-pipeline.md).
