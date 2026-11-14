# Architecture overview

This is the target architecture for Jury Forge. It is **vendor-neutral and self-hosted first**. It
is deliberately independent of the PoC's Cloudflare runtime. The stack choices are proposed in
ADRs and require the owner's approval; the boundaries below are the durable part.

## One-page picture

```
                         ┌──────────────────────────────────────────────┐
                         │              Operator's infrastructure      │
                         │                                              │
  GitHub ──webhook──▶    │  ┌─────────────┐      ┌──────────────────┐  │
  GitHub ◀──publish──    │  │  Web/API    │      │  Review workers  │  │
                         │  │  (BFF)      │─────▶│  (queue consumers)│  │
  Browser ──HTTPS──▶     │  │  React SPA  │      │                  │  │
                         │  └──────┬──────┘      └────────┬─────────┘  │
                         │         │                      │            │
                         │         ▼                      ▼            │
                         │  ┌─────────────┐      ┌──────────────────┐  │
                         │  │ PostgreSQL  │      │  Object storage  │  │
                         │  │ (state)     │      │  (artefacts)     │  │
                         │  └─────────────┘      └──────────────────┘  │
                         │         │                      │            │
                         │         ▼                      ▼            │
                         │  ┌─────────────┐      ┌──────────────────┐  │
                         │  │ Queue       │      │  Code index      │  │
                         │  │ (durable)   │      │  (symbols, deps) │  │
                         │  └─────────────┘      └──────────────────┘  │
                         │                                              │
                         │  Optional: OTel collector, Prometheus,      │
                         │  reverse proxy, SSO, S3-compatible storage   │
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
3. **PostgreSQL is the source of truth.** It holds tenancy, configuration, runs, steps, findings,
   audit, and idempotency records. Object storage holds large artefacts (raw diffs, model
   responses, reports).
4. **One codebase, one language for v1.** TypeScript across web, API, workers, and indexer is the
   default recommendation because it reuses the contract discipline and the team's existing
   knowledge. A CPU-heavy indexer can be extracted later behind an interface.
5. **Replaceable edges.** Forge, provider, queue, object storage, notifier, and identity are
   interfaces with default implementations. No proprietary required service.
6. **Security is a pipeline property.** Trust labels, redaction, egress policy, grounding, and
   authorization live in code, not in prompts.

## Services (logical)

| Service | Responsibility | First implementation |
| ------- | -------------- | -------------------- |
| **Web/API** | Auth, dashboard API, SPA, webhook ingress, admin endpoints | One container: API + static SPA |
| **Session service** | PR sessions, threads, messages, findings, turns, serialization | Part of the API/worker modules |
| **Review worker** | Consume jobs, run turns/agents/tools, call providers, publish | One container, N replicas |
| **Agent runtime** | Graph/loop, agent selection, tools, chair, guardrails | LangGraph.js or a thin turn runner (ADR-0010) |
| **Provider gateway** | Model catalog, encrypted keys, provider calls, usage/cost | Shared module + worker calls |
| **Indexer** | Build and incrementally update the repository graph | Same image, separate queue/worker type |
| **Scheduler/janitor** | Lease expiry, retries, stuck-turn recovery, retention, budgets | A worker loop or a scheduled job |
| **PostgreSQL** | Durable state, queue (or an external queue), audit, sessions, graph | Operator-managed or bundled |
| **Object storage** | Raw diffs, model responses, reports, exports, graph blobs | Local volume or S3-compatible |
| **Reverse proxy** | TLS, host routing, security headers | Caddy/Traefik/Nginx; optional built-in |

A single-container "all-in-one" mode can bundle the web, worker, scheduler, and an embedded
Postgres-compatible store later, but the reference deployment is Compose with separate services.

## Data flow

### Review (agentic session)

1. GitHub sends a webhook. The web/API verifies it, persists a `webhook_event`, and enqueues a
   session turn in one transaction (transactional outbox).
2. The session service loads/creates the PR session and thread; turns are serialized per session.
3. The agent runtime plans, selects agents, and requests context from the graph, diff, instructions,
   packs, and prior findings within a token budget.
4. Agents call tools and providers through the gateway; raw responses go to object storage; parsed
   findings go to Postgres.
5. Grounding verifies every finding at the generation SHA; the chair de-duplicates and resolves
   disagreement.
6. The writer replies in the thread/PR; the resolution guard may resolve a bot-owned thread after a
   satisfactory human response.
7. The turn completes; the session waits, resolves, or archives. The janitor cleans leases and
   applies retention.

### Setup

1. Operator installs and configures `PUBLIC_URL`, secrets, database, and provider keys.
2. A bootstrap token authorizes the first owner.
3. The owner creates a GitHub App via the manifest flow; the app credentials are encrypted.
4. The owner installs the app; the installation is discovered or explicitly selected.
5. Repositories are imported for policy display; there is **no repo enable toggle** for agentic
   review. Automatic policy is config-as-code; manual review is available on installed repos.
6. The owner adds a provider key; the server fetches the model catalog; agents bind to catalog
   models only.

### Dashboard

The browser talks to the same origin (`/api/*`). Sessions use OIDC/GitHub OAuth. All responses are
validated against shared schemas. The SPA is static and cacheable; the API is the only dynamic
surface.

## Boundaries and invariants

See [`agentic-review.md`](agentic-review.md) for the session/turn/routing/provider/graph architecture
that extends this document. The original run/step pipeline remains the execution substrate; a turn
is a durable unit within a session.

- **Tenant boundary:** every row is scoped to an organisation/installation. A query without a
  tenant scope is a bug. The single-operator mode is a tenant with one member, not a special case.
- **Trust boundary:** PR content, repository files, packs, and provider output are untrusted. They
  never become instructions. The pipeline enforces this in code.
- **Egress boundary:** only the configured forge and provider endpoints are reachable, subject to
  the egress policy. No arbitrary URL fetch from user input.
- **Publish boundary:** a run produces at most one review. Publishing is idempotent and
  generation-checked. A stale run cannot overwrite a newer verdict.
- **Contract boundary:** one schema source; every API response is validated; the dashboard never
  casts.
- **Operational boundary:** every long-running operation has a lease, a heartbeat, a timeout, a
  retry policy, and a terminal state. There are no immortal `running` rows.

## What is explicitly not in the architecture

- A per-run actor/object (the PoC's Durable Object model).
- A byte-budgeted prompt builder as the primary context strategy.
- A single "owner" bypass for authorization.
- A model-specific prompt path that cannot use structured output or tools.
- A central control plane, telemetry endpoint, or licence server.

## Decision status

| Decision | Status | ADR |
| -------- | ------ | --- |
| Self-hosted, MIT, vendor-neutral | Accepted by owner directive | ADR-0001 |
| PoC is reference only | Accepted | ADR-0002 |
| Compose-first deployment | Proposed | ADR-0003 |
| PostgreSQL source of truth | Proposed | ADR-0004 |
| TypeScript-first runtime | Proposed | ADR-0005 |
| Queue + worker job model | Proposed | ADR-0006 |
| Token-aware context + retrieval | Proposed | ADR-0007 |
| Roles + trust boundaries | Proposed | ADR-0008 |
| Agent runtime harness | Proposed (spike) | ADR-0010 |
| Provider/model discovery | Proposed | ADR-0011 |
| PR sessions + agent-only resolution | Proposed | ADR-0012 |
| Manual-first trigger + dynamic routing | Proposed | ADR-0013 |
| Diff-first + incremental repo graph | Proposed | ADR-0014 |
| Session capacity, interface, roles, visibility | Proposed | ADR-0015 |

Read next: [`agentic-review.md`](agentic-review.md) → [`components.md`](components.md) →
[`job-pipeline.md`](job-pipeline.md) → [`security.md`](security.md) →
[`ai-pipeline.md`](ai-pipeline.md).
